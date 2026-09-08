import { NextResponse } from "next/server";
import { DEFAULT_SLOT_MINUTES } from "@/src/lib/availability";
import { bearerToken, rtdbGet, rtdbPush, rtdbSet, verifyIdToken } from "@/src/lib/rtdb-server";

export const runtime = "nodejs";

function seg(value: string) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

interface VisitorRequestRecord {
  staffId?: string;
  visitorName?: string;
  company?: string;
  purpose?: string;
  requestedFor?: number | null;
  postponedTo?: number | null;
  status?: string;
}

/**
 * Writes an approved visit into the staff member's own calendar.
 *
 * Separate from the approval itself: the approval is a database write the
 * browser already made, and the visitor has been told about it. A calendar
 * failure here must never undo that — it downgrades to "approved, not on the
 * calendar" rather than an error the visitor sees.
 *
 * The write carries the approver's own ID token, so it is authorised by the
 * exact same database rule that let the approval itself through a moment ago
 * — the staff member's own visit, or an admin acting on their behalf.
 */
export async function POST(request: Request) {
  try {
    const idToken = bearerToken(request);
    await verifyIdToken(idToken);

    const requestId = seg(
      ((await request.json()) as { requestId?: string }).requestId ?? ""
    );

    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId." }, { status: 400 });
    }

    // Read the visit server-side rather than trusting the body — the times
    // and the target calendar must come from the stored record.
    const visit = await rtdbGet<VisitorRequestRecord>(
      `visitor_requests/${requestId}`,
      idToken
    );

    if (!visit || !(visit.status === "approved" || visit.status === "postponed")) {
      return NextResponse.json(
        { error: "That visit is not approved." },
        { status: 400 }
      );
    }

    const isPostponed = visit.status === "postponed";

    if (!visit.staffId) {
      return NextResponse.json({ calendarEventId: null, skipped: "no-staff" });
    }

    // "Meet now" still earns a calendar block, starting immediately. A
    // postponed visit uses the time staff rescheduled it to instead.
    const start = isPostponed
      ? visit.postponedTo ?? Date.now()
      : visit.requestedFor ?? Date.now();
    const end = start + DEFAULT_SLOT_MINUTES * 60_000;

    const calendarEventId = await rtdbPush(
      `calendar_events/${visit.staffId}`,
      {
        title: `Visitor: ${visit.visitorName ?? "Visitor"}${
          visit.company ? ` (${visit.company})` : ""
        }`,
        start,
        end,
        allDay: false,
        isVisit: true,
        // An instant "meet now" approval has no lead time to be reminded
        // about; a postponed visit has a real future slot, so it's treated
        // the same as a manually-added meeting for reminder purposes.
        source: isPostponed ? "postponed" : "approved",
        ...(visit.purpose ? { location: visit.purpose } : {}),
      },
      idToken
    );

    // Public mirror for the kiosk's free/busy check — timing only, no title.
    await rtdbSet(
      `busy_blocks/${visit.staffId}/${calendarEventId}`,
      { start, end },
      idToken
    );

    await rtdbSet(`visitor_requests/${requestId}/calendarEventId`, calendarEventId, idToken);

    return NextResponse.json({ calendarEventId });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_SIGNED_IN") {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }

    console.error("[visitor-app] confirm", error);
    return NextResponse.json(
      { error: "Could not add it to the calendar." },
      { status: 500 }
    );
  }
}
