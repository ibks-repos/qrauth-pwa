// Main-thread side of the decoder worker.

import type { DecodeRequest, DecodeResponse } from "./decoder.worker";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (texts: string[]) => void; reject: (error: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./decoder.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      if (event.data.error !== undefined) job.reject(new Error(event.data.error));
      else job.resolve(event.data.texts ?? []);
    };
    worker.onerror = (event) => {
      for (const job of pending.values()) job.reject(new Error(event.message || "decoder failed"));
      pending.clear();
    };
  }
  return worker;
}

/** Texts of all QR codes found in the image. */
export function decodeImageData(image: ImageData): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const request: DecodeRequest = { id, image };
    getWorker().postMessage(request, [image.data.buffer]);
  });
}

/** Start loading the decoder early, so that the first camera frame is decoded without delay. */
export function warmUp(): void {
  getWorker();
}

const MAX_SIDE = 1600;

/** Draw an image source scaled so that its longer side is at most `maxSide` and return its pixels. */
export function pixels(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide = MAX_SIDE,
): ImageData {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas is unavailable");
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Decode a photo or image file (HEIC and JPEG are decoded by the browser). */
export async function decodeFile(file: Blob): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  try {
    return await decodeImageData(pixels(bitmap, bitmap.width, bitmap.height, 2400));
  } finally {
    bitmap.close();
  }
}
