// One account: metadata and removal.

import { getAccount, removeAccount } from "../keystore";
import { addLog } from "../log";
import { avatar, formatDateTime, h } from "./dom";
import { confirmChangeCard } from "./flows";
import { icon } from "./icons";
import { openSheet, showAlert, toast } from "./overlay";

function row(label: string, value: string, mono = false): HTMLElement {
  return h("div", { class: "row" }, h("div", { class: "grow" }, label), h("div", { class: mono ? "value mono" : "value" }, value));
}

export async function showAccount(name: string, onChanged: () => void): Promise<void> {
  const account = await getAccount(name);
  if (!account) return;
  const sheet = openSheet("Account", [
    h("div", { class: "message" }, avatar(account.account, true), h("h3", { style: "margin-top: 12px" }, account.account)),
    h(
      "div",
      { class: "list" },
      row("Added", formatDateTime(account.added)),
      row("Protection", account.protection === "faceid" ? "Face ID" : "This device"),
      row("State", account.pending ? (account.hasPrevious ? "Not confirmed, previous secret kept" : "Not confirmed") : "Confirmed"),
      row("Algorithm", account.suite, true),
    ),
    account.pending ? confirmChangeCard(account, () => void sheet.close()) : null,
    account.protection === "device"
      ? h("p", { class: "section-footer" }, "To protect this account with Face ID, turn Face ID on in About and enroll it again.")
      : null,
    h(
      "div",
      { class: "actions" },
      h(
        "button",
        {
          class: "capsule-button glass destructive press",
          onclick: async () => {
            const ok = await showAlert(
              `Delete ${account.account}?`,
              "The app forgets the secret. To use the account again, the server has to enroll it anew.",
              [
                { label: "Cancel", value: false, style: "cancel" },
                { label: "Delete", value: true, style: "destructive" },
              ],
            );
            if (!ok) return;
            await removeAccount(account.account);
            void addLog({ kind: "removed", account: account.account });
            onChanged();
            void sheet.close();
            toast("Account deleted", "ok");
          },
        },
        icon("trash"),
        "Delete account",
      ),
    ),
  ]);
}
