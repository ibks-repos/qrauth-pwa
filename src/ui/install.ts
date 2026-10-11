// Shown in a Safari tab on iPhone: the app keeps its data separately from Safari, so it has to be installed first.

import { h } from "./dom";
import { icon } from "./icons";
import { openSheet } from "./overlay";

export function showInstallHint(): void {
  const sheet = openSheet("Install QRAuth", [
    h("div", { class: "status-icon info" }, icon("plus")),
    h(
      "div",
      { class: "message" },
      h("h3", null, "Add QRAuth to the Home Screen"),
      h("p", null, "Accounts live in the installed app. Accounts added in this Safari tab are not visible there."),
    ),
    h(
      "ol",
      { class: "steps" },
      h("li", null, "Tap ", icon("share"), " Share in Safari."),
      h("li", null, "Choose Add to Home Screen, keep Open as Web App on."),
      h("li", null, "Open QRAuth from the Home Screen."),
    ),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "plain-link", onclick: () => void sheet.close() }, "Continue in the browser"),
    ),
  ]);
}
