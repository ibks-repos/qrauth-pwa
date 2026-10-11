// Element construction without innerHTML: everything that comes from a QR code is inserted as text.

export type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "style") {
      // CSSOM, not the style attribute: the Content Security Policy allows no inline styles.
      el.style.cssText = String(value);
    } else if (name.startsWith("on") && typeof value === "function") {
      el.addEventListener(name.slice(2), value);
    } else if (value === true) {
      el.setAttribute(name, "");
    } else {
      el.setAttribute(name, String(value));
    }
  }
  append(el, ...children);
  return el;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
}

export function clearChildren(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const AVATAR_COLORS = [
  ["#5ac8fa", "#007aff"],
  ["#64d2ff", "#5e5ce6"],
  ["#30d158", "#00a86b"],
  ["#ff9f0a", "#ff6b00"],
  ["#ff375f", "#d70015"],
  ["#bf5af2", "#8944ab"],
];

export function avatar(account: string, large = false): HTMLElement {
  let hash = 0;
  for (const c of account) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const el = h("div", { class: large ? "avatar large" : "avatar", "aria-hidden": "true" }, account[0] ?? "?");
  el.style.background = `linear-gradient(160deg, ${a}, ${b})`;
  return el;
}

export function formatTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)}, ${formatTime(iso)}`;
}

export function splitAccount(account: string): { user: string; host: string } {
  const at = account.indexOf("@");
  return { user: account.slice(0, at), host: account.slice(at + 1) };
}
