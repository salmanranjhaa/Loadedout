self.__WB_MANIFEST;

const CACHE_NAME = "loadedout-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

const API_CACHE_NAME = "loadedout-api-v2";
const API_ROUTES = ["/api/v1/workout/", "/api/v1/meals/today", "/api/v1/analytics/dashboard", "/api/v1/schedule/"];

// Install: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for static, network-first for API
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests for caching (but allow for sync)
  if (request.method !== "GET") {
    // Background sync for mutations
    if (!navigator.onLine) {
      event.respondWith(
        Promise.resolve(
          new Response(JSON.stringify({ queued: true }), {
            status: 202,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      queueRequest(request.clone());
    }
    return;
  }

  // API routes: network first, fallback to cache
  if (API_ROUTES.some((route) => url.pathname.startsWith(route))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(API_CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: cache first
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
      );
    })
  );
});

// Background sync
let syncQueue = [];

function queueRequest(request) {
  request.text().then((body) => {
    syncQueue.push({ url: request.url, method: request.method, headers: [...request.headers], body });
    self.registration.sync.register("loadedout-sync").catch(() => {});
  });
}

self.addEventListener("sync", (event) => {
  if (event.tag === "loadedout-sync") {
    event.waitUntil(processSyncQueue());
  }
});

async function processSyncQueue() {
  const queue = [...syncQueue];
  syncQueue = [];
  for (const item of queue) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers.reduce((h, [k, v]) => ({ ...h, [k]: v }), {}),
        body: item.body,
      });
    } catch {
      syncQueue.push(item);
    }
  }
  if (syncQueue.length === 0) {
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "SYNC_COMPLETE" }));
    });
  }
}

// Push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Loadedout", {
      body: data.body || "Time to check in!",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "default",
      data: data.data || {},
      actions: data.actions || [],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length > 0) {
        clients[0].focus();
      } else {
        self.clients.openWindow("/");
      }
    })
  );
});
