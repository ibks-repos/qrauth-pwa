// Face ID protection through a passkey with the WebAuthn PRF extension.
//
// The passkey never authenticates to a server: the app uses it only as a local key derivation function that
// needs user verification (Face ID or the device passcode). The PRF output for a fixed salt is stable for one
// credential; HKDF turns it into an AES-GCM key that wraps the HMAC secrets of protected accounts.

const SALT = new TextEncoder().encode("qrauth-pwa prf salt v1");
const HKDF_INFO = new TextEncoder().encode("qrauth-pwa key encryption key v1");

export interface Passkey {
  credentialId: Uint8Array;
  created: string;
}

export interface PrfSupport {
  webauthn: boolean;
  platformAuthenticator: boolean;
  /** getClientCapabilities()["extension:prf"], or null when the browser does not report capabilities. */
  prfCapability: boolean | null;
}

function random(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size));
}

export async function prfSupport(): Promise<PrfSupport> {
  const webauthn = typeof PublicKeyCredential !== "undefined";
  if (!webauthn) return { webauthn, platformAuthenticator: false, prfCapability: null };
  const platformAuthenticator = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(
    () => false,
  );
  let prfCapability: boolean | null = null;
  const pkc = PublicKeyCredential as unknown as {
    getClientCapabilities?: () => Promise<Record<string, boolean>>;
  };
  if (pkc.getClientCapabilities) {
    const caps = await pkc.getClientCapabilities().catch(() => null);
    if (caps && "extension:prf" in caps) prfCapability = caps["extension:prf"];
  }
  return { webauthn, platformAuthenticator, prfCapability };
}

interface PrfResults {
  enabled?: boolean;
  results?: { first?: ArrayBuffer };
}

function prfResults(credential: PublicKeyCredential): PrfResults {
  return ((credential.getClientExtensionResults() as Record<string, unknown>).prf ?? {}) as PrfResults;
}

export interface CreatedPasskey extends Passkey {
  prfEnabled: boolean;
  /** Present when the authenticator already evaluated the PRF during registration. */
  prfOutput: Uint8Array | null;
}

/** Create the app's passkey. Fails when the user cancels or the platform has no authenticator. */
export async function createPasskey(userName: string): Promise<CreatedPasskey> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { id: location.hostname, name: "QRAuth" },
      user: { id: random(16) as BufferSource, name: userName, displayName: userName },
      challenge: random(32) as BufferSource,
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      attestation: "none",
      extensions: { prf: { eval: { first: SALT } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("No passkey was created.");
  const prf = prfResults(credential);
  const first = prf.results?.first;
  return {
    credentialId: new Uint8Array(credential.rawId),
    created: new Date().toISOString(),
    prfEnabled: prf.enabled === true || first !== undefined,
    prfOutput: first ? new Uint8Array(first) : null,
  };
}

/** Evaluate the PRF of the passkey; shows the Face ID sheet. */
export async function evaluatePrf(credentialId: Uint8Array): Promise<Uint8Array> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32) as BufferSource,
      rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: credentialId as BufferSource }],
      userVerification: "required",
      timeout: 60000,
      extensions: { prf: { eval: { first: SALT } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Face ID was cancelled.");
  const first = prfResults(credential).results?.first;
  if (!first) throw new Error("The passkey did not return a PRF value; Face ID protection is unavailable here.");
  return new Uint8Array(first);
}

/** AES-GCM key encryption key from a PRF output (non-extractable). */
export async function deriveKek(prfOutput: Uint8Array): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", prfOutput as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: HKDF_INFO },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** Short fingerprint of a PRF output for diagnostics (never the value itself). */
export async function fingerprint(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return Array.from(digest.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}
