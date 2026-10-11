// About: version, device state, Face ID setup, OCRA self-test, updates.

import { prfSupport } from "../faceid";
import { compute, SUITE } from "../ocra";
import { applyUpdate, isStandalone, updateAvailable } from "../pwa";
import { confirmFaceIdSetup, getPasskey, setUpFaceId, setUseForNewAccounts } from "../session";
import { formatDate, h } from "./dom";
import { icon } from "./icons";
import { openSheet, toast } from "./overlay";

const KEY_00_1F = Uint8Array.from({ length: 32 }, (_, i) => i);
const VECTORS: [string, string][] = [
  ["0000000000000000000000000000000000000000", "354116"],
  ["0123456789abcdef0123456789abcdef01234567", "075000"],
  ["ffffffffffffffffffffffffffffffffffffffff", "345919"],
  ["b25a8062ea91212f9fed2d8fb91048db761c8bc1", "606441"],
];

function row(label: string, value: Node | string): HTMLElement {
  return h("div", { class: "row" }, h("div", { class: "grow" }, label), typeof value === "string" ? h("div", { class: "value" }, value) : value);
}

async function selfTest(): Promise<string> {
  let passed = 0;
  for (const [challenge, expected] of VECTORS) {
    if ((await compute(SUITE, KEY_00_1F, challenge)) === expected) passed++;
  }
  return `${passed} of ${VECTORS.length} vectors passed`;
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "Face ID was cancelled.";
  return error instanceof Error ? error.message : String(error);
}

async function securitySection(rerender: () => void): Promise<HTMLElement[]> {
  const passkey = await getPasskey();
  const support = await prfSupport();
  if (passkey) {
    const toggle = h("input", { type: "checkbox", switch: true, "aria-label": "Use Face ID for new accounts" });
    toggle.checked = passkey.useForNewAccounts;
    toggle.addEventListener("change", () => void setUseForNewAccounts(toggle.checked));
    return [
      h("div", { class: "section-title" }, "Face ID"),
      h("div", { class: "list" }, row("Use for new accounts", toggle), row("Passkey created", formatDate(passkey.created))),
      h(
        "p",
        { class: "section-footer" },
        "Secrets of protected accounts are encrypted with a key that only the QRAuth passkey can give, after Face ID. Accounts enrolled before keep their protection.",
      ),
    ];
  }
  const button = h("button", { class: "capsule-button small glass tinted press" }, icon("faceid"), "Set up Face ID");
  button.addEventListener("click", async () => {
    try {
      if (button.dataset.step === "confirm") {
        await confirmFaceIdSetup();
      } else if ((await setUpFaceId()) === "confirm") {
        button.dataset.step = "confirm";
        button.lastChild!.textContent = "Confirm with Face ID";
        return;
      }
      toast("Face ID is on", "ok");
      rerender();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  });
  const available = support.webauthn && support.platformAuthenticator && support.prfCapability !== false;
  const items: (HTMLElement | null)[] = [
    h("div", { class: "section-title" }, "Face ID"),
    h("div", { class: "list" }, row("Status", available ? "Off" : "Not available")),
    h(
      "p",
      { class: "section-footer" },
      "Face ID protection uses a passkey (WebAuthn PRF) saved in your Passwords. New accounts then need Face ID to show a code.",
    ),
    available ? h("div", { class: "actions" }, button) : null,
  ];
  return items.filter((x): x is HTMLElement => x !== null);
}

export async function showAbout(): Promise<void> {
  const sheet = openSheet("About", [h("div", { class: "empty" }, "Loading...")]);
  const render = async () => {
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    const testResult = h("div", { class: "value" }, "Not run");
    const testButton = h(
      "button",
      {
        class: "row",
        onclick: async () => {
          testResult.textContent = await selfTest();
        },
      },
      h("div", { class: "grow", style: "color: var(--accent)" }, "Run OCRA self-test"),
      testResult,
    );
    sheet.set(
      "About",
      h(
        "div",
        { class: "message" },
        h("img", { src: `${import.meta.env.BASE_URL}icons/icon-192.png`, alt: "", width: 72, height: 72, style: "border-radius: 16px" }),
        h("h3", { style: "margin-top: 8px" }, "QRAuth"),
        h("p", null, "Answers pam_qrauth login challenges with one-time codes (OCRA, RFC 6287)."),
      ),
      updateAvailable()
        ? h(
            "div",
            { class: "actions" },
            h("button", { class: "capsule-button small glass tinted press", onclick: applyUpdate }, "Update available: reload"),
          )
        : null,
      ...(await securitySection(() => void render())),
      h("div", { class: "section-title" }, "This device"),
      h(
        "div",
        { class: "list" },
        row("Opened as", isStandalone() ? "Home Screen app" : "Browser tab"),
        row("Persistent storage", persisted ? "Yes" : "No"),
        row("Storage used", estimate?.usage !== undefined ? `${Math.round(estimate.usage / 1024)} KB` : "Unknown"),
      ),
      h("div", { class: "section-title" }, "Diagnostics"),
      h("div", { class: "list" }, testButton, row("Version", `${__BUILD_VERSION__}, ${formatDate(__BUILD_DATE__)}`)),
      h(
        "p",
        { class: "section-footer" },
        "QRAuth works offline and sends nothing anywhere. Secrets stay on this device: they are not synced, backed up by the app or shown. Source: ",
        h("a", { href: "https://github.com/ibks-repos/qrauth-pwa", target: "_blank", rel: "noreferrer" }, "github.com/ibks-repos/qrauth-pwa"),
        ".",
      ),
    );
  };
  await render();
}
