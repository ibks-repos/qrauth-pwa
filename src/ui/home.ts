// The main screen: accounts on the content layer, a floating glass toolbar with the scan button.

import { listAccounts, type AccountInfo } from "../keystore";
import { showAbout } from "./about";
import { showAccount } from "./account";
import { formatDate, h, avatar, splitAccount } from "./dom";
import { setAccountsChangedHandler, startScan } from "./flows";
import { icon } from "./icons";
import { showLog } from "./logview";

const list = h("div", { class: "list", role: "list" });
const empty = h(
  "div",
  { class: "empty hidden" },
  icon("qr"),
  h("h2", null, "No accounts"),
  h("p", null, "On the server, run ", h("code", null, "sudo qrauth-passwd <user>"), "."),
  h("p", null, "Then scan the enrollment code it shows."),
);

function accountRow(account: AccountInfo): HTMLElement {
  const { user, host } = splitAccount(account.account);
  return h(
    "button",
    { class: "row", role: "listitem", style: "--separator-inset: 68px", onclick: () => void showAccount(account.account, refresh) },
    avatar(account.account),
    h(
      "div",
      { class: "grow" },
      h("div", { class: "title" }, user),
      account.pending
        ? h("div", { class: "subtitle" }, `${host}, `, h("span", { class: "pending-label" }, "change not confirmed"))
        : h("div", { class: "subtitle" }, `${host}, added ${formatDate(account.added)}`),
    ),
    account.protection === "faceid" ? h("span", { class: "badge", title: "Protected with Face ID" }, icon("faceid")) : null,
    icon("chevron", "chevron"),
  );
}

export async function refresh(): Promise<void> {
  const accounts = await listAccounts();
  list.replaceChildren(...accounts.map(accountRow));
  list.classList.toggle("hidden", accounts.length === 0);
  empty.classList.toggle("hidden", accounts.length > 0);
}

export function renderHome(root: HTMLElement): void {
  const title = h("h1", { class: "large-title" }, "Accounts");
  const edgeTop = h("div", { class: "edge-top", "aria-hidden": "true" }, h("span", { class: "compact-title" }, "Accounts"));
  root.append(
    edgeTop,
    h("main", { id: "content" }, title, list, empty),
    h("div", { class: "edge-bottom", "aria-hidden": "true" }),
    h(
      "nav",
      { class: "toolbar", "aria-label": "Actions" },
      h("button", { class: "circle-button glass press", "aria-label": "Log", onclick: () => void showLog() }, icon("clock")),
      h("button", { class: "capsule-button glass tinted press", id: "scan", onclick: () => startScan() }, icon("scan"), "Scan"),
      h("button", { class: "circle-button glass press", "aria-label": "About", onclick: () => void showAbout() }, icon("info")),
    ),
  );
  new IntersectionObserver(([entry]) => edgeTop.classList.toggle("scrolled", !entry.isIntersecting), {
    rootMargin: "-60px 0px 0px 0px",
  }).observe(title);
  setAccountsChangedHandler(() => void refresh());
  void refresh();
}
