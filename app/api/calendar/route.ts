import { NextResponse } from "next/server";
import {
  bearerToken,
  resolveStaffId,
  rtdbGet,
  rtdbPush,
  rtdbSet,
  verifyIdToken,
} from "@/src/lib/rtdb-server";
import { sendMeetingEmail } from "@/src/lib/meeting-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every route here acts on **the caller's own calendar**.
 *
 * The staff record is resolved from the verified sign-in token, never from
 * the URL or body — otherwise anyone signed in could read a colleague's
 * meeting titles by passing a different email. Being an admin grants nothing
 * extra here: an admin can see who visited whom, not what a colleague's
 * private meetings are called.
 *
 * This is the app's own calendar, not a connected outside one — events live
 * entirely in this project's database. `calendar_events/{staffId}` holds full
 * detail and is readable only by that staff member (or an admin, via the
 * database rules); `busy_blocks/{staffId}` mirrors just the start/end of each
 * event and is public-read, which is what the kiosk's availability check
 * reads — so a stranger at the door can see *that* someone is busy, never
 * *why*.
 */

interface CalendarEventRecord {
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
  isVisit: boolean;
  /** Who wrote this event, and why — the reminder job only emails staff
      about meetings they arranged themselves, never an instant walk-in
      approval, which has no lead time to be reminded about. */
  source: "manual" | "approved" | "postponed";
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientCompany?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 12;
}

interface ParsedEventBody {
  title: string;
  start: number;
  end: number;
  location: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientCompany: string;
}

/** Shared by create and edit: same fields, same rules either way. */
function parseEventBody(body: unknown): ParsedEventBody | { error: string } {
  const b = (body ?? {}) as {
    title?: string;
    start?: number;
    end?: number;
    location?: string;
    clientName?: string;
    clientPhone?: string;
    clientEmail?: string;
    clientCompany?: string;
  };

  const title = String(b.title ?? "").trim().slice(0, 200);
  const start = Number(b.start);
  const end = Number(b.end);
  const location = String(b.location ?? "").trim().slice(0, 200);
  const clientName = String(b.clientName ?? "").trim().slice(0, 120);
  const clientPhone = String(b.clientPhone ?? "").trim().slice(0, 40);
  const clientEmail = String(b.clientEmail ?? "").trim().slice(0, 200);
  const clientCompany = String(b.clientCompany ?? "").trim().slice(0, 160);

  if (!title) return { error: "Give it a title." };
  if (!clientName) return { error: "Give the client's name." };

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { error: "The end time must be after the start." };
  }

  if (end - start > 24 * 60 * 60 * 1000) {
    return { error: "An event can't run longer than a day." };
  }

  if (clientPhone && !isValidPhone(clientPhone)) {
    return { error: "Enter a 10-digit phone number, or 12 digits with the country code." };
  }

  if (clientEmail && !EMAIL_RE.test(clientEmail)) {
    return { error: "Enter a valid email, such as name@company.com." };
  }

  return { title, start, end, location, clientName, clientPhone, clientEmail, clientCompany };
}

async function callerContext(request: Request) {
  const idToken = bearerToken(request);
  const { email } = await verifyIdToken(idToken);
  const staffId = await resolveStaffId(email);

  if (!staffId) {
    throw new Error("NOT_ON_DIRECTORY");
  }

  return { idToken, staffId, email };
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === "NOT_SIGNED_IN") {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  if (error instanceof Error && error.message === "NOT_ON_DIRECTORY") {
    return NextResponse.json(
      { error: "You're not on the staff directory yet. Ask an admin to add you." },
      { status: 403 }
    );
  }

  console.error("[visitor-app] calendar", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const { idToken, staffId } = await callerContext(request);

    const params = new URL(request.url).searchParams;
    const from = Number(params.get("from"));
    const to = Number(params.get("to"));

    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return NextResponse.json({ error: "Invalid range." }, { status: 400 });
    }

    // The month grid always spans 42 days (six full weeks, to fill the
    // calendar) rather than the ~30 days in the month itself — this stops one
    // request pulling a year of history without cutting the grid off.
    if (to - from > 45 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Range too wide." }, { status: 400 });
    }

    const stored = await rtdbGet<Record<string, CalendarEventRecord>>(
      `calendar_events/${staffId}`,
      idToken
    );

    const events = Object.entries(stored ?? {})
      .map(([id, event]) => ({ id, ...event }))
      .filter((event) => event.end > from && event.start < to);

    return NextResponse.json({ events });
  } catch (error) {
    return errorResponse(error, "Could not load your calendar.");
  }
}

