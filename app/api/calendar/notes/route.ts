import { NextResponse } from "next/server";
import {
  bearerToken,
  resolveStaffId,
  rtdbGet,
  rtdbSet,
  verifyIdToken,
} from "@/src/lib/rtdb-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saves what happened at a meeting, once it's over.
 *
 * Deliberately separate from the main /api/calendar route: that one refuses
 * to touch a visitor booking at all (its fields belong to the visitor-request
 * flow) and emails the client on every save, treating any edit as a freshly
 * scheduled meeting. Neither is true here — this note can go on either kind
 * of event, and writing it is a private record, not something to notify
 * anyone about.
 */

interface CalendarEventRecord {
  end?: number;
}

export async function PATCH(request: Request) {
  try {
    const idToken = bearerToken(request);
    const { email } = await verifyIdToken(idToken);
    const staffId = await resolveStaffId(email);

    if (!staffId) {
      return NextResponse.json(
        { error: "You're not on the staff directory yet. Ask an admin to add you." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as { id?: string; notes?: string };
    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json({ error: "Missing event id." }, { status: 400 });
    }

    const existing = await rtdbGet<CalendarEventRecord>(
      `calendar_events/${staffId}/${id}`,
      idToken
    );

    if (!existing) {
      return NextResponse.json({ error: "That event doesn't exist." }, { status: 404 });
    }

    // A note is a record of what happened — there's nothing to write yet for
    // a meeting that hasn't happened.
    if (!existing.end || existing.end > Date.now()) {
      return NextResponse.json(
        { error: "Notes can only be added once the meeting is over." },
        { status: 400 }
      );
    }

    const notes = String(body.notes ?? "").trim().slice(0, 2000);

    await rtdbSet(`calendar_events/${staffId}/${id}/notes`, notes || null, idToken);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_SIGNED_IN") {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }

    console.error("[visitor-app] calendar/notes", error);
    return NextResponse.json({ error: "Could not save those notes." }, { status: 500 });
  }
}
