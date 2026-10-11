// The app in WebKit with an iPhone viewport. The camera is not available here, so codes go in through the
// Paste and Photo fallbacks; screenshots of every screen go to test-results/screens.

import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const ENROLL = "qrauth:1:e:alice@lfs-lab:AAAQEAYEAUDAOCAJBIFQYDIOB4IBCEQTCQKRMFYYDENBWHA5DYPQ:OCRA-1:HOTP-SHA256-6:QH40";
const CHALLENGE = "qrauth:1:c:alice@lfs-lab:login:b25a8062ea91212f9fed2d8fb91048db761c8bc1";
// Second secret: bytes 0x20..0x3f; the example challenge gives 706962 (client/ocra.py).
const ENROLL_2 = "qrauth:1:e:alice@lfs-lab:EAQSEIZEEUTCOKBJFIVSYLJOF4YDCMRTGQ2TMNZYHE5DWPB5HY7Q:OCRA-1:HOTP-SHA256-6:QH40";
const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

// Behave like the installed Home Screen app (the iPhone emulation reports a Safari tab).
test.beforeEach(async ({ page }, info) => {
  if (info.title !== "install hint in a Safari tab") {
    await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  }
});

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png` });
}

async function paste(page: Page, payload: string): Promise<void> {
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("button", { name: "Paste" }).click();
  await page.getByLabel("Payload", { exact: true }).fill(payload);
  await page.getByRole("button", { name: "Use" }).click();
}

test("enroll, confirm, survive a reload, replace, roll back, delete", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText("No accounts")).toBeVisible();
  await shot(page, "01-empty");

  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Scan a QR code" })).toBeVisible();
  await shot(page, "02-scanner");
  await page.getByRole("button", { name: "Close" }).click();

  await paste(page, ENROLL);
  await expect(page.getByRole("heading", { name: "alice@lfs-lab" })).toBeVisible();
  await shot(page, "03-enroll");
  await page.getByRole("button", { name: "Store secret" }).click();
  await expect(page.getByText("Secret stored on this device.")).toBeVisible();
  await shot(page, "04-enrolled");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("change not confirmed")).toBeVisible();

  // The confirmation challenge: the code, then the question about the terminal output.
  await paste(page, CHALLENGE);
  await expect(page.getByLabel("Code 6 0 6 4 4 1")).toBeVisible();
  await expect(page.getByText("Console login")).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).toHaveCount(0);
  await shot(page, "05-confirm");
  await page.getByRole("button", { name: "Saved" }).click();
  await expect(page.getByText("change not confirmed")).toHaveCount(0);
  await shot(page, "06-home");

  // The non-extractable CryptoKey comes back from IndexedDB after a reload.
  await page.reload();
  await paste(page, CHALLENGE.replace("b25a8062ea91212f9fed2d8fb91048db761c8bc1", "0".repeat(40)));
  await expect(page.getByLabel("Code 3 5 4 1 1 6")).toBeVisible();
  await shot(page, "07-code");
  await page.getByRole("button", { name: "Done" }).click();

  // A change that the server did not save: the previous secret comes back.
  await paste(page, ENROLL_2);
  await expect(page.getByText("This account already has a secret.", { exact: false })).toBeVisible();
  await shot(page, "08-replace");
  await page.getByRole("button", { name: "Replace secret" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await paste(page, CHALLENGE);
  await expect(page.getByLabel("Code 7 0 6 9 6 2")).toBeVisible();
  await page.getByRole("button", { name: "Not changed" }).click();
  await expect(page.getByText("Previous secret restored")).toBeVisible();
  await paste(page, CHALLENGE);
  await expect(page.getByLabel("Code 6 0 6 4 4 1")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  // A change confirmed later from the account sheet.
  await paste(page, ENROLL_2);
  await page.getByRole("button", { name: "Replace secret" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.locator("#content").getByRole("listitem").filter({ hasText: "alice" }).click();
  await expect(page.getByText("Not confirmed, previous secret kept")).toBeVisible();
  await shot(page, "09-account-pending");
  await page.getByRole("button", { name: "Saved" }).click();
  await paste(page, CHALLENGE);
  await expect(page.getByLabel("Code 7 0 6 9 6 2")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Log" }).click();
  await expect(page.getByText("Change undone")).toBeVisible();
  await expect(page.getByText("Change confirmed").first()).toBeVisible();
  await expect(page.getByText("Secret replaced").first()).toBeVisible();
  await shot(page, "10-log");
  await page.getByRole("button", { name: "Close" }).click();

  await page.locator("#content").getByRole("listitem").filter({ hasText: "alice" }).click();
  await shot(page, "11-account");
  await page.getByRole("button", { name: "Delete account" }).click();
  await shot(page, "12-delete-alert");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No accounts")).toBeVisible();
});

test("a new account is removed when the server did not save it", async ({ page }) => {
  await page.goto("./");
  await paste(page, ENROLL);
  await page.getByRole("button", { name: "Store secret" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await paste(page, CHALLENGE);
  await expect(page.getByText("Not changed removes this account from the app.")).toBeVisible();
  await page.getByRole("button", { name: "Not changed" }).click();
  await expect(page.getByText("No accounts")).toBeVisible();
});

test("refuses unknown accounts and foreign codes", async ({ page }) => {
  await page.goto("./");
  await paste(page, CHALLENGE.replace("alice", "bob"));
  await expect(page.getByText("This app has no secret for the account", { exact: false })).toBeVisible();
  await expect(page.locator(".code-digits")).toHaveCount(0);
  await shot(page, "13-unknown");
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("button", { name: "Paste" }).click();
  await page.getByLabel("Payload", { exact: true }).fill("https://example.com/");
  await page.getByRole("button", { name: "Use" }).click();
  await expect(page.getByRole("alert")).toHaveText("Not a qrauth code.");
});

test("decodes a photo", async ({ page }) => {
  await page.goto("./");
  await paste(page, ENROLL);
  await page.getByRole("button", { name: "Store secret" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(fixture("challenge-example.png"));
  await expect(page.getByLabel("Code 6 0 6 4 4 1")).toBeVisible();
});

test("about", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "About" }).click();
  await page.getByRole("button", { name: "Run OCRA self-test" }).click();
  await expect(page.getByText("4 of 4 vectors passed")).toBeVisible();
  await shot(page, "14-about");
});

test("install hint in a Safari tab", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Add QRAuth to the Home Screen" })).toBeVisible();
  await shot(page, "00-install");
  await page.getByRole("button", { name: "Continue in the browser" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
