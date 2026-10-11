// What happens after a code is scanned: show a response, or store the secret of an enrollment code.

import {
  confirmPending,
  enroll,
  getAccount,
  respond,
  rollbackPending,
  UnknownAccountError,
  type AccountInfo,
  type Protection,
} from "../keystore";
import { addLog } from "../log";
import { serviceLabel, serviceTimeout, type Challenge, type Enrollment } from "../payload";
import { getPasskey, hasFreshKek } from "../session";
import { formatTime, h, splitAccount } from "./dom";
import { icon } from "./icons";
import { openSheet, showAlert, toast, type Sheet } from "./overlay";
import { openScanner, type Payload } from "./scanner";

let onAccountsChanged: () => void = () => {};

export function setAccountsChangedHandler(handler: () => void): void {
  onAccountsChanged = handler;
}

/**
 * The question that ends a secret change: pam_qrauth prints "The new secret is saved" or "The secret was not
 * changed" after the confirmation challenge, and only the user sees which. onDone runs after an answer.
 */
export function confirmChangeCard(account: AccountInfo, onDone: () => void): HTMLElement {
  const card = h(
    "div",
    { class: "confirm-card" },
    h("h4", null, "Did the server save the new secret?"),
    h(
      "p",
      null,
      "After the confirmation code the terminal says \u201cThe new secret is saved\u201d or \u201cThe secret was not changed\u201d.",
    ),
  );
  const answer = async (saved: boolean) => {
    if (saved) {
      await confirmPending(account.account);
      void addLog({ kind: "confirmed", account: account.account });
      toast("Change confirmed", "ok");
    } else {
      const result = await rollbackPending(account.account);
      void addLog({ kind: "rolled-back", account: account.account });
      toast(result === "removed" ? "Account removed" : "Previous secret restored", "ok");
    }
    onAccountsChanged();
    onDone();
  };
  card.append(
    h(
      "div",
      { class: "actions row-actions" },
      h("button", { class: "capsule-button small secondary-button press", onclick: () => void answer(false) }, "Not changed"),
      h("button", { class: "capsule-button small glass tinted press", onclick: () => void answer(true) }, "Saved"),
    ),
  );
  if (!account.hasPrevious) {
    card.append(h("p", { class: "footnote" }, "Not changed removes this account from the app."));
  }
  return card;
}

export function startScan(hint = "Point at the QR code in the terminal"): void {
  openScanner({ hint, onPayload: (payload) => void handlePayload(payload) });
}

export async function handlePayload(payload: Payload): Promise<void> {
  if (payload.kind === "challenge") await showCode(payload);
  else await showEnrollment(payload);
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "Face ID was cancelled.";
  return error instanceof Error ? error.message : String(error);
}

function serviceChip(service: string): HTMLElement {
  const label = serviceLabel(service);
  return h(
    "span",
    { class: label ? "service" : "service unknown" },
    label ?? "PAM service",
    h("span", { class: "mono" }, service),
  );
}

function digits(code: string): HTMLElement {
  return h(
    "div",
    { class: "code-digits reveal", "aria-label": `Code ${code.split("").join(" ")}` },
    code.slice(0, 3),
    h("span", { class: "gap" }),
    code.slice(3),
  );
}

