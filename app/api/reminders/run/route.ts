import { NextResponse } from "next/server";
import { adminAuth, HAS_ADMIN_CONFIG, isAdminUid } from "@/src/lib/firebase-admin";
import { sendDueMeetingReminders } from "@/src/lib/meeting-reminders";

export const runtime = "nodejs";

/**
 * Manually fires the same check the production server otherwise runs once a
 * minute on its own (see instrumentation.ts) — the interval only starts in
 * production, so this is how a reminder can actually be tested from a
 * `next dev` session instead of waiting for a real deploy.
 */
export async function POST(request: Request) {
  try {
    if (!HAS_ADMIN_CONFIG) {
      return NextResponse.json(
        { error: "Firebase Admin isn't configured." },
        { status: 501 }
      );
    }

    const authorization = request.headers.get("authorization") ?? "";
    const idToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!idToken) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const caller = await adminAuth().verifyIdToken(idToken);

    if (!(await isAdminUid(caller.uid))) {
      return NextResponse.json(
        { error: "Only an admin can trigger this." },
        { status: 403 }
      );
    }

    await sendDueMeetingReminders();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[reminders/run]", error);
    return NextResponse.json({ error: "Could not run the check." }, { status: 500 });
  }
}
