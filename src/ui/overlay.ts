// Sheets, alerts and toasts: the floating Liquid Glass layer above the content.

import { append, clearChildren, h, type Child } from "./dom";
import { icon } from "./icons";

export interface Sheet {
  readonly element: HTMLElement;
  /** Replace title and content (the sheet stays open). */
  set(title: string, ...children: Child[]): void;
  close(): Promise<void>;
  readonly closed: Promise<void>;
}

let current: Sheet | null = null;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** Open a sheet; an open sheet is closed first. onClose runs once, however the sheet is closed. */
export function openSheet(title: string, children: Child[], onClose?: () => void): Sheet {
  void current?.close();
  const heading = h("h2", { id: `sheet-title-${Date.now()}` }, title);
  const body = h("div", { class: "sheet-body" });
  append(body, ...children);
  const closeButton = h("button", { class: "close press", "aria-label": "Close" }, icon("close"));
  const header = h("div", { class: "sheet-header" }, heading, closeButton);
  const element = h(
    "section",
    { class: "sheet glass", role: "dialog", "aria-modal": "true", "aria-labelledby": heading.id },
    h("div", { class: "grabber", "aria-hidden": "true" }),
    header,
    body,
  );
  const backdrop = h("div", { class: "backdrop" });
  document.body.append(backdrop, element);

  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => (resolveClosed = resolve));
  let closing = false;

  const sheet: Sheet = {
    element,
    closed,
    set(newTitle, ...newChildren) {
      heading.textContent = newTitle;
      clearChildren(body);
      append(body, ...newChildren);
      body.scrollTop = 0;
    },
    async close() {
      if (closing) return closed;
      closing = true;
      if (current === sheet) {
        current = null;
        document.body.classList.remove("sheet-open");
      }
      element.classList.add("closing");
      element.classList.remove("open");
      element.style.transform = "";
      backdrop.classList.remove("open");
      await new Promise((r) => setTimeout(r, 300));
      element.remove();
      backdrop.remove();
      onClose?.();
      resolveClosed();
    },
  };
  closeButton.addEventListener("click", () => void sheet.close());
  backdrop.addEventListener("click", () => void sheet.close());
  enableSwipeDown(element, header, () => void sheet.close());
  current = sheet;
  document.body.classList.add("sheet-open");
  void nextFrame().then(() => {
    element.classList.add("open");
    backdrop.classList.add("open");
  });
  return sheet;
}

export function closeSheet(): Promise<void> {
  return current?.close() ?? Promise.resolve();
}

/** Drag the sheet down by its header to dismiss it. */
function enableSwipeDown(sheet: HTMLElement, handle: HTMLElement, dismiss: () => void): void {
  let startY = 0;
  let dy = 0;
  let dragging = false;
  const grab = sheet.querySelector(".grabber") as HTMLElement;
  for (const target of [handle, grab]) {
    target.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).closest("button")) return;
      dragging = true;
      startY = e.clientY;
      dy = 0;
      sheet.style.transition = "none";
      target.setPointerCapture(e.pointerId);
    });
    target.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = "";
      if (dy > 110) dismiss();
      else sheet.style.transform = "";
    };
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }
}

export interface AlertButton<T> {
  label: string;
  value: T;
  style?: "default" | "cancel" | "destructive";
}

/** A modal alert; resolves with the value of the pressed button. */
export function showAlert<T>(title: string, message: string, buttons: AlertButton<T>[]): Promise<T> {
  return new Promise((resolve) => {
    const layer = h("div", { class: "alert-layer" });
    const finish = (value: T) => {
      layer.classList.remove("open");
      setTimeout(() => layer.remove(), 220);
      resolve(value);
    };
    const buttonEls = buttons.map((b) =>
      h(
        "button",
        {
          class: `capsule-button small press ${
            b.style === "destructive" ? "destructive-fill" : b.style === "cancel" ? "secondary-button" : "glass tinted"
          }`,
          onclick: () => finish(b.value),
        },
        b.label,
      ),
    );
    layer.append(
      h(
        "div",
        { class: "alert glass", role: "alertdialog", "aria-modal": "true" },
        h("h3", null, title),
        message ? h("p", null, message) : null,
        h("div", { class: "alert-buttons" }, ...buttonEls),
      ),
    );
    document.body.append(layer);
    void nextFrame().then(() => layer.classList.add("open"));
    buttonEls[buttonEls.length - 1]?.focus();
  });
}

let toastTimer = 0;

export function toast(text: string, kind: "ok" | "error" | "info" = "info"): void {
  document.querySelector(".toast")?.remove();
  const el = h(
    "div",
    { class: `toast glass ${kind}`, role: "status", "aria-live": "polite" },
    kind === "ok" ? icon("check") : kind === "error" ? icon("warning") : icon("info"),
    h("span", null, text),
  );
  document.body.append(el);
  void nextFrame().then(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 500);
  }, 2200);
}
