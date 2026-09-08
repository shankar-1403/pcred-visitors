import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** False until this app's own Firebase project is filled into .env.local. */
export const HAS_FIREBASE_CONFIG = Boolean(
  firebaseConfig.apiKey?.trim() && firebaseConfig.databaseURL?.trim()
);

if (!HAS_FIREBASE_CONFIG) {
  // warn, not error: Next's dev overlay hijacks the screen for console.error,
  // which would cover the setup notice telling you how to fix it.
  console.warn(
    "[visitor-app] Firebase is not configured. Copy .env.example to .env.local " +
      "and fill in this app's own Firebase project, then restart the dev server."
  );
}

// getDatabase() throws outright without a databaseURL, so the SDK is only
// initialised once real config exists. Screens show the setup notice until
// then rather than failing in a different way on each page.
const app: FirebaseApp | null = HAS_FIREBASE_CONFIG
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export { app };
export const auth = (app ? getAuth(app) : null) as Auth;
export const db = (app ? getDatabase(app) : null) as Database;

if (auth) {
  // Staff sign in once and stay signed in — across reloads, browser restarts
  // and phone reboots — until they press Sign out. Stated explicitly rather
  // than relying on the SDK default, because an unexpected sign-out here
  // silently stops a staff member receiving visitor alerts.
  void setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("[visitor-app] Could not set persistent sign-in.", error);
  });
}
