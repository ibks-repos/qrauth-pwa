// OCRA against the vectors of HANDOFF.md (pam_qrauth suite) and RFC 6287 appendix C (one-way).

import { describe, expect, it } from "vitest";
import { bytesToHex, challengeBytes, compute, dataInput, parseSuite, SUITE } from "../../src/ocra";

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));
const KEY_00_1F = Uint8Array.from({ length: 32 }, (_, i) => i);
const KEY20 = hex("3132333435363738393031323334353637383930");
const KEY32 = hex("3132333435363738393031323334353637383930313233343536373839303132");
const KEY64 = hex("31323334353637383930".repeat(6) + "31323334");
const PIN_SHA1 = hex("7110eda4d09e062aa5e4a390b0a572ac0d2c0220");

describe("pam_qrauth suite (HANDOFF.md)", () => {
  it.each([
    ["0000000000000000000000000000000000000000", "354116"],
    ["0123456789abcdef0123456789abcdef01234567", "075000"],
    ["ffffffffffffffffffffffffffffffffffffffff", "345919"],
    ["b25a8062ea91212f9fed2d8fb91048db761c8bc1", "606441"],
  ])("%s -> %s", async (challenge, expected) => {
    expect(await compute(SUITE, KEY_00_1F, challenge)).toBe(expected);
  });

  it("full HMAC of the second vector", async () => {
    const suite = parseSuite(SUITE);
    const data = dataInput(suite, "0123456789abcdef0123456789abcdef01234567");
    expect(data.length).toBe(154);
    const key = await crypto.subtle.importKey("raw", KEY_00_1F as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, data as BufferSource));
    expect(bytesToHex(mac)).toBe("e5866406fa948011529720699af5afddf3b895f0ab9fa472f7db49a87d853dce");
  });

  it("cross-check values of the C test", async () => {
    expect(await compute(SUITE, KEY_00_1F, "abcde")).toBe("106256");
    expect(await compute("OCRA-1:HOTP-SHA1-6:QN08", KEY20, "0291")).toBe("586032");
  });

  it("pads a hex challenge to 128 bytes", () => {
    const q = challengeBytes("H", "0123456789abcdef0123456789ABCDEF01234567");
    expect(q.length).toBe(128);
    expect(bytesToHex(q.slice(0, 20))).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(q.slice(20).every((b) => b === 0)).toBe(true);
  });
});

type Vector = [string, Uint8Array, Parameters<typeof compute>[3], string, string];

const ONE_WAY: Vector[] = [
  ...(
    [
      ["00000000", "237653"], ["11111111", "243178"], ["22222222", "653583"], ["33333333", "740991"],
      ["44444444", "608993"], ["55555555", "388898"], ["66666666", "816933"], ["77777777", "224598"],
      ["88888888", "750600"], ["99999999", "294470"],
    ] as const
  ).map(([q, r]): Vector => ["OCRA-1:HOTP-SHA1-6:QN08", KEY20, {}, q, r]),
  ...(
    [
      [0, "65347737"], [1, "86775851"], [2, "78192410"], [3, "71565254"], [4, "10104329"],
      [5, "65983500"], [6, "70069104"], [7, "91771096"], [8, "75011558"], [9, "08522129"],
    ] as const
  ).map(([c, r]): Vector => [
    "OCRA-1:HOTP-SHA256-8:C-QN08-PSHA1", KEY32, { counter: BigInt(c), pinHash: PIN_SHA1 }, "12345678", r,
  ]),
  ...(
    [
      ["00000000", "83238735"], ["11111111", "01501458"], ["22222222", "17957585"],
      ["33333333", "86776967"], ["44444444", "86807031"],
    ] as const
  ).map(([q, r]): Vector => ["OCRA-1:HOTP-SHA256-8:QN08-PSHA1", KEY32, { pinHash: PIN_SHA1 }, q, r]),
  ...(
    [
      [0, "00000000", "07016083"], [1, "11111111", "63947962"], [2, "22222222", "70123924"],
      [3, "33333333", "25341727"], [4, "44444444", "33203315"], [5, "55555555", "34205738"],
      [6, "66666666", "44343969"], [7, "77777777", "51946085"], [8, "88888888", "20403879"],
      [9, "99999999", "31409299"],
    ] as const
  ).map(([c, q, r]): Vector => ["OCRA-1:HOTP-SHA512-8:C-QN08", KEY64, { counter: BigInt(c) }, q, r]),
  ...(
    [
      ["00000000", "95209754"], ["11111111", "55907591"], ["22222222", "22048402"],
      ["33333333", "24218844"], ["44444444", "36209546"],
    ] as const
  ).map(([q, r]): Vector => ["OCRA-1:HOTP-SHA512-8:QN08-T1M", KEY64, { timestamp: 0x132d0b6n }, q, r]),
];

describe("RFC 6287 appendix C, one-way", () => {
  it("has 40 vectors", () => expect(ONE_WAY.length).toBe(40));
  it.each(ONE_WAY)("%s q=%s", async (suite, key, inputs, question, expected) => {
    expect(await compute(suite, key, question, inputs)).toBe(expected);
  });
});

describe("suite parser", () => {
  it.each([
    "OCRA-2:HOTP-SHA1-6:QN08",
    "OCRA-1:HOTP-MD5-6:QN08",
    "OCRA-1:HOTP-SHA1-3:QN08",
    "OCRA-1:HOTP-SHA1-6:QX08",
    "OCRA-1:HOTP-SHA1-6:QN99",
    "OCRA-1:HOTP-SHA1-6",
  ])("rejects %s", (text) => {
    expect(() => parseSuite(text)).toThrow();
  });

  it("parses the pam_qrauth suite", () => {
    expect(parseSuite(SUITE)).toMatchObject({ hash: "SHA-256", digits: 6, qFormat: "H", qLength: 40, counter: false });
  });

  it("rejects a challenge outside 4..qLength", async () => {
    await expect(compute(SUITE, KEY_00_1F, "abc")).rejects.toThrow();
    await expect(compute(SUITE, KEY_00_1F, "0".repeat(41))).rejects.toThrow();
  });
});
