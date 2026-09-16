import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
const env = Object.fromEntries(
  readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#"))
    .map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];})
);
const app = initializeApp({
  credential: cert({ projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, clientEmail: env.ADMIN_SDK_CLIENT_EMAIL, privateKey: env.ADMIN_SDK_PRIVATE_KEY.replace(/\\n/g,"\n") }),
  databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});
const db = getDatabase(app);
const staff = (await db.ref("staff").get()).val() || {};

const FIXED = new Set(["Management","Accounts","Sales","Process","Digital Marketing","HR","Admin"]);
console.log("=== every mismatch before fixing ===");
for (const [id, rec] of Object.entries(staff)) {
  if (rec.department && !FIXED.has(rec.department)) {
    console.log(`${rec.name} -> "${rec.department}"`);
  }
}