export async function POST(request: Request) {
  try {
    const { idToken, staffId, email } = await callerContext(request);

    const parsed = parseEventBody(await request.json());
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { title, start, end, location, clientName, clientPhone, clientEmail, clientCompany } =
      parsed;

    const record: CalendarEventRecord = {
      title,
      start,
      end,
      allDay: false,
      isVisit: false,
      source: "manual",
      ...(location ? { location } : {}),
      ...(clientName ? { clientName } : {}),
      ...(clientPhone ? { clientPhone } : {}),
      ...(clientEmail ? { clientEmail } : {}),
      ...(clientCompany ? { clientCompany } : {}),
    };

    const id = await rtdbPush(`calendar_events/${staffId}`, record, idToken);

    // The public mirror carries only the timing — never the title — so the
    // kiosk's free/busy check can never leak what the meeting is about.
    await rtdbSet(`busy_blocks/${staffId}/${id}`, { start, end }, idToken);

    // Best-effort, same as the 15-minute reminder: a failed email must never
    // undo the event that's already been saved.
    try {
      const staffName = await rtdbGet<string>(`staff/${staffId}/name`, idToken);

      await sendMeetingEmail({
        kind: "created",
        staffName: staffName ?? "",
        staffEmail: email,
        clientName,
        clientEmail,
        clientCompany,
        title,
        start,
        location,
      });
    } catch (error) {
      console.error("[visitor-app] event saved, but could not send the email:", error);
    }

    return NextResponse.json({ id });
  } catch (error) {
    return errorResponse(error, "Could not add that to your calendar.");
  }
}

export async function PATCH(request: Request) {
  try {
    const { idToken, staffId, email } = await callerContext(request);

    const body = (await request.json()) as { id?: string };
    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json({ error: "Missing event id." }, { status: 400 });
    }

    // Only an event staff wrote themselves can be edited here — a visitor
    // booking's fields are owned by the visitor-request flow, not this form.
    // Keyed on `isVisit`, not `source`: that field existed from the start,
    // so it's also true for events added before `source` was introduced —
    // checking `source === "manual"` would wrongly lock out anything older.
    const existing = await rtdbGet<CalendarEventRecord>(
      `calendar_events/${staffId}/${id}`,
      idToken
    );

    if (!existing || existing.isVisit) {
      return NextResponse.json({ error: "That event can't be edited here." }, { status: 404 });
    }

    const parsed = parseEventBody(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { title, start, end, location, clientName, clientPhone, clientEmail, clientCompany } =
      parsed;

    const record: CalendarEventRecord = {
      title,
      start,
      end,
      allDay: false,
      isVisit: false,
      source: "manual",
      // A changed time re-earns the 15-minute reminder — the old one was for
      // whatever slot this used to be at.
      ...(location ? { location } : {}),
      ...(clientName ? { clientName } : {}),
      ...(clientPhone ? { clientPhone } : {}),
      ...(clientEmail ? { clientEmail } : {}),
      ...(clientCompany ? { clientCompany } : {}),
    };

    await rtdbSet(`calendar_events/${staffId}/${id}`, record, idToken);
    await rtdbSet(`busy_blocks/${staffId}/${id}`, { start, end }, idToken);

    // Same notification as a fresh create — from the recipient's side,
    // an edited meeting is no different from a newly scheduled one.
    try {
      const staffName = await rtdbGet<string>(`staff/${staffId}/name`, idToken);

      await sendMeetingEmail({
        kind: "created",
        staffName: staffName ?? "",
        staffEmail: email,
        clientName,
        clientEmail,
        clientCompany,
        title,
        start,
        location,
      });
    } catch (error) {
      console.error("[visitor-app] event updated, but could not send the email:", error);
    }

    return NextResponse.json({ id });
  } catch (error) {
    return errorResponse(error, "Could not update that event.");
  }
}
