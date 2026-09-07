"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what makes the app installable — and
 * what will receive push notifications once those are built.
 */
export default function ServiceWorker() {
  useEffect(() => {
    // Production only. Installability needs HTTPS regardless, and a service
    // worker in development mostly serves to confuse — a stale one survives
    // edits, and embedded preview browsers refuse to register it at all,
    // filling the console with failures that mean nothing.
    if (process.env.NODE_ENV !== "production") return;

    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      // Only affects installability, so it must not take over the screen.
      console.warn("[visitor-app] Service worker registration failed.", error);
    });
  }, []);

  return null;
}
