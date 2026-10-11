// Line icons drawn for this app on a 24x24 grid (SF Symbols may not be used outside Apple platforms).

const SVG_NS = "http://www.w3.org/2000/svg";

const ICONS = {
  scan: ["M4 8V6a2 2 0 0 1 2-2h2", "M16 4h2a2 2 0 0 1 2 2v2", "M20 16v2a2 2 0 0 1-2 2h-2", "M8 20H6a2 2 0 0 1-2-2v-2", "M4 12h16"],
  qr: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h2v2h-2z", "M18 18h2v2h-2z", "M14 18h2", "M18 14h2"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5", "M12 7.6v.4"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  camera: ["M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", "M12 16a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"],
  paste: ["M9 4h6v3H9z", "M15 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2", "M9 12h6", "M9 16h4"],
  copy: ["M9 9h10v11H9z", "M5 15V5a1 1 0 0 1 1-1h9"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12", "M9 7V4h6v3"],
  faceid: ["M4 8V6a2 2 0 0 1 2-2h2", "M16 4h2a2 2 0 0 1 2 2v2", "M20 16v2a2 2 0 0 1-2 2h-2", "M8 20H6a2 2 0 0 1-2-2v-2", "M9 9v1.5", "M15 9v1.5", "M12 9v4h-1", "M9 15.5c1.8 1.4 4.2 1.4 6 0"],
  lock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  chevron: ["M9 5l7 7-7 7"],
  warning: ["M12 4l9 16H3z", "M12 10v4", "M12 17v.4"],
  key: ["M14.5 13a4.5 4.5 0 1 0-4-6.6", "M10.5 9.5L3 17v3h3l1-1v-2h2l1-1v-2h2", "M15.5 8.5h.01"],
  share: ["M12 15V3", "M8 7l4-4 4 4", "M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1"],
  plus: ["M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", "M12 8v8", "M8 12h8"],
  shield: ["M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z", "M9 12l2 2 4-4"],
  terminal: ["M4 5h16v14H4z", "M7 9l3 3-3 3", "M12 15h5"],
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, extraClass = ""): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `icon ${extraClass}`.trim());
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}
