// Full-screen scanner: live camera, with a photo taken by the system camera and pasted text as fallbacks.

import { parsePayload, PayloadError, type Challenge, type Enrollment } from "../payload";
import { CameraScanner } from "../scanner/camera";
import { decodeFile } from "../scanner/decoder";
import { h } from "./dom";
import { icon } from "./icons";
import { openSheet, showAlert } from "./overlay";

export type Payload = Challenge | Enrollment;

interface ScanOptions {
  hint: string;
  onPayload: (payload: Payload) => void;
}

let open = false;

/** First qrauth payload among decoded texts; the error of the first text when none is one. */
function pick(texts: string[]): { payload?: Payload; error?: string } {
  let error: string | undefined;
  for (const text of texts) {
    try {
      return { payload: parsePayload(text) };
    } catch (e) {
      error ??= e instanceof PayloadError ? e.message : String(e);
    }
  }
  return { error };
}

function cameraErrorText(error: unknown): string {
  const name = (error as DOMException)?.name;
  if (name === "NotAllowedError") {
    return "Camera access is not allowed. Allow it in Settings > Apps > Safari > Camera, or use a photo or pasted text.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found.";
  if (!navigator.mediaDevices?.getUserMedia) return "This browser offers no camera access here.";
  return `The camera could not start (${name || String(error)}).`;
}

export function openScanner({ hint, onPayload }: ScanOptions): void {
  if (open) return;
  open = true;

  const video = h("video", { playsinline: true, muted: true, autoplay: true, "aria-hidden": "true" });
  const hintEl = h("div", { class: "hint glass clear", role: "status", "aria-live": "polite" }, hint);
  const errorEl = h("p", { class: "camera-error hidden" });
  const fileInput = h("input", {
    type: "file",
    accept: "image/*",
    capture: "environment",
    class: "visually-hidden",
    tabindex: "-1",
    "aria-hidden": "true",
  });
  const root = h(
    "section",
    { class: "scanner", role: "dialog", "aria-modal": "true", "aria-label": "Scan a QR code" },
    video,
    h(
      "div",
      { class: "viewfinder", "aria-hidden": "true" },
      h("span", { class: "corner tl" }),
      h("span", { class: "corner tr" }),
      h("span", { class: "corner bl" }),
      h("span", { class: "corner br" }),
    ),
    errorEl,
    h(
      "div",
      { class: "top" },
      h("button", { class: "circle-button glass clear press", "aria-label": "Close", onclick: () => close() }, icon("close")),
      hintEl,
    ),
    h(
      "div",
      { class: "bottom" },
      h(
        "button",
        { class: "capsule-button small glass clear press", onclick: () => fileInput.click() },
        icon("camera"),
        "Photo",
      ),
      h(
        "button",
        {
          class: "capsule-button small glass clear press",
          onclick: () => {
            close();
            openPasteSheet(onPayload);
          },
        },
        icon("paste"),
        "Paste",
      ),
    ),
    fileInput,
  );
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add("open"));

  let warnTimer = 0;
  const warn = (text: string) => {
    hintEl.textContent = text;
    hintEl.classList.add("warn");
    clearTimeout(warnTimer);
    warnTimer = window.setTimeout(() => {
      hintEl.textContent = hint;
      hintEl.classList.remove("warn");
    }, 2000);
  };

  const accept = (payload: Payload) => {
    root.classList.add("found");
    close();
    onPayload(payload);
  };

  const camera = new CameraScanner(video, (texts) => {
    const { payload, error } = pick(texts);
    if (payload) accept(payload);
    else if (error) warn(error);
  });

  function close(): void {
    if (!open) return;
    open = false;
    camera.stop();
    clearTimeout(warnTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    root.classList.remove("open");
    setTimeout(() => root.remove(), 260);
  }

  function onVisibility(): void {
    if (document.visibilityState === "hidden") camera.stop();
    else if (open) void startCamera();
  }
  document.addEventListener("visibilitychange", onVisibility);

  async function startCamera(): Promise<void> {
    try {
      await camera.start();
      errorEl.classList.add("hidden");
    } catch (error) {
      errorEl.textContent = cameraErrorText(error);
      errorEl.classList.remove("hidden");
    }
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    hintEl.textContent = "Reading the photo...";
    try {
      const { payload, error } = pick(await decodeFile(file));
      if (payload) return accept(payload);
      hintEl.textContent = hint;
      await showAlert(error ? "Not a qrauth code" : "No QR code found", error ? error : "Take the photo closer to the code.", [
        { label: "OK", value: true },
      ]);
    } catch (error) {
      hintEl.textContent = hint;
      await showAlert("The photo could not be read", String(error), [{ label: "OK", value: true }]);
    }
  });

  void startCamera();
}

/** Payload text typed or pasted (the debug output of qrauth-pamtest prints it next to the QR code). */
export function openPasteSheet(onPayload: (payload: Payload) => void): void {
  const area = h("textarea", {
    placeholder: "qrauth:1:c:user@host:service:challenge",
    autocapitalize: "off",
    autocomplete: "off",
    autocorrect: "off",
    spellcheck: "false",
    "aria-label": "Payload",
  });
  const error = h("p", { class: "section-footer hidden", role: "alert" });
  const submit = () => {
    try {
      const payload = parsePayload(area.value);
      area.value = "";
      void sheet.close();
      onPayload(payload);
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      error.classList.remove("hidden");
    }
  };
  const pasteButton = navigator.clipboard?.readText
    ? h(
        "button",
        {
          class: "capsule-button small secondary-button press",
          onclick: async () => {
            try {
              area.value = (await navigator.clipboard.readText()).trim();
            } catch {
              area.focus();
            }
          },
        },
        icon("paste"),
        "Paste",
      )
    : null;
  const sheet = openSheet("Enter a payload", [
    area,
    error,
    h(
      "div",
      { class: "actions row-actions" },
      pasteButton,
      h("button", { class: "capsule-button small glass tinted press", onclick: submit }, "Use"),
    ),
  ]);
}
