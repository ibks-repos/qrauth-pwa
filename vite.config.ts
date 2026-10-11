import { defineConfig } from "vitest/config";
import { execSync } from "node:child_process";

function gitVersion(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
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
