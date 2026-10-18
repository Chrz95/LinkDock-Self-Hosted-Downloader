import { API_PATH, HTTP_METHOD } from '../../../shared/contracts';
import { NOTIFICATION_PATH, type PushConfiguration } from '../../../shared/notifications';
import { requestApi } from '../../lib/api/requestApi';
import { getMobileRegistration } from './serviceWorker';

/** Browser permission strings are distinct from station authentication state. */
const GRANTED_PERMISSION = 'granted';

/** Returns browser capability without prompting. @returns {boolean} Whether optional push setup can run. */
export function supportsPush(): boolean {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Decodes the station's public application key into the buffer required by PushManager.
 * @param {string} value - URL-safe base64 public key.
 * @returns {ArrayBuffer} Public P-256 application server key.
 */
export function decodeApplicationKey(value: string): ArrayBuffer {
  const base64Block = 4;
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized.padEnd(Math.ceil(normalized.length / base64Block) * base64Block, '='));
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return buffer;
}

/**
 * Registers a browser only after an explicit permission click; changed station identities get fresh subscriptions.
 * @param {PushConfiguration} configuration - Public station push setup.
 * @returns {Promise<void>} Browser and station registration are both active.
 */
export async function enableBrowserAlerts(configuration: PushConfiguration): Promise<void> {
  if (!supportsPush() || !configuration.enabled || !configuration.publicKey) {
    throw new Error('Set up HTTPS and browser alerts on the station before enabling this device.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== GRANTED_PERMISSION) {
    throw new Error('Alerts were not permitted. You can change this in your browser settings.');
  }
  const registration = await getMobileRegistration();
  const applicationKey = decodeApplicationKey(configuration.publicKey);
  let subscription = await registration.pushManager.getSubscription();
  const previousKey = subscription?.options.applicationServerKey;
  if (
    subscription &&
    (!previousKey ||
      new Uint8Array(previousKey).length !== applicationKey.byteLength ||
      !new Uint8Array(previousKey).every((value, index) => value === new Uint8Array(applicationKey)[index]))
  ) {
    if (!(await subscription.unsubscribe())) {
      throw new Error('The old browser registration could not be replaced. Try again.');
    }
    subscription = null;
  }
  const isNew = !subscription;
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationKey,
  });
  try {
    await requestApi(`${API_PATH.notifications}${NOTIFICATION_PATH.subscription}`, {
      method: HTTP_METHOD.post,
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch (error) {
    if (isNew) {
      await subscription.unsubscribe().catch(() => false);
    }
    throw error;
  }
}

/**
 * Stops local delivery first so alerts can be disabled even when the station is temporarily unreachable.
 * @returns {Promise<void>} Local browser registration is removed; stale server endpoints expire automatically.
 */
export async function disableBrowserAlerts(): Promise<void> {
  const subscription = await (await getMobileRegistration()).pushManager.getSubscription();
  if (!subscription) {
    return;
  }
  if (!(await subscription.unsubscribe())) {
    throw new Error('Your browser could not disable alerts. Try again.');
  }
  try {
    await requestApi(`${API_PATH.notifications}${NOTIFICATION_PATH.unsubscribe}`, {
      method: HTTP_METHOD.post,
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } catch {
    throw new Error('Alerts are disabled here. The station could not remove its old registration yet.');
  }
}

/** Sends an explicit test to this device only. @returns {Promise<void>} Provider accepted the test request. */
export async function testBrowserAlerts(): Promise<void> {
  const subscription = await (await getMobileRegistration()).pushManager.getSubscription();
  await requestApi(`${API_PATH.notifications}${NOTIFICATION_PATH.test}`, {
    method: HTTP_METHOD.post,
    body: JSON.stringify({ endpoint: subscription?.endpoint }),
  });
}

/** Checks both browser and station state. @returns {Promise<boolean>} Current device is subscribed on both sides. */
export async function isBrowserSubscribed(): Promise<boolean> {
  const subscription = await (await getMobileRegistration()).pushManager.getSubscription();
  if (!subscription) {
    return false;
  }
  const state = await requestApi<{ subscribed: boolean }>(`${API_PATH.notifications}${NOTIFICATION_PATH.status}`, {
    method: HTTP_METHOD.post,
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  return state.subscribed;
}
