/*
 * Handles a push while no tab of this app is open. Runs entirely separately
 * from the main app bundle, so it can't read Next.js env vars — these are
 * the same NEXT_PUBLIC_FIREBASE_* values already visible in the browser,
 * just written out plainly here instead.
 */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBJT43YuYjpFTTYSu8HbZ7eqQp4lQxuObc",
  authDomain: "pcred-visitors.firebaseapp.com",
  databaseURL: "https://pcred-visitors-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pcred-visitors",
  storageBucket: "pcred-visitors.firebasestorage.app",
  messagingSenderId: "623340940557",
  appId: "1:623340940557:web:09d60000168fbe015cd444",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};

  self.registration.showNotification(title || "Visitor at the door", {
    body: body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.data?.requestId || "visitor-alert",
    data: payload.data || {},
  });
});

// Tapping the notification focuses an already-open tab if there is one,
// otherwise opens a fresh one straight to the inbox.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("/staff") && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("/staff");
      }
    })
  );
});
