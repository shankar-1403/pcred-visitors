import { NextResponse } from "next/server";
import {
  bearerToken,
  resolveStaffId,
  rtdbGet,
  rtdbPush,
  rtdbSet,
  verifyIdToken,
} from "@/src/lib/rtdb-server";

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
}

async function callerContext(request: Request) {
  const idToken = bearerToken(request);
  const { email } = await verifyIdToken(idToken);
  const staffId = await resolveStaffId(email);

  if (!staffId) {
    throw new Error("NOT_ON_DIRECTORY");
  }

  return { idToken, staffId };
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === "NOT_SIGNED_IN") {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  if (error instanceof Error && error.message === "NOT_ON_DIRECTORY") {
    return NextResponse.json(
      { error: "You're not on the staff directory yet — ask an admin to add you." },
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

    // A month is plenty for a day or week view, and stops one request pulling
    // a year of someone's history.
    if (to - from > 31 * 24 * 60 * 60 * 1000) {
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
    const { idToken, staffId } = await callerContext(request);

    const body = (await request.json()) as {
      title?: string;
      start?: number;
      end?: number;
      location?: string;
    };

    const title = String(body.title ?? "").trim().slice(0, 200);
    const start = Number(body.start);
    const end = Number(body.end);
    const location = String(body.location ?? "").trim().slice(0, 200);

    if (!title) {
      return NextResponse.json({ error: "Give it a title." }, { status: 400 });
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return NextResponse.json(
        { error: "The end time must be after the start." },
        { status: 400 }
      );
    }

    if (end - start > 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: "An event can't run longer than a day." },
        { status: 400 }
      );
    }

    const record: CalendarEventRecord = {
      title,
      start,
      end,
      allDay: false,
      isVisit: false,
      ...(location ? { location } : {}),
    };

    const id = await rtdbPush(`calendar_events/${staffId}`, record, idToken);

    // The public mirror carries only the timing — never the title — so the
    // kiosk's free/busy check can never leak what the meeting is about.
    await rtdbSet(`busy_blocks/${staffId}/${id}`, { start, end }, idToken);

    return NextResponse.json({ id });
  } catch (error) {
    return errorResponse(error, "Could not add that to your calendar.");
  }
}
