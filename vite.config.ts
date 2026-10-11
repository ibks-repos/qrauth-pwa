import { defineConfig, type Plugin } from "vitest/config";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

function gitVersion(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

/** List every built file in dist/sw.js, so that the service worker can precache the whole app. */
function precacheManifest(): Plugin {
  let outDir = "dist";
  return {
    name: "qrauth-precache",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir).sort()) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) walk(path);
          else files.push(relative(outDir, path).split("\\").join("/"));
        }
      };
      walk(outDir);
      const cached = files.filter((f) => f !== "sw.js");
      const hash = createHash("sha256");
      for (const f of cached) hash.update(f).update(readFileSync(join(outDir, f)));
      const swPath = join(outDir, "sw.js");
      const sw = readFileSync(swPath, "utf8")
        .replace("self.__QRAUTH_FILES__", JSON.stringify(["./", ...cached]))
        .replace("self.__QRAUTH_HASH__", JSON.stringify(hash.digest("hex").slice(0, 16)));
      writeFileSync(swPath, sw);
    },
  };
}

/** The Content Security Policy blocks the inline styles and scripts of the Vite dev server. */
function devWithoutCsp(): Plugin {
  return {
    name: "qrauth-dev-csp",
    apply: "serve",
    transformIndexHtml: (html) => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, ""),
  };
}

export default defineConfig({
  plugins: [precacheManifest(), devWithoutCsp()],
  base: "/qrauth-pwa/",
  define: {
    __BUILD_VERSION__: JSON.stringify(process.env.QRAUTH_VERSION ?? gitVersion()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: "safari18",
    assetsInlineLimit: 0,
  },
  worker: {
    format: "es",
  },
  test: {
    include: ["test/unit/**/*.test.ts"],
  },
});
