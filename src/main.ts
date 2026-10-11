import "./styles/main.css";
import * as db from "./db";
import { isIosBrowserTab, onUpdateAvailable, registerServiceWorker, requestPersistence } from "./pwa";
import { warmUp } from "./scanner/decoder";
import { renderHome } from "./ui/home";
import { showInstallHint } from "./ui/install";
import { toast } from "./ui/overlay";

async function removeFeasibilityCheckData(): Promise<void> {
  for (const key of await db.keys("settings")) {
    if (typeof key === "string" && key.startsWith("spike.")) await db.remove("settings", key);
  }
}

renderHome(document.getElementById("app")!);
if (isIosBrowserTab()) showInstallHint();
void requestPersistence();
void removeFeasibilityCheckData();
onUpdateAvailable(() => toast("Update available: open About to reload"));
void registerServiceWorker();
warmUp();
