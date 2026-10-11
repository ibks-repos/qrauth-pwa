// zxing-wasm (the decoder of the app) against QR images: CoreImage-generated fixtures and QR codes rendered from
// pam_qrauth terminal output. Runs in Node with the same .wasm file that the app serves.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

const require = createRequire(import.meta.url);
prepareZXingModule({
  overrides: { wasmBinary: readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer },
  fireImmediately: true,
});

async function decode(path: string): Promise<string[]> {
  const bytes = readFileSync(new URL(path, import.meta.url));
  const results = await readBarcodes(new Blob([bytes]), { formats: ["QRCode"], tryHarder: true });
  return results.filter((r) => r.isValid).map((r) => r.text);
}

describe("decoder", () => {
  it("reads the example enrollment", async () => {
    expect(await decode("../fixtures/enroll-example.png")).toEqual([
      "qrauth:1:e:alice@lfs-lab:AAAQEAYEAUDAOCAJBIFQYDIOB4IBCEQTCQKRMFYYDENBWHA5DYPQ:OCRA-1:HOTP-SHA256-6:QH40",
    ]);
  });

  it("reads the example challenge", async () => {
    expect(await decode("../fixtures/challenge-example.png")).toEqual([
      "qrauth:1:c:alice@lfs-lab:login:b25a8062ea91212f9fed2d8fb91048db761c8bc1",
    ]);
  });

  it("reads a challenge rendered from pam_qrauth terminal output (half blocks, 2-module quiet zone)", async () => {
    expect(await decode("../fixtures/terminal-challenge.png")).toEqual([
      "qrauth:1:c:alice@lfs-lab:login:8ad9fe04a5331ebe3847d65b6b9b1f4a4ba74498",
    ]);
  });

  it("reads a code that is not a qrauth code", async () => {
    expect(await decode("../fixtures/not-qrauth.png")).toEqual(["https://example.com/"]);
  });
});
