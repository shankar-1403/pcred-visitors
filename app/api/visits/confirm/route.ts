import { NextResponse } from "next/server";
import { createVisitEvent, HAS_CALENDAR_CONFIG } from "@/src/lib/google-calendar";
import { DEFAULT_SLOT_MINUTES } from "@/src/lib/availability";

export const runtime = "nodejs";

const RTDB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

function seg(value: string) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

/** Confirms the caller is a signed-in staff member, not the public kiosk. */
async function verifyIdToken(idToken: string) {
  if (!FIREBASE_API_KEY) throw new Error("Firebase API key is not configured.");

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) {
    throw new Error("Invalid or expired sign-in. Please log in again.");
  }

  return response.json();
}

/**
 * Writes an approved visit into the staff member's calendar.
 *
 * Separate from the approval itself: the approval is a database write the
 * browser already made, and the visitor has been told about it. A calendar
 * failure here must never undo that — it downgrades to "approved, not on the
 * calendar" rather than an error the visitor sees.
 */
export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const idToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!idToken) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    await verifyIdToken(idToken);

    if (!HAS_CALENDAR_CONFIG) {
      return NextResponse.json({ calendarEventId: null, skipped: "no-config" });
    }

    if (!RTDB_URL) throw new Error("Firebase database URL not configured.");

    const requestId = seg(((await request.json()) as { requestId?: string }).requestId ?? "");

    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId." }, { status: 400 });
    }

    // Read the visit server-side rather than trusting the body — the times and
    // the target calendar must come from the stored record.
    const stored = await fetch(`${RTDB_URL}/visitor_requests/${requestId}.json`, {
      cache: "no-store",
    });

    if (!stored.ok) throw new Error(`Visit lookup failed: ${stored.status}`);

    const visit = (await stored.json()) as {
      staffEmail?: string;
      visitorName?: string;
      visitorPhone?: string;
      company?: string;
      purpose?: string;
      purposeNote?: string;
      requestedFor?: number | null;
      status?: string;
    } | null;

    if (!visit || visit.status !== "approved") {
      return NextResponse.json(
        { error: "That visit is not approved." },
        { status: 400 }
      );
    }

    if (!visit.staffEmail) {
      return NextResponse.json({ calendarEventId: null, skipped: "no-calendar" });
    }

    // "Meet now" still earns a calendar block, starting immediately.
    const start = visit.requestedFor ?? Date.now();
    const end = start + DEFAULT_SLOT_MINUTES * 60_000;

    const calendarEventId = await createVisitEvent({
      staffEmail: visit.staffEmail,
      start,
      end,
      visitorName: visit.visitorName ?? "Visitor",
      company: visit.company,
      purpose: visit.purpose,
      note: visit.purposeNote,
      visitorPhone: visit.visitorPhone,
    });

    if (calendarEventId) {
      await fetch(`${RTDB_URL}/visitor_requests/${requestId}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarEventId }),
      });
    }

    return NextResponse.json({ calendarEventId });
  } catch (error) {
    console.error("[visitor-app] confirm", error);
    return NextResponse.json(
      { error: "Could not add it to the calendar." },
      { status: 500 }
    );
  }
}
