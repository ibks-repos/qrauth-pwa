// OCRA, the OATH challenge-response algorithm (RFC 6287), on WebCrypto.
//
// The parser covers the whole suite syntax (counter C, challenge formats QA/QN/QH, PIN hash P, session S,
// timestamp T) so that the RFC test vectors can be checked; the app itself accepts only SUITE.
// Port of client/ocra.py; src/pam_qrauth/ocra.c is the server side.

export const SUITE = "OCRA-1:HOTP-SHA256-6:QH40";

export type HashName = "SHA-1" | "SHA-256" | "SHA-512";

const HASHES: Record<string, { name: HashName; size: number }> = {
  SHA1: { name: "SHA-1", size: 20 },
  SHA256: { name: "SHA-256", size: 32 },
  SHA512: { name: "SHA-512", size: 64 },
};
const TIME_STEPS: Record<string, number> = { S: 1, M: 60, H: 3600 };

export interface Suite {
  text: string;
  hash: HashName;
  digits: number;
  counter: boolean;
  qFormat: "A" | "N" | "H";
  qLength: number;
  pinHashSize: number | null;
  sessionLength: number | null;
  timeStep: number | null;
}

export interface Inputs {
  counter?: bigint;
  pinHash?: Uint8Array;
  session?: Uint8Array;
  timestamp?: bigint;
}

export function parseSuite(text: string): Suite {
  const parts = text.split(":");
  if (parts.length !== 3 || parts[0] !== "OCRA-1") throw new Error(`unsupported OCRA suite: ${text}`);
  const crypto = /^HOTP-(SHA1|SHA256|SHA512)-(\d+)$/.exec(parts[1]);
  if (!crypto) throw new Error(`bad crypto function: ${parts[1]}`);
  const digits = Number(crypto[2]);
  if (digits !== 0 && (digits < 4 || digits > 10)) throw new Error(`bad truncation length: ${digits}`);
  const suite: Suite = {
    text,
    hash: HASHES[crypto[1]].name,
    digits,
    counter: false,
    qFormat: "N",
    qLength: 8,
    pinHashSize: null,
    sessionLength: null,
    timeStep: null,
  };
  for (const item of parts[2].split("-")) {
    let m: RegExpExecArray | null;
    if (item === "C") {
      suite.counter = true;
    } else if ((m = /^Q([ANH])(\d\d)$/.exec(item))) {
      suite.qFormat = m[1] as Suite["qFormat"];
      suite.qLength = Number(m[2]);
      if (suite.qLength < 4 || suite.qLength > 64) throw new Error(`bad challenge length: ${item}`);
    } else if ((m = /^P(SHA1|SHA256|SHA512)$/.exec(item))) {
      suite.pinHashSize = HASHES[m[1]].size;
    } else if ((m = /^S(\d\d\d)$/.exec(item))) {
      suite.sessionLength = Number(m[1]);
    } else if ((m = /^T(\d+)([SMH])$/.exec(item))) {
      suite.timeStep = Number(m[1]) * TIME_STEPS[m[2]];
    } else {
      throw new Error(`bad data input item: ${item}`);
    }
  }
  return suite;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Q as 128 bytes, right-padded with zeros, following the RFC reference code. */
export function challengeBytes(format: Suite["qFormat"], question: string): Uint8Array {
  let hex: string;
  if (format === "N") {
    if (!/^\d+$/.test(question)) throw new Error("numeric challenge expected");
    hex = BigInt(question).toString(16).toUpperCase();
  } else if (format === "H") {
    if (!/^[0-9A-Fa-f]+$/.test(question)) throw new Error("hexadecimal challenge expected");
    hex = question;
  } else {
    if (!/^[\x20-\x7e]+$/.test(question)) throw new Error("ASCII challenge expected");
    hex = bytesToHex(new TextEncoder().encode(question));
  }
  if (hex.length > 256) throw new Error("challenge too long");
  return hexToBytes(hex.padEnd(256, "0"));
}

function uint64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value);
  return out;
}

function leftPad(bytes: Uint8Array, size: number): Uint8Array {
  if (bytes.length > size) throw new Error("input too long");
  const out = new Uint8Array(size);
  out.set(bytes, size - bytes.length);
  return out;
}

export function dataInput(suite: Suite, question: string, inputs: Inputs = {}): Uint8Array {
  const parts: Uint8Array[] = [new TextEncoder().encode(suite.text), new Uint8Array(1)];
  if (suite.counter) parts.push(uint64(inputs.counter ?? 0n));
  parts.push(challengeBytes(suite.qFormat, question));
  if (suite.pinHashSize) parts.push(leftPad(inputs.pinHash ?? new Uint8Array(), suite.pinHashSize));
  if (suite.sessionLength) parts.push(leftPad(inputs.session ?? new Uint8Array(), suite.sessionLength));
  if (suite.timeStep) parts.push(uint64(inputs.timestamp ?? 0n));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** HOTP dynamic truncation (RFC 4226 section 5.3). */
export function truncate(mac: Uint8Array, digits: number): string {
  const offset = mac[mac.length - 1] & 0x0f;
  const value =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(value % 10 ** digits).padStart(digits, "0");
}

export function importHmacKey(
  secret: Uint8Array,
  hash: HashName,
  extractable = false,
): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash }, extractable, ["sign"]);
}

/** Response for a key that is already a WebCrypto HMAC key with the suite's hash. */
export async function computeWithKey(
  suite: Suite,
  key: CryptoKey,
  question: string,
  inputs: Inputs = {},
): Promise<string> {
  if (question.length < 4 || question.length > suite.qLength) {
    throw new Error(`challenge length must be 4..${suite.qLength}`);
  }
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, dataInput(suite, question, inputs) as BufferSource));
  return suite.digits === 0 ? bytesToHex(mac) : truncate(mac, suite.digits);
}

export async function compute(
  suiteText: string,
  secret: Uint8Array,
  question: string,
  inputs: Inputs = {},
): Promise<string> {
  const suite = parseSuite(suiteText);
  return computeWithKey(suite, await importHmacKey(secret, suite.hash), question, inputs);
}
