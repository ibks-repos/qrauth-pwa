// Feasibility checks on the target iPhone (Home Screen web app): storage persistence, a non-extractable HMAC
// CryptoKey that survives a cold start, passkey PRF, live camera and photo decoding.
// The results are collected into a text report that can be copied.

import * as db from "./db";
import { compute, importHmacKey, computeWithKey, parseSuite, SUITE } from "./ocra";
import { createPasskey, evaluatePrf, fingerprint, prfSupport } from "./faceid";
import { CameraScanner } from "./scanner/camera";
import { decodeFile, warmUp } from "./scanner/decoder";

const TEST_KEY = Uint8Array.from({ length: 32 }, (_, i) => i);
const TEST_CHALLENGE = "0123456789abcdef0123456789abcdef01234567";
const TEST_RESPONSE = "075000";

const report = new Map<string, string>();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function set(key: string, value: string): void {
  report.set(key, value);
  render();
}

function render(): void {
  $("report").textContent = [...report].map(([k, v]) => `${k}: ${v}`).join("\n");
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function environment(): Promise<void> {
  set("version", `${__BUILD_VERSION__} ${__BUILD_DATE__}`);
  set("userAgent", navigator.userAgent);
  set("standalone", `display-mode standalone=${matchMedia("(display-mode: standalone)").matches}, ` +
    `navigator.standalone=${(navigator as unknown as { standalone?: boolean }).standalone}`);
  set("secureContext", String(isSecureContext));
  const launches = ((await db.get<number>("settings", "spike.launches")) ?? 0) + 1;
  await db.put("settings", launches, "spike.launches");
  const first = (await db.get<string>("settings", "spike.firstLaunch")) ?? new Date().toISOString();
  await db.put("settings", first, "spike.firstLaunch");
  set("launches", `${launches} (first ${first})`);
}

async function storage(): Promise<void> {
  try {
    const before = await navigator.storage.persisted();
    const granted = await navigator.storage.persist();
    const estimate = await navigator.storage.estimate();
    set("storage", `persisted before=${before}, persist()=${granted}, usage=${estimate.usage}, quota=${estimate.quota}`);
  } catch (error) {
    set("storage", errorText(error));
  }
}

async function cryptoKeyCheck(): Promise<void> {
  try {
    const vector = await compute(SUITE, TEST_KEY, TEST_CHALLENGE);
    set("ocra", `vector ${vector} ${vector === TEST_RESPONSE ? "OK" : "FAIL"}`);
    let stored = await db.get<{ key: CryptoKey; saved: string }>("settings", "spike.key");
    let origin = "loaded from IndexedDB";
    if (!stored) {
      stored = { key: await importHmacKey(TEST_KEY, "SHA-256"), saved: new Date().toISOString() };
      await db.put("settings", stored, "spike.key");
      origin = "stored now; relaunch the app to check that it survives";
    }
    const code = await computeWithKey(parseSuite(SUITE), stored.key, TEST_CHALLENGE);
    let exportable = "export refused";
    try {
      await crypto.subtle.exportKey("raw", stored.key);
      exportable = "EXPORTED (unexpected)";
    } catch {
      // expected for a non-extractable key
    }
    set("cryptoKey", `${origin} (saved ${stored.saved}), extractable=${stored.key.extractable}, ${exportable}, ` +
      `code ${code} ${code === TEST_RESPONSE ? "OK" : "FAIL"}`);
  } catch (error) {
    set("cryptoKey", errorText(error));
  }
}

async function prfCapabilities(): Promise<void> {
  try {
    const s = await prfSupport();
    set("prfSupport", `webauthn=${s.webauthn}, platformAuthenticator=${s.platformAuthenticator}, ` +
      `getClientCapabilities extension:prf=${s.prfCapability}`);
    const passkey = await db.get<{ id: Uint8Array; fp: string | null }>("settings", "spike.passkey");
    set("passkey", passkey ? `stored, PRF fingerprint at creation or first get: ${passkey.fp}` : "none");
  } catch (error) {
    set("prfSupport", errorText(error));
  }
}

async function createSpikePasskey(): Promise<void> {
  try {
    const created = await createPasskey("QRAuth spike test");
    const fp = created.prfOutput ? await fingerprint(created.prfOutput) : null;
    await db.put("settings", { id: created.credentialId, fp }, "spike.passkey");
    set("prfCreate", `created, prf.enabled=${created.prfEnabled}, output at create=${fp ?? "none"}`);
  } catch (error) {
    set("prfCreate", errorText(error));
  }
}

async function getSpikePrf(): Promise<void> {
  try {
    const passkey = await db.get<{ id: Uint8Array; fp: string | null }>("settings", "spike.passkey");
    if (!passkey) throw new Error("create the passkey first");
    const fp = await fingerprint(await evaluatePrf(passkey.id));
    if (!passkey.fp) await db.put("settings", { ...passkey, fp }, "spike.passkey");
    const same = passkey.fp ? (passkey.fp === fp ? "same as stored" : `DIFFERENT from stored ${passkey.fp}`) : "first value";
    set("prfGet", `output fingerprint ${fp} (${same})`);
  } catch (error) {
    set("prfGet", errorText(error));
  }
}

let scanner: CameraScanner | null = null;
let cameraStarts = 0;

async function toggleCamera(): Promise<void> {
  const video = $<HTMLVideoElement>("video");
  scanner ??= new CameraScanner(
    video,
    (texts) => set("cameraDecoded", `${new Date().toLocaleTimeString()} ${texts.join(" | ")}`),
    (error) => set("cameraError", errorText(error)),
  );
  if (scanner.active) {
    scanner.stop();
    $("camera").textContent = "Start camera";
    return;
  }
  try {
    const t0 = performance.now();
    await scanner.start();
    cameraStarts++;
    const s = scanner.settings();
    set("camera", `start #${cameraStarts} in ${Math.round(performance.now() - t0)} ms, track ${s?.width}x${s?.height} ` +
      `facing=${s?.facingMode}, video ${video.videoWidth}x${video.videoHeight}, screen.orientation=${screen.orientation?.type}`);
    $("camera").textContent = "Stop camera";
  } catch (error) {
    set("camera", errorText(error));
  }
}

async function photo(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const t0 = performance.now();
    const texts = await decodeFile(file);
    set("photo", `${file.type} ${file.size} B, ${Math.round(performance.now() - t0)} ms: ${texts.join(" | ") || "no QR code"}`);
  } catch (error) {
    set("photo", errorText(error));
  }
}

async function main(): Promise<void> {
  warmUp();
  $("passkeyCreate").onclick = () => void createSpikePasskey();
  $("passkeyGet").onclick = () => void getSpikePrf();
  $("camera").onclick = () => void toggleCamera();
  $<HTMLInputElement>("photoInput").onchange = (e) => void photo(e);
  $("copy").onclick = () =>
    void navigator.clipboard.writeText($("report").textContent ?? "").then(
      () => ($("copy").textContent = "Copied"),
      (error) => set("clipboard", errorText(error)),
    );
  $("reset").onclick = async () => {
    for (const key of ["spike.key", "spike.passkey", "spike.launches", "spike.firstLaunch"]) await db.remove("settings", key);
    location.reload();
  };
  await environment();
  await storage();
  await cryptoKeyCheck();
  await prfCapabilities();
}

void main();
