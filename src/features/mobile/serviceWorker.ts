/** Stable installation resources and event names are shared by browser controls. */
export const MOBILE = {
  serviceWorker: '/sw.js',
  installEvent: 'beforeinstallprompt',
  installedEvent: 'appinstalled',
  readinessTimeoutMilliseconds: 10_000,
} as const;
/** Chromium's optional deferred installation event; other browsers expose their own install menus. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
let deferredPrompt: InstallPrompt | null = null;
const installListeners = new Set<() => void>();
let registration: Promise<ServiceWorkerRegistration> | undefined;

/**
 * Captures installation opportunities even while the owner is still at the password gate.
 * @param {Window} browserWindow - Current browser window.
 */
export function prepareMobileSupport(browserWindow: Window): void {
  browserWindow.addEventListener(MOBILE.installEvent, (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPrompt;
    installListeners.forEach((listener) => listener());
  });
  browserWindow.addEventListener(MOBILE.installedEvent, () => {
    deferredPrompt = null;
    installListeners.forEach((listener) => listener());
  });
}

/** Returns whether a native install prompt can be shown. @returns {boolean} Deferred prompt availability. */
export function canPromptInstall(): boolean {
  return Boolean(deferredPrompt);
}

/**
 * Observes installation changes without persisting any browser prompt objects.
 * @param {() => void} listener - React control refresh callback.
 * @returns {() => void} Unsubscribe callback.
 */
export function observeInstallation(listener: () => void): () => void {
  installListeners.add(listener);
  return () => {
    installListeners.delete(listener);
  };
}

/** Shows the browser's deferred prompt only on an owner click. @returns {Promise<void>} Prompt has completed. */
export async function promptInstallation(): Promise<void> {
  const prompt = deferredPrompt;
  deferredPrompt = null;
  installListeners.forEach((listener) => listener());
  if (prompt) {
    await prompt.prompt();
    await prompt.userChoice;
  }
}

/**
 * Registers the public-only worker and waits a bounded time for an active installation.
 * @returns {Promise<ServiceWorkerRegistration>} Worker ready for optional Web Push.
 */
export function getMobileRegistration(): Promise<ServiceWorkerRegistration> {
  registration ??= activateWorker().catch((error: unknown) => {
    registration = undefined;
    throw error;
  });
  return registration;
}

/**
 * Registers a worker without caching the private application shell.
 * @returns {Promise<ServiceWorkerRegistration>} Active worker.
 */
async function activateWorker(): Promise<ServiceWorkerRegistration> {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    throw new Error('Mobile installation and alerts need HTTPS and a supported browser.');
  }
  await navigator.serviceWorker.register(MOBILE.serviceWorker, { updateViaCache: 'none' });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Mobile setup timed out. Reload and try again.')),
          MOBILE.readinessTimeoutMilliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
