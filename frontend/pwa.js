/*
 * pwa.js
 * ------
 * Everything related to "installing ClearPath as an app" lives here,
 * separate from script.js (which only handles the hazard-checking logic).
 * This file:
 *   1. Registers the service worker (service-worker.js) so the browser
 *      knows this page can be installed.
 *   2. Shows a real "Install App" button on Android/Chrome/Edge, using the
 *      browser's native install prompt.
 *   3. Shows a text hint on iPhone/iPad instead, since Safari doesn't
 *      support a JavaScript-triggered install prompt — installing there
 *      is a manual "Share -> Add to Home Screen" action.
 */

const installButton = document.getElementById("install-button");
const iosInstallHint = document.getElementById("ios-install-hint");

// --- 1. Register the service worker -------------------------------------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}

// --- 2. Android / Chrome / Edge: native install prompt -------------------

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  // Stop the browser's default mini-infobar and save the event so we can
  // trigger it later from our own styled button instead.
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  // Whatever the user chose, the prompt can only be used once.
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

window.addEventListener("appinstalled", () => {
  installButton.hidden = true;
  iosInstallHint.hidden = true;
});

// --- 3. iPhone / iPad: show a manual instruction instead ------------------

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isRunningStandalone() {
  // True if the app was already launched from the home screen icon.
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

if (isIos() && !isRunningStandalone()) {
  iosInstallHint.hidden = false;
}
