// FleetOps Driver App - Push Notification & Background Service Worker
// Reference: Head Office Specification Change 6 (Sound & Vibration for new/changed/cancelled tasks)

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 1. Handle incoming Web Push notifications (even when app/tab is closed)
self.addEventListener('push', (event) => {
  let payload = {
    title: 'FleetOps Task Alert',
    body: 'New task assigned or updated by FleetOps Manager',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const json = event.data.json();
      payload = { ...payload, ...json };
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }

  const notificationOptions = {
    body: payload.body,
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-192x192.png',
    vibrate: [300, 150, 300, 150, 450], // Standard phone ring vibration pattern
    tag: payload.tag || ('fleetops-task-' + Date.now()),
    renotify: true,
    requireInteraction: true,
    data: payload.data || { url: '/' },
    actions: [
      { action: 'open_app', title: 'Open FleetOps' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions)
  );
});

// 2. Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // If no window is open, launch a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// 3. Handle messages from client tabs (e.g. testing notifications or triggering background chime)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_TASK_NOTIFICATION') {
    const { title, body, data } = event.data;
    self.registration.showNotification(title || 'FleetOps Task Alert', {
      body: body || 'Task status updated',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      vibrate: [300, 150, 300, 150, 450],
      tag: 'fleetops-local-' + Date.now(),
      renotify: true,
      requireInteraction: true,
      data: data || { url: '/' }
    });
  }
});
