// Minimal service worker for push notifications
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.string() : {};
  const title = data.title || 'Notification';
  const options = {
    body: data.body || '',
    icon: data.icon || undefined
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
