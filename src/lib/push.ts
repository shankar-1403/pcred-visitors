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