/** The response to a challenge, with the account and the PAM service it approves. */
export async function showCode(challenge: Challenge): Promise<void> {
  const scannedAt = new Date();
  const account = await getAccount(challenge.account);
  if (!account) {
    void addLog({ kind: "unknown-account", account: challenge.account, service: challenge.service });
    const { user } = splitAccount(challenge.account);
    openSheet("Unknown account", [
      h("div", { class: "status-icon warn" }, icon("warning")),
      h(
        "div",
        { class: "message" },
        h("h3", null, challenge.account),
        h("p", null, "This app has no secret for the account, so it gives no code."),
        h("p", null, "Enroll it first: run ", h("code", null, `sudo qrauth-passwd ${user}`), " on the server."),
      ),
    ]);
    return;
  }

  const area = h("div");
  const actions = h("div");
  const card = h(
    "div",
    { class: "code-card" },
    serviceChip(challenge.service),
    h("p", { class: "account" }, challenge.account),
    area,
    h(
      "p",
      { class: "meta" },
      `Scanned at ${formatTime(scannedAt)}, valid for ${serviceTimeout(challenge.service)} s`,
    ),
    actions,
  );
  const sheet = openSheet("Code", [card]);

  const reveal = async () => {
    try {
      const code = await respond(challenge);
      void addLog({ kind: "code", account: challenge.account, service: challenge.service });
      area.replaceChildren(digits(code));
      const copy = h(
        "button",
        {
          class: "capsule-button small secondary-button press",
          onclick: () =>
            void navigator.clipboard.writeText(code).then(
              () => toast("Copied", "ok"),
              () => toast("Could not copy", "error"),
            ),
        },
        icon("copy"),
        "Copy",
      );
      // A pending secret change ends with the question instead of Done: type the code, read the terminal, answer.
      actions.replaceChildren(
        h(
          "div",
          { class: "actions row-actions" },
          copy,
          account.pending
            ? null
            : h("button", { class: "capsule-button small glass tinted press", onclick: () => void sheet.close() }, "Done"),
        ),
        account.pending ? confirmChangeCard(account, () => void sheet.close()) : "",
      );
    } catch (error) {
      if (error instanceof UnknownAccountError) {
        void sheet.close();
        return;
      }
      showLocked(errorMessage(error));
    }
  };

  const showLocked = (problem?: string) => {
    area.replaceChildren(
      h(
        "div",
        { class: "locked" },
        problem ? h("span", { role: "alert" }, problem) : h("span", null, "This account is protected with Face ID."),
        h(
          "button",
          { class: "capsule-button glass tinted press", onclick: () => void reveal() },
          icon("faceid"),
          "Show code",
        ),
      ),
    );
  };

  // WebKit allows WebAuthn only inside a user gesture: a Face ID account needs a tap unless the key is cached.
  if (account.protection === "faceid" && !hasFreshKek()) showLocked();
  else await reveal();
}

/** Store the secret of an enrollment code after the user agrees; then guide to the confirmation challenge. */
export async function showEnrollment(enrollment: Enrollment): Promise<void> {
  const existing = await getAccount(enrollment.account);
  const passkey = await getPasskey();
  const preferred: Protection = passkey?.useForNewAccounts ? "faceid" : "device";
  let stored = false;

  const sheet: Sheet = openSheet(existing ? "Replace secret" : "New account", [], () => {
    if (!stored) enrollment.secret.fill(0);
  });

  const store = async (protection: Protection) => {
    try {
      await enroll(enrollment, protection);
      stored = true;
      void addLog({ kind: existing ? "replaced" : "enrolled", account: enrollment.account });
      onAccountsChanged();
      showStored(protection);
    } catch (error) {
      if (protection === "faceid") {
        toast(errorMessage(error), "error");
      } else {
        await showAlert("The secret was not stored", errorMessage(error), [{ label: "OK", value: true }]);
      }
    }
  };

  const showStored = (protection: Protection) => {
    sheet.set(
      "Enrolled",
      h("div", { class: "status-icon ok" }, icon("check")),
      h(
        "div",
        { class: "message" },
        h("h3", null, enrollment.account),
        h("p", null, protection === "faceid" ? "Secret stored, protected with Face ID." : "Secret stored on this device."),
      ),
      h(
        "ol",
        { class: "steps" },
        h("li", null, "Press Enter in the terminal."),
        h("li", null, "Scan the confirmation code and type the response."),
        h("li", null, "Tell the app whether the terminal says the new secret is saved."),
      ),
      h(
        "div",
        { class: "actions" },
        h(
          "button",
          {
            class: "capsule-button glass tinted press",
            onclick: () => {
              void sheet.close();
              startScan("Scan the confirmation code");
            },
          },
          icon("scan"),
          "Scan confirmation code",
        ),
        h("button", { class: "plain-link", onclick: () => void sheet.close() }, "Done"),
      ),
    );
  };

  const buttons: HTMLElement[] = [];
  if (preferred === "faceid") {
    buttons.push(
      h(
        "button",
        { class: "capsule-button glass tinted press", onclick: () => void store("faceid") },
        icon("faceid"),
        "Store with Face ID",
      ),
      h("button", { class: "plain-link", onclick: () => void store("device") }, "Store without Face ID"),
    );
  } else {
    buttons.push(
      h(
        "button",
        { class: "capsule-button glass tinted press", onclick: () => void store("device") },
        icon("key"),
        existing ? "Replace secret" : "Store secret",
      ),
    );
  }

  sheet.set(
    existing ? "Replace secret" : "New account",
    h("div", { class: `status-icon ${existing ? "warn" : "info"}` }, icon(existing ? "warning" : "key")),
    h(
      "div",
      { class: "message" },
      h("h3", null, enrollment.account),
      existing
        ? h(
            "p",
            null,
            "This account already has a secret. The server keeps using it until you answer the confirmation code, so the app keeps it too until you confirm the change.",
          )
        : h("p", null, "The server showed a new secret for this account. Store it to answer its codes."),
    ),
    h("div", { class: "actions" }, ...buttons),
  );
}
