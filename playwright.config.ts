import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/webkit",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173/qrauth-pwa/",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/qrauth-pwa/",
    reuseExistingServer: true,
  },
  projects: [
    { name: "iphone-light", use: { ...devices["iPhone 16 Pro Max"], colorScheme: "light" } },
    { name: "iphone-dark", use: { ...devices["iPhone 16 Pro Max"], colorScheme: "dark" } },
  ],
});
