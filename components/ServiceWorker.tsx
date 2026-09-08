"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what makes the app installable and
 * what receives visitor alerts while the app is closed.
 */
export default function ServiceWorker() {
  useEffect(() => {
    // Production only. Installability needs HTTPS regardless, and a service
    // worker in development mostly serves to confuse — a stale one survives
    // edits, and embedded preview browsers refuse to register it at all,
    // filling the console with failures that mean nothing.
    if (process.env.NODE_ENV !== "production") return;

    if (!("serviceWorker" in navigator)) return;

    // Anyone who used the app before push existed still has the old
    // caching-only worker holding this scope. It has no push handler, so
    // leaving it in place would keep swallowing every visitor alert.
    const dropOldWorker = navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) =>
              (registration.active ?? registration.waiting ?? registration.installing)
                ?.scriptURL.endsWith("/sw.js")
            )
            .map((registration) => registration.unregister())
        )
      );

    void dropOldWorker
      .then(() => navigator.serviceWorker.register("/firebase-messaging-sw.js"))
      .catch((error) => {
        // Only affects installability, so it must not take over the screen.
        console.warn("[visitor-app] Service worker registration failed.", error);
      });
  }, []);

  return null;
}
