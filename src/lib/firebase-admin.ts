import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

/**
 * Admin SDK, server-side only. Never import this into a client component.
 *
 * Creating staff logins has to happen here rather than in the browser:
 * `createUserWithEmailAndPassword` would sign the admin out and into the new
 * account, and leaving public sign-up enabled would let anyone with the web
 * API key mint themselves an account.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
const DATABASE_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

export const HAS_ADMIN_CONFIG = Boolean(
  PROJECT_ID && CLIENT_EMAIL && PRIVATE_KEY && DATABASE_URL
);

const APP_NAME = "visitor-admin";

function adminApp() {
  if (!HAS_ADMIN_CONFIG) {
    throw new Error(
      "Firebase Admin is not configured — set FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return getApp(APP_NAME);

  return initializeApp(
    {
      credential: cert({
        projectId: PROJECT_ID,
        clientEmail: CLIENT_EMAIL,
        privateKey: PRIVATE_KEY,
      }),
      databaseURL: DATABASE_URL,
    },
    APP_NAME
  );
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getDatabase(adminApp());

/** True when this uid is recorded as an admin. */
export async function isAdminUid(uid: string): Promise<boolean> {
  const snapshot = await adminDb().ref(`roles/${uid}/role`).get();
  return snapshot.val() === "admin";
}
