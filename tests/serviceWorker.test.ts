import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const ORIGIN = 'https://station.example';
const source = readFileSync('public/sw.js', 'utf8');
/** Minimal worker event contract used to observe asynchronous work and intercepted responses. */
interface WorkerEvent {
  request?: { url: string; method: string; mode?: string };
  data?: { json: () => unknown };
  notification?: { close: () => void; data?: unknown };
  waitUntil: ReturnType<typeof vi.fn>;
  respondWith: ReturnType<typeof vi.fn>;
}
/** A real Request with the worker's URL base for relative public assets. */
class WorkerRequest extends Request {
  /**
   * Resolves the fixed worker asset path like a browser.
   * @param {string} url - Public asset path.
   * @param {RequestInit} options - Cache and credential restrictions.
   */
  constructor(url: string, options: RequestInit) {
    super(new URL(url, ORIGIN), options);
  }
}
/**
 * Runs the shipped worker in an isolated VM with in-memory browser surfaces.
 * @returns {object} Event dispatch and observable browser operations.
 */
function createWorker() {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const addAll = vi.fn().mockResolvedValue(undefined);
  const offline = new Response('Public reconnect page');
  const caches = {
    open: vi.fn().mockResolvedValue({ addAll }),
    match: vi.fn().mockResolvedValue(offline),
    keys: vi.fn().mockResolvedValue(['linkdock-public-old', 'unrelated-cache']),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockResolvedValue(new Response('Private network response'));
  const self = {
    addEventListener: (type: string, handler: (event: WorkerEvent) => void) => handlers.set(type, handler),
    location: { origin: ORIGIN },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn().mockResolvedValue([]),
      openWindow: vi.fn().mockResolvedValue(undefined),
    },
  };
  runInNewContext(source, { self, caches, fetch, URL, Request: WorkerRequest, Response });
  /**
   * Dispatches one browser event and waits for its declared asynchronous work.
   * @param {string} type - Registered worker event type.
   * @param {Partial<WorkerEvent>} [details] - Controlled event data.
   * @returns {Promise<WorkerEvent>} Event interception spies.
   */
  async function dispatch(type: string, details: Partial<WorkerEvent> = {}): Promise<WorkerEvent> {
    const event: WorkerEvent = { waitUntil: vi.fn(), respondWith: vi.fn(), ...details };
    handlers.get(type)!(event);
    await Promise.all([...event.waitUntil.mock.calls, ...event.respondWith.mock.calls].map((call) => call[0]));
    return event;
  }
  return { dispatch, caches, addAll, fetch, self, offline };
}

it('caches only fixed public assets without credentials and removes only owned old caches', async () => {
  const worker = createWorker();
  await worker.dispatch('install');
  const requests = worker.addAll.mock.calls[0]![0] as Request[];
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    '/offline.html',
    '/icon-192.png',
    '/icon-512.png',
  ]);
  expect(requests.every((request) => request.credentials === 'omit' && request.redirect === 'error')).toBe(true);
  await worker.dispatch('activate');
  expect(worker.caches.delete).toHaveBeenCalledExactlyOnceWith('linkdock-public-old');
});

it('never intercepts API, downloaded files, arbitrary scripts or cross-origin requests', async () => {
  const worker = createWorker();
  for (const url of [`${ORIGIN}/api/downloads/private/file`, `${ORIGIN}/assets/app.js`, 'https://other.example/a']) {
    const event = await worker.dispatch('fetch', { request: { url, method: 'GET' } });
    expect(event.respondWith).not.toHaveBeenCalled();
  }
  expect(worker.caches.match).not.toHaveBeenCalled();
  expect(worker.fetch).not.toHaveBeenCalled();
});

it('falls back to a public reconnect page when navigation is offline without saving the private response', async () => {
  const worker = createWorker();
  worker.fetch.mockRejectedValueOnce(new Error('Offline'));
  const event = await worker.dispatch('fetch', {
    request: { url: `${ORIGIN}/?share_url=private`, method: 'GET', mode: 'navigate' },
  });
  await expect(event.respondWith.mock.calls[0]![0]).resolves.toBe(worker.offline);
  expect(worker.caches.match).toHaveBeenCalledExactlyOnceWith('/offline.html', { cacheName: 'linkdock-public-v23' });
  expect(worker.caches.open).not.toHaveBeenCalled();
});

it('bounds malformed push presentation and opens only the station when a notification is tapped', async () => {
  const worker = createWorker();
  await worker.dispatch('push', {
    data: {
      json: () => {
        throw new Error('Malformed');
      },
    },
  });
  expect(worker.self.registration.showNotification).toHaveBeenCalledWith(
    'LinkDock',
    expect.objectContaining({ body: 'Open your station to check your downloads.' }),
  );
  const maximumLength = 256;
  await worker.dispatch('push', {
    data: { json: () => ({ body: 'x'.repeat(maximumLength + 1), url: 'https://bad.example' }) },
  });
  expect(worker.self.registration.showNotification).toHaveBeenLastCalledWith(
    'LinkDock',
    expect.objectContaining({ body: 'x'.repeat(maximumLength) }),
  );
  await worker.dispatch('notificationclick', {
    notification: { close: vi.fn(), data: { url: 'https://bad.example' } },
  });
  expect(worker.self.clients.openWindow).toHaveBeenCalledExactlyOnceWith('/#downloads');
});
