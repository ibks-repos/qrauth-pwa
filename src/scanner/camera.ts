// Live camera scanning with getUserMedia.
//
// Known WebKit behaviour of Home Screen web apps: a change of the URL hash revokes the camera permission, so the
// app never changes the URL; on iOS 26 the stream can come out rotated, which does not matter for QR decoding.

import { decodeImageData, pixels } from "./decoder";

const FRAME_INTERVAL_MS = 120;
const FRAME_MAX_SIDE = 1280;

export class CameraScanner {
  private stream: MediaStream | null = null;
  private running = false;
  private timer = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onTexts: (texts: string[]) => void,
    private readonly onError: (error: Error) => void = () => {},
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute("playsinline", "");
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  get active(): boolean {
    return this.running;
  }

  /** Track settings for diagnostics. */
  settings(): MediaTrackSettings | null {
    return this.stream?.getVideoTracks()[0]?.getSettings() ?? null;
  }

  private schedule(): void {
    if (!this.running) return;
    this.timer = window.setTimeout(() => void this.tick(), FRAME_INTERVAL_MS);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    const { videoWidth: w, videoHeight: h } = this.video;
    if (w > 0 && h > 0) {
      try {
        const texts = await decodeImageData(pixels(this.video, w, h, FRAME_MAX_SIDE));
        if (this.running && texts.length) this.onTexts(texts);
      } catch (error) {
        this.onError(error as Error);
      }
    }
    this.schedule();
  }
}
