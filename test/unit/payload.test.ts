import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode } from "../../src/base32";
import { parsePayload, PayloadError, serviceLabel, serviceTimeout } from "../../src/payload";

const KEY_00_1F = Uint8Array.from({ length: 32 }, (_, i) => i);
const ENROLL = "qrauth:1:e:alice@lfs-lab:AAAQEAYEAUDAOCAJBIFQYDIOB4IBCEQTCQKRMFYYDENBWHA5DYPQ:OCRA-1:HOTP-SHA256-6:QH40";
const CHALLENGE = "qrauth:1:c:alice@lfs-lab:login:b25a8062ea91212f9fed2d8fb91048db761c8bc1";

describe("base32 (RFC 4648)", () => {
  it.each([
    ["", ""], ["f", "MY"], ["fo", "MZXQ"], ["foo", "MZXW6"], ["foob", "MZXW6YQ"], ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ])("%s <-> %s", (plain, encoded) => {
    expect(base32Encode(new TextEncoder().encode(plain))).toBe(encoded);
    expect(new TextDecoder().decode(base32Decode(encoded))).toBe(plain);
    expect(new TextDecoder().decode(base32Decode(encoded.padEnd(Math.ceil(encoded.length / 8) * 8, "=")))).toBe(plain);
  });

  it("decodes the HANDOFF test key", () => {
    expect(base32Decode("AAAQEAYEAUDAOCAJBIFQYDIOB4IBCEQTCQKRMFYYDENBWHA5DYPQ")).toEqual(KEY_00_1F);
  });

  it("rejects bad input", () => {
    expect(() => base32Decode("MZXW6Y1")).toThrow();
    expect(() => base32Decode("A")).toThrow();
  });
});

describe("payloads", () => {
  it("parses the example challenge", () => {
    expect(parsePayload(CHALLENGE)).toEqual({
      kind: "challenge",
      account: "alice@lfs-lab",
      service: "login",
      challenge: "b25a8062ea91212f9fed2d8fb91048db761c8bc1",
    });
  });

  it("parses the example enrollment (the suite contains colons)", () => {
    const p = parsePayload(ENROLL);
    expect(p.kind).toBe("enrollment");
    if (p.kind !== "enrollment") return;
    expect(p.account).toBe("alice@lfs-lab");
    expect(p.suite).toBe("OCRA-1:HOTP-SHA256-6:QH40");
    expect(p.secret).toEqual(KEY_00_1F);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parsePayload(`  ${CHALLENGE}\n`).kind).toBe("challenge");
  });

  it.each([
    "https://example.com/",
    "qrauth:2:c:alice@lfs-lab:login:b25a8062ea91212f9fed2d8fb91048db761c8bc1",
    "qrauth:1:x:alice@lfs-lab:login:b25a8062ea91212f9fed2d8fb91048db761c8bc1",
    "qrauth:1:c:alice@lfs-lab:login:B25A8062EA91212F9FED2D8FB91048DB761C8BC1",
    "qrauth:1:c:alice@lfs-lab:login:b25a8062ea91212f9fed2d8fb91048db761c8bc",
    "qrauth:1:c:Alice@lfs-lab:login:b25a8062ea91212f9fed2d8fb91048db761c8bc1",
    "qrauth:1:c:alice:login:b25a8062ea91212f9fed2d8fb91048db761c8bc1",
    "qrauth:1:c:alice@lfs-lab:log in:b25a8062ea91212f9fed2d8fb91048db761c8bc1",
    "qrauth:1:e:alice@lfs-lab:aaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwha5dypq:OCRA-1:HOTP-SHA256-6:QH40",
    "",
  ])("rejects %j as not a qrauth code", (text) => {
    expect(() => parsePayload(text)).toThrow("Not a qrauth code.");
  });

  it("rejects another suite with a clear message", () => {
    expect(() => parsePayload(ENROLL.replace("HOTP-SHA256-6:QH40", "HOTP-SHA1-6:QN08"))).toThrow(/Unsupported suite/);
  });

  it("rejects a short or damaged secret", () => {
    expect(() => parsePayload("qrauth:1:e:alice@lfs-lab:MZXW6YTBOI:OCRA-1:HOTP-SHA256-6:QH40")).toThrow(PayloadError);
    expect(() => parsePayload("qrauth:1:e:alice@lfs-lab:A:OCRA-1:HOTP-SHA256-6:QH40")).toThrow(/damaged/);
  });

  it("describes services", () => {
    expect(serviceLabel("login")).toBe("Console login");
    expect(serviceLabel("sshd")).toBeNull();
    expect(serviceTimeout("qrauth-test")).toBe(30);
    expect(serviceTimeout("qrfetch")).toBe(120);
  });
});
