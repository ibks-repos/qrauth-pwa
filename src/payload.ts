// qrauth payloads, version 1 (see HANDOFF.md of Lab 6).
//
//   challenge   qrauth:1:c:<user>@<host>:<service>:<40 lowercase hex digits>
//   enrollment  qrauth:1:e:<user>@<host>:<base32 secret, no padding>:<suite>

import { base32Decode } from "./base32";
import { SUITE } from "./ocra";

const ACCOUNT = String.raw`[a-z_][a-z0-9_.-]*@[A-Za-z0-9.-]+`;
const CHALLENGE = new RegExp(String.raw`^qrauth:1:c:(${ACCOUNT}):([A-Za-z0-9._-]+):([0-9a-f]{40})$`);
const ENROLLMENT = new RegExp(String.raw`^qrauth:1:e:(${ACCOUNT}):([A-Z2-7]+):(OCRA-1:[A-Z0-9:-]+)$`);

export interface Challenge {
  kind: "challenge";
  account: string;
  service: string;
  challenge: string;
}

export interface Enrollment {
  kind: "enrollment";
  account: string;
  secret: Uint8Array;
  suite: string;
}

export class PayloadError extends Error {}

export function parsePayload(text: string): Challenge | Enrollment {
  const payload = text.trim();
  let m = CHALLENGE.exec(payload);
  if (m) return { kind: "challenge", account: m[1], service: m[2], challenge: m[3] };
  m = ENROLLMENT.exec(payload);
  if (m) {
    if (m[3] !== SUITE) throw new PayloadError(`Unsupported suite ${m[3]}. This app supports ${SUITE} only.`);
    let secret: Uint8Array;
    try {
      secret = base32Decode(m[2]);
    } catch {
      throw new PayloadError("The enrollment code carries a damaged secret.");
    }
    if (secret.length < 16) throw new PayloadError("The enrollment code carries a secret shorter than 128 bits.");
    return { kind: "enrollment", account: m[1], secret, suite: m[3] };
  }
  throw new PayloadError("Not a qrauth code.");
}

const SERVICES: Record<string, string> = {
  login: "Console login",
  qrfetch: "Protected fastfetch",
  "qrauth-passwd": "Secret change confirmation",
  "qrauth-test": "Test service",
};

/** Human description of a PAM service, or null for services the app does not know. */
export function serviceLabel(service: string): string | null {
  return SERVICES[service] ?? null;
}

/** Lifetime of a challenge in seconds (module argument timeout; 30 s for the test service). */
export function serviceTimeout(service: string): number {
  return service === "qrauth-test" ? 30 : 120;
}
