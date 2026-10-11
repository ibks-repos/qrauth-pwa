// Render the PNG icons of the web app from assets/icon.svg.
// iOS uses apple-touch-icon (180 px, no transparency; the system rounds the corners).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const svg = readFileSync(new URL("../assets/icon.svg", import.meta.url), "utf8");
const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

const sizes = {
  "apple-touch-icon.png": 180,
  "icon-192.png": 192,
  "icon-512.png": 512,
  "icon-maskable-512.png": 512,
};
for (const [name, size] of Object.entries(sizes)) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(new URL(name, out), png);
  console.log(`${name} ${size}x${size} ${png.length} B`);
}
