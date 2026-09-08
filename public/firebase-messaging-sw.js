/*
 * The app's one and only service worker.
 *
 * It has to stay the only one registered at "/". Registering a second script
 * at the same scope replaces this one, and a worker with no push handler
 * accepts every background message and silently shows nothing — which is
 * exactly what happened while a separate caching worker lived at /sw.js.
 *
 * Runs outside the Next.js bundle, so it cannot read env vars. These are the
 * same NEXT_PUBLIC_FIREBASE_* values already visible in the browser, written
 * out plainly instead.
 */
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBJT43YuYjpFTTYSu8HbZ7eqQp4lQxuObc",
  authDomain: "pcred-visitors.firebaseapp.com",
  databaseURL: "https://pcred-visitors-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pcred-visitors",
  storageBucket: "pcred-visitors.firebasestorage.app",
  messagingSenderId: "623340940557",
  appId: "1:623340940557:web:09d60000168fbe015cd444",
});

/*
 * Installs the SDK's own push and notificationclick handlers, and nothing
 * else deliberately: every message this app sends carries a notification
 * payload, which the SDK displays by itself. Calling showNotification here
 * as well would deliver two notifications for one visitor, and iOS drops a
 * push subscription whose worker takes a push without displaying anything.
 * Where the tap leads is set server-side, via webpush.fcmOptions.link.
 */
firebase.messaging();

self.addEventListener("install", () => {
  // Take over straight away rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A fetch handler is required for installability. Caches nothing on purpose:
// serving a stale shell or a stale visitor list to a realtime app is worse
// than having no offline support at all.
self.addEventListener("fetch", () => {});
