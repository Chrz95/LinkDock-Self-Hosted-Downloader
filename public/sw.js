/** Only public offline assets are cached; API responses, source URLs and downloaded files are never cached. */
const PUBLIC_CACHE = 'linkdock-public-v23';
/** Owned cache prefix avoids disturbing unrelated service-worker state. */
const CACHE_PREFIX = 'linkdock-public-';
/** Exact public fallback assets contain no owner data or authenticated app state. */
const PUBLIC_ASSETS = ['/offline.html', '/icon-192.png', '/icon-512.png'];
/** Notification content is bounded before presentation; its destination is always the station root. */
const MAXIMUM_BODY_LENGTH = 256;
/** Visible labels and notification grouping used across worker events. */
const ALERT = { title: 'LinkDock', fallback: 'Open your station to check your downloads.', tag: 'linkdock-alert' };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PUBLIC_CACHE).then(async (cache) => {
      await cache.addAll(
        PUBLIC_ASSETS.map(
          (asset) =>
            new Request(asset, {
              credentials: 'omit',
              cache: 'reload',
              redirect: 'error',
            }),
        ),
      );
      await self.skipWaiting();
    }),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== PUBLIC_CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});
self.addEventListener('fetch', (event) => {
  const target = new URL(event.request.url);
  if (target.origin !== self.location.origin || target.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const offline = await caches.match('/offline.html', { cacheName: PUBLIC_CACHE });
        return offline ?? Response.error();
      }),
    );
  } else if (PUBLIC_ASSETS.includes(target.pathname)) {
    event.respondWith(
      caches.match(target.pathname, { cacheName: PUBLIC_CACHE }).then((cached) => cached ?? fetch(event.request)),
    );
  }
});
self.addEventListener('push', (event) => {
  let body = ALERT.fallback;
  try {
    const payload = event.data?.json();
    if (payload && typeof payload.body === 'string') {
      body = payload.body.slice(0, MAXIMUM_BODY_LENGTH);
    }
  } catch {
    /* A malformed provider payload still produces a visible, generic user notification. */
  }
  event.waitUntil(
    self.registration.showNotification(ALERT.title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: ALERT.tag,
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
      } else {
        await self.clients.openWindow('/#downloads');
      }
    }),
  );
});
