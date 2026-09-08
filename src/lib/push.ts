import { ref, set } from "firebase/database";
import { app, db, HAS_FIREBASE_CONFIG } from "./firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export const HAS_PUSH_CONFIG = Boolean(
  HAS_FIREBASE_CONFIG && VAPID_KEY?.trim() && typeof window !== "undefined"
);

/**
 * Registers this device for push and saves the token against the staff
 * member's own record — a person can have several (phone, laptop, …), so
 * it's a set of tokens, not one field. Only called once Notification
 * permission is already granted; that's a separate, earlier step.
 */
export async function registerPushToken(staffId: string): Promise<void> {
  if (!HAS_PUSH_CONFIG || !db) return;
  if (!("serviceWorker" in navigator)) return;

  try {
    const { getMessaging, getToken, isSupported } = await import(
      "firebase/messaging"
    );

    // Safari only gained web push in 16.4, and only for a home-screen app.
    // Asking an unsupported browser for a token throws rather than returns.
    if (!(await isSupported())) return;

    // The same worker the rest of the app registers — one script at "/", or
    // whichever registered last would replace the other and drop pushes.
    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const registration = await navigator.serviceWorker.ready;

    const token = await getToken(getMessaging(app!), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) return;

    await set(ref(db, `staff/${staffId}/fcmTokens/${token}`), true);
  } catch (error) {
    // Push is a bonus on top of the in-app alert, which still works either
    // way — a failure here must never block the rest of the page.
    console.error("[visitor-app] Could not register for push:", error);
  }
}
