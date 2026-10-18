// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { getMobileRegistration } from '../src/features/mobile/serviceWorker';
import { requestApi } from '../src/lib/api/requestApi';
import {
  enableBrowserAlerts,
  disableBrowserAlerts,
  isBrowserSubscribed,
  supportsPush,
} from '../src/features/mobile/browserPush';
import { API_PATH } from '../shared/contracts';
import { NOTIFICATION_PATH } from '../shared/notifications';

vi.mock('../src/features/mobile/serviceWorker', () => ({ getMobileRegistration: vi.fn() }));
vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
const configuration = { enabled: true, publicKey: 'AQID', reason: null };

/**
 * Provides a browser with opt-in permission and a controlled push manager.
 * @returns {object} Native operation spies; no real permissions or providers are used.
 */
function createBrowser() {
  const requestPermission = vi.fn().mockResolvedValue('granted');
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('Notification', { requestPermission });
  vi.stubGlobal('PushManager', class {});
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const subscription = {
    endpoint: 'https://push.example/device',
    unsubscribe,
    options: {
      applicationServerKey: Uint8Array.from(atob(configuration.publicKey), (value) => value.charCodeAt(0)).buffer,
    },
    toJSON: () => ({ endpoint: 'https://push.example/device', keys: { p256dh: 'key', auth: 'auth' } }),
  };
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(subscription),
  };
  vi.mocked(getMobileRegistration).mockResolvedValue({ pushManager } as unknown as ServiceWorkerRegistration);
  vi.mocked(requestApi).mockResolvedValue({ subscribed: true });
  return { requestPermission, subscription, pushManager, unsubscribe };
}
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.mocked(getMobileRegistration).mockReset();
  vi.mocked(requestApi).mockReset();
});

it('checks capability and saved registration without asking for notification permission', async () => {
  const browser = createBrowser();
  expect(supportsPush()).toBe(true);
  expect(await isBrowserSubscribed()).toBe(false);
  expect(browser.requestPermission).not.toHaveBeenCalled();
  expect(browser.pushManager.subscribe).not.toHaveBeenCalled();
  browser.pushManager.getSubscription.mockResolvedValue(browser.subscription);
  expect(await isBrowserSubscribed()).toBe(true);
  expect(requestApi).toHaveBeenCalledWith(
    `${API_PATH.notifications}${NOTIFICATION_PATH.status}`,
    expect.objectContaining({ body: JSON.stringify({ endpoint: browser.subscription.endpoint }) }),
  );
});

it('creates user-visible push only after an explicit permission grant and saves it on the station', async () => {
  const browser = createBrowser();
  await enableBrowserAlerts(configuration);
  expect(browser.requestPermission).toHaveBeenCalledTimes(1);
  expect(browser.pushManager.subscribe).toHaveBeenCalledWith({
    userVisibleOnly: true,
    applicationServerKey: browser.subscription.options.applicationServerKey,
  });
  expect(requestApi).toHaveBeenCalledWith(
    `${API_PATH.notifications}${NOTIFICATION_PATH.subscription}`,
    expect.objectContaining({ body: JSON.stringify(browser.subscription.toJSON()) }),
  );
});

it('does not register when permission is denied and cleans up a new subscription if station saving fails', async () => {
  const browser = createBrowser();
  browser.requestPermission.mockResolvedValueOnce('denied');
  await expect(enableBrowserAlerts(configuration)).rejects.toThrow('not permitted');
  expect(browser.pushManager.subscribe).not.toHaveBeenCalled();
  expect(requestApi).not.toHaveBeenCalled();
  vi.mocked(requestApi).mockRejectedValueOnce(new Error('Station offline'));
  await expect(enableBrowserAlerts(configuration)).rejects.toThrow('Station offline');
  expect(browser.unsubscribe).toHaveBeenCalledTimes(1);
});

it('revokes browser delivery before attempting server cleanup when the station is offline', async () => {
  const browser = createBrowser();
  browser.pushManager.getSubscription.mockResolvedValue(browser.subscription);
  vi.mocked(requestApi).mockImplementation(async () => {
    expect(browser.unsubscribe).toHaveBeenCalledTimes(1);
    throw new Error('Station offline');
  });
  await expect(disableBrowserAlerts()).rejects.toThrow('Alerts are disabled here');
});
