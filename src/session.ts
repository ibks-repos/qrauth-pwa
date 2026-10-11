// The app's passkey and the key encryption key (KEK) derived from it.
//
// The KEK is kept in memory for a short time after Face ID, so that an enrollment and the confirmation challenge
// that follows it need one Face ID only; it is dropped when the app goes to the background.
// A key check value (a constant encrypted under the KEK at setup) detects a PRF output of another passkey.

import * as db from "./db";
import { createPasskey, deriveKek, evaluatePrf } from "./faceid";

const KEK_LIFETIME_MS = 60_000;
const CHECK_PLAINTEXT = new TextEncoder().encode("qrauth-pwa key check");

export interface PasskeySettings {
  credentialId: Uint8Array;
  created: string;
  checkIv: Uint8Array;
  check: ArrayBuffer;
  /** Protect newly enrolled accounts with Face ID. */
  useForNewAccounts: boolean;
}

let cached: { kek: CryptoKey; until: number } | null = null;

export function forgetKek(): void {
  cached = null;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") forgetKek();
  });
}

export function getPasskey(): Promise<PasskeySettings | undefined> {
  return db.get<PasskeySettings>("settings", "passkey");
}

export async function setUseForNewAccounts(value: boolean): Promise<void> {
  const passkey = await getPasskey();
  if (passkey) await db.put("settings", { ...passkey, useForNewAccounts: value }, "passkey");
}

export function hasFreshKek(): boolean {
  return cached !== null && cached.until > Date.now();
}

let pendingCredential: { credentialId: Uint8Array; created: string } | null = null;

/**
 * Create the passkey and remember it. Must run in a user gesture. When the platform does not evaluate the PRF
 * during registration, a second Face ID is needed: the result is "confirm" and the UI calls confirmFaceIdSetup()
 * from another tap (WebKit allows one WebAuthn request per user gesture).
 */
export async function setUpFaceId(): Promise<"done" | "confirm"> {
  const created = await createPasskey("QRAuth secrets");
  if (!created.prfOutput) {
    if (!created.prfEnabled) throw new Error("This passkey does not support the PRF extension; Face ID protection is unavailable.");
    pendingCredential = { credentialId: created.credentialId, created: created.created };
    return "confirm";
  }
  await finishSetup(created.credentialId, created.created, created.prfOutput);
  return "done";
}

export async function confirmFaceIdSetup(): Promise<void> {
  if (!pendingCredential) throw new Error("Start the Face ID setup again.");
  const { credentialId, created } = pendingCredential;
  await finishSetup(credentialId, created, await evaluatePrf(credentialId));
  pendingCredential = null;
}

async function finishSetup(credentialId: Uint8Array, created: string, prf: Uint8Array): Promise<void> {
  const kek = await deriveKek(prf);
  prf.fill(0);
  const checkIv = crypto.getRandomValues(new Uint8Array(12));
  const check = await crypto.subtle.encrypt({ name: "AES-GCM", iv: checkIv as BufferSource }, kek, CHECK_PLAINTEXT);
  const settings: PasskeySettings = { credentialId, created, checkIv, check, useForNewAccounts: true };
  await db.put("settings", settings, "passkey");
  cached = { kek, until: Date.now() + KEK_LIFETIME_MS };
}

/** The KEK, from memory or after Face ID. Must run in a user gesture when nothing is cached. */
export async function getKek(): Promise<CryptoKey> {
  if (cached && cached.until > Date.now()) return cached.kek;
  const passkey = await getPasskey();
  if (!passkey) throw new Error("Face ID is not set up.");
  const prf = await evaluatePrf(passkey.credentialId);
  const kek = await deriveKek(prf);
  prf.fill(0);
  try {
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: passkey.checkIv as BufferSource }, kek, passkey.check);
  } catch {
    throw new Error("This passkey does not match the one QRAuth was set up with.");
  }
  cached = { kek, until: Date.now() + KEK_LIFETIME_MS };
  return kek;
}
