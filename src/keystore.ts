// Accounts and their secrets.
//
// protection "device": the secret is imported straight into a non-extractable WebCrypto HMAC key and the CryptoKey
// object is stored in IndexedDB. Script code, including this app, can use it but never read its bytes.
// protection "faceid": the secret is wrapped with AES-GCM under the KEK from the passkey PRF (additional data:
// the account name); only {iv, ciphertext} is stored. Answering needs Face ID, which unwraps it into a
// non-extractable key in memory.
// The raw secret exists in memory only between scanning and storing; the buffer is zeroed afterwards.

import * as db from "./db";
import { computeWithKey, importHmacKey, parseSuite } from "./ocra";
import type { Challenge, Enrollment } from "./payload";
import { getKek } from "./session";

export type Protection = "device" | "faceid";

export interface AccountInfo {
  account: string;
  suite: string;
  added: string;
  protection: Protection;
}

interface AccountRecord extends AccountInfo {
  key?: CryptoKey;
  wrapped?: { iv: Uint8Array; data: ArrayBuffer };
}

export class UnknownAccountError extends Error {
  constructor(readonly account: string) {
    super(`No secret for ${account}.`);
  }
}

function aad(account: string): Uint8Array {
  return new TextEncoder().encode(`qrauth-pwa account ${account}`);
}

function info({ account, suite, added, protection }: AccountRecord): AccountInfo {
  return { account, suite, added, protection };
}

export async function listAccounts(): Promise<AccountInfo[]> {
  const records = await db.getAll<AccountRecord>("accounts");
  return records.map(info).sort((a, b) => a.account.localeCompare(b.account));
}

export async function getAccount(account: string): Promise<AccountInfo | undefined> {
  const record = await db.get<AccountRecord>("accounts", account);
  return record && info(record);
}

/** Store the secret of an enrollment code; replaces an existing account. Zeroes the secret buffer. */
export async function enroll(enrollment: Enrollment, protection: Protection): Promise<AccountInfo> {
  const { account, suite, secret } = enrollment;
  const hash = parseSuite(suite).hash;
  try {
    const record: AccountRecord = { account, suite, added: new Date().toISOString(), protection };
    if (protection === "device") {
      record.key = await importHmacKey(secret, hash, false);
    } else {
      const kek = await getKek();
      const key = await importHmacKey(secret, hash, true);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.wrapKey("raw", key, kek, {
        name: "AES-GCM",
        iv: iv as BufferSource,
        additionalData: aad(account) as BufferSource,
      });
      record.wrapped = { iv, data };
    }
    await db.put("accounts", record);
    return info(record);
  } finally {
    secret.fill(0);
  }
}

/** The response to a challenge. Accounts with Face ID protection may show the Face ID sheet. */
export async function respond(challenge: Challenge): Promise<string> {
  const record = await db.get<AccountRecord>("accounts", challenge.account);
  if (!record) throw new UnknownAccountError(challenge.account);
  const suite = parseSuite(record.suite);
  let key: CryptoKey;
  if (record.protection === "device" && record.key) {
    key = record.key;
  } else if (record.protection === "faceid" && record.wrapped) {
    key = await crypto.subtle.unwrapKey(
      "raw",
      record.wrapped.data,
      await getKek(),
      { name: "AES-GCM", iv: record.wrapped.iv as BufferSource, additionalData: aad(record.account) as BufferSource },
      { name: "HMAC", hash: suite.hash },
      false,
      ["sign"],
    );
  } else {
    throw new Error(`The stored secret of ${record.account} is damaged; enroll the account again.`);
  }
  return computeWithKey(suite, key, challenge.challenge);
}

export async function removeAccount(account: string): Promise<void> {
  await db.remove("accounts", account);
}
