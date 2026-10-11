// Service worker registration, updates, storage persistence and display mode.

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();

function setWaiting(worker: ServiceWorker | null): void {
  waiting = worker;
  listeners.forEach((l) => l());
}

export function onUpdateAvailable(listener: () => void): void {
  listeners.add(listener);
}

export function updateAvailable(): boolean {
  return waiting !== null;
}

/** Activate the waiting service worker; the page reloads when it takes control. */
export function applyUpdate(): void {
  waiting?.postMessage("skipWaiting");
}

export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
  const hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) location.reload();
  });
  if (registration.waiting && hadController) setWaiting(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) setWaiting(installing);
    });
  });
  // Check for a new version whenever the app comes back to the foreground.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void registration.update().catch(() => {});
  });
}

export function isStandalone(): boolean {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iOS or iPadOS Safari in a browser tab (navigator.standalone exists only there). */
export function isIosBrowserTab(): boolean {
  return (navigator as unknown as { standalone?: boolean }).standalone === false;
}

export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
