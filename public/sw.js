// Service Worker for PWA
const CACHE_NAME = 'durable-object-starter-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', event => {
  // Skip caching for API requests (non-GET or specific API endpoints)
  const url = new URL(event.request.url);
  const apiEndpoints = ['/message', '/subscribe', '/testSubscribe', '/test', '/testGet', '/list', '/repro'];
  const isApiRequest = apiEndpoints.some(endpoint => url.pathname === endpoint || url.pathname.startsWith(endpoint + '/'));
  
  if (isApiRequest || event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }
        
        // Otherwise fetch from network and cache in background
        return fetch(event.request)
          .then(response => {
            // Cache successful responses for static assets in background
            if (response.ok) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseToCache))
                .catch(err => console.error('Cache error:', err));
            }
            return response;
          })
          .catch(() => {
            // Return a basic offline page if fetch fails
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// Listen to push events.
self.addEventListener('push', event => {
  // Check if the user has granted permission to display notifications.
  if (Notification.permission === "granted") {
    // Get the notification data from the server.
    const notificationText = event.data.text();

    // Display a notification.
    const showNotificationPromise = self.registration.showNotification('Sample Push', {
      body: notificationText
    });

    // Keep the service worker running until the notification is displayed.
    event.waitUntil(showNotificationPromise);
  }
});
