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
