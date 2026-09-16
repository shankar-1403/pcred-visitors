import { ref, set } from "firebase/database";
import { app, db, HAS_FIREBASE_CONFIG } from "./firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export const HAS_PUSH_CONFIG = Boolean(
  HAS_FIREBASE_CONFIG && VAPID_KEY?.trim() && typeof window !== "undefined"
);

/**
 * This browser's push token, asking for notification permission first if it
 * has never been answered. Returns null whenever push simply isn't available
 * — an unsupported browser, a refused prompt, no configuration — so every
 * caller treats push as a bonus rather than something to depend on.
 *
 * Must be reached from a real click: browsers refuse a permission prompt that
 * wasn't asked for by the person in front of them.
 */
export async function requestPushToken(): Promise<string | null> {
  if (!HAS_PUSH_CONFIG) return null;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return null;
  }

  try {
    const { getMessaging, getToken, isSupported } = await import(
      "firebase/messaging"
    );

    // Safari only gained web push in 16.4, and only for a home-screen app.
    // Asking an unsupported browser for a token throws rather than returns.
    if (!(await isSupported())) return null;

    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }

    if (Notification.permission !== "granted") return null;

    // The same worker the rest of the app registers — one script at "/", or
    // whichever registered last would replace the other and drop pushes.
    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const registration = await navigator.serviceWorker.ready;

    const token = await getToken(getMessaging(app!), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    return token || null;
  } catch (error) {
    // Push is a bonus on top of what the screen already shows, so a failure
    // here must never block the page it was called from.
    console.error("[visitor-app] Could not get a push token:", error);
    return null;
  }
}

/**
 * Registers this device for push and saves the token against the staff
 * member's own record — a person can have several (phone, laptop, …), so
 * it's a set of tokens, not one field. Only called once Notification
 * permission is already granted; that's a separate, earlier step.
 */
export async function registerPushToken(staffId: string): Promise<void> {
  if (!db) return;

  const token = await requestPushToken();
  if (!token) return;

  try {
    await set(ref(db, `staff/${staffId}/fcmTokens/${token}`), true);
  } catch (error) {
    console.error("[visitor-app] Could not register for push:", error);
  }
}

/**
 * FCM only hands a push to the service worker's background handler while no
 * tab of the app has focus. The kiosk tablet is the opposite of that: its tab
 * is open and focused for as long as the device is switched on. A push that
 * arrives while this page has focus is instead delivered here, to onMessage —
 * and with nothing listening for it, it was received and silently dropped.
 *
 * Shown through the service worker's own showNotification() rather than the
 * page-level `new Notification()` — the constructor throws outright on most
 * mobile browsers, and on desktop Chrome specifically mutes the sound when
 * the tab that raised it is the focused one, exactly this page's situation.
 * Routing through the worker is the same call the background case already
 * makes, so it rings with the device's real notification sound either way.
 *
 * Safe to call more than once — a second registration on the same messaging
 * instance replaces the first rather than stacking a duplicate.
 */
export async function listenForForegroundPush(): Promise<void> {
  if (!HAS_PUSH_CONFIG) return;
  if (!("serviceWorker" in navigator)) return;

  try {
    const { getMessaging, onMessage, isSupported } = await import(
      "firebase/messaging"
    );

    if (!(await isSupported())) return;
    if (Notification.permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;

    onMessage(getMessaging(app!), (payload) => {
      const { title, body } = payload.notification ?? {};
      if (!title) return;

      void registration
        .showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: payload.data?.requestId
            ? `visit-${payload.data.requestId}`
            : undefined,
        })
        .catch(() => {
          // The page itself already reflects the same outcome via its own
          // live data, so a notification that can't be shown costs nothing.
        });
    });
  } catch (error) {
    console.error("[visitor-app] Could not listen for foreground push:", error);
  }
}
