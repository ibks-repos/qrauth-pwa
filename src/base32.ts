// RFC 4648 base32. pam_qrauth writes the secret in upper case without padding.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(text: string): Uint8Array {
  const body = text.replace(/=+$/, "");
  // Lengths that no byte string encodes to (1, 3 or 6 characters in the last group).
  if ([1, 3, 6].includes(body.length % 8)) throw new Error("bad base32 length");
  const out = new Uint8Array(Math.floor((body.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const c of body) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) throw new Error("bad base32 character");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (value >>> bits) & 0xff;
    }
  }
  return out;
}

export function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
