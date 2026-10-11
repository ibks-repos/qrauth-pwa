// QR decoding off the main thread with zxing-cpp (zxing-wasm). The .wasm file is served by the app itself;
// without the locateFile override the library would fetch it from a CDN.

import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? new URL(wasmUrl, self.location.href).href : prefix + path),
  },
});

export interface DecodeRequest {
  id: number;
  image: ImageData;
}

export interface DecodeResponse {
  id: number;
  texts?: string[];
  error?: string;
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { id, image } = event.data;
  let response: DecodeResponse;
  try {
    const results = await readBarcodes(image, {
      formats: ["QRCode"],
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      maxNumberOfSymbols: 4,
    });
    response = { id, texts: results.filter((r) => r.isValid).map((r) => r.text) };
  } catch (error) {
    response = { id, error: String(error) };
  }
  self.postMessage(response);
};
