self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title || "New doodle", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "scribbles",
      renotify: true,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.postMessage({ type: "refresh" }); return c.focus(); }
      }
      // Fall back to the saved personal link (kept by the page in the SW cache).
      return caches.open("scribbles-meta").then((cache) => cache.match("/__home")).then((r) =>
        r ? r.text() : "/"
      ).then((url) => self.clients.openWindow(url));
    })
  );
});
