// The local journal.

import { clearLog, listLog, type LogEntry } from "../log";
import { serviceLabel } from "../payload";
import { formatDate, formatTime, h } from "./dom";
import { icon, type IconName } from "./icons";
import { openSheet, showAlert } from "./overlay";

const KINDS: Record<LogEntry["kind"], { title: string; icon: IconName }> = {
  code: { title: "Code shown", icon: "key" },
  enrolled: { title: "Account enrolled", icon: "plus" },
  replaced: { title: "Secret replaced", icon: "key" },
  removed: { title: "Account deleted", icon: "trash" },
  "unknown-account": { title: "Refused: unknown account", icon: "warning" },
};

function entryRow(entry: LogEntry): HTMLElement {
  const kind = KINDS[entry.kind];
  const service = entry.service ? ` · ${serviceLabel(entry.service) ?? entry.service}` : "";
  return h(
    "div",
    { class: "row", role: "listitem", style: "--separator-inset: 52px" },
    h("span", { class: "badge" }, icon(kind.icon)),
    h(
      "div",
      { class: "grow" },
      h("div", { class: "title" }, kind.title),
      h("div", { class: "subtitle" }, `${entry.account}${service}`),
    ),
    h("div", { class: "value mono", style: "font-size: 13px" }, formatTime(entry.time)),
  );
}

export async function showLog(): Promise<void> {
  const entries = await listLog();
  const groups = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const day = formatDate(e.time);
    groups.set(day, [...(groups.get(day) ?? []), e]);
  }
  const content: Node[] = [];
  for (const [day, items] of groups) {
    content.push(h("div", { class: "section-title" }, day), h("div", { class: "list", role: "list" }, ...items.map(entryRow)));
  }
  if (!entries.length) {
    content.push(h("div", { class: "empty" }, icon("clock"), h("p", null, "Nothing has happened yet.")));
  }
  const sheet = openSheet("Log", [
    ...content,
    h("p", { class: "section-footer" }, "The log keeps the last 200 events on this device. It never stores codes or challenges."),
    entries.length
      ? h(
          "div",
          { class: "actions" },
          h(
            "button",
            {
              class: "capsule-button small glass destructive press",
              onclick: async () => {
                const ok = await showAlert("Clear the log?", "", [
                  { label: "Cancel", value: false, style: "cancel" },
                  { label: "Clear", value: true, style: "destructive" },
                ]);
                if (!ok) return;
                await clearLog();
                void sheet.close();
              },
            },
            "Clear log",
          ),
        )
      : null,
  ]);
}
