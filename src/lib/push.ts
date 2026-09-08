import { ref, set } from "firebase/database";
import { app, db, HAS_FIREBASE_CONFIG } from "./firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export const HAS_PUSH_CONFIG = Boolean(
  HAS_FIREBASE_CONFIG && VAPID_KEY?.trim() && typeof window !== "undefined"
);

/**
 * Registers this device for push and saves the token against the staff
 * member's own record — a person can have several (phone, laptop, …), so
 * it's a set of tokens, not one field. Only called after Notification
 * permission is already granted; that's a separate, earlier step.
 */
export async function registerPushToken(staffId: string): Promise<void> {
  if (!HAS_PUSH_CONFIG || !db) return;
  if (!("serviceWorker" in navigator)) return;

  try {
    const [{ getMessaging, getToken }, registration] = await Promise.all([
      import("firebase/messaging"),
      navigator.serviceWorker.register("/firebase-messaging-sw.js"),
    ]);

    const messaging = getMessaging(app!);
    const token = await getToken(messaging, {
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
