import { NextResponse } from "next/server";
import {
  createOwnEvent,
  fetchEvents,
  HAS_CALENDAR_CONFIG,
} from "@/src/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

/**
 * Every route here acts on **the caller's own calendar**.
 *
 * The address is taken from the verified sign-in token, never from the URL or
 * the body — otherwise anyone signed in could read a colleague's meeting
 * titles by passing a different email. That is also why being an admin grants
 * nothing extra here: an admin can see who visited whom, not what anyone's
 * private meetings are called.
 */
async function callerEmail(request: Request): Promise<string> {
  if (!FIREBASE_API_KEY) throw new Error("Firebase API key is not configured.");

  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!idToken) throw new Error("NOT_SIGNED_IN");

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) throw new Error("NOT_SIGNED_IN");

  const data = (await response.json()) as {
    users?: { email?: string }[];
  };

  const email = data.users?.[0]?.email?.trim().toLowerCase();

  if (!email) throw new Error("NOT_SIGNED_IN");

  return email;
}

function unauthorized() {
  return NextResponse.json(
    { error: "Please sign in again." },
    { status: 401 }
  );
}

export async function GET(request: Request) {
  try {
    const email = await callerEmail(request);

    if (!HAS_CALENDAR_CONFIG) {
      return NextResponse.json({ events: [], configured: false });
    }

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

    return NextResponse.json({
      events: await fetchEvents(email, from, to),
      configured: true,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_SIGNED_IN") {
      return unauthorized();
    }

    console.error("[visitor-app] calendar GET", error);
    return NextResponse.json(
      { error: "Could not load your calendar." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const email = await callerEmail(request);

    if (!HAS_CALENDAR_CONFIG) {
      return NextResponse.json(
        { error: "Google Calendar isn't connected yet." },
        { status: 501 }
      );
    }

    const body = (await request.json()) as {
      title?: string;
      start?: number;
      end?: number;
      location?: string;
    };

    const title = String(body.title ?? "").trim().slice(0, 200);
    const start = Number(body.start);
    const end = Number(body.end);

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

    const id = await createOwnEvent({
      staffEmail: email,
      title,
      start,
      end,
      location: String(body.location ?? "").trim().slice(0, 200) || undefined,
    });

    return NextResponse.json({ id });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_SIGNED_IN") {
      return unauthorized();
    }

    console.error("[visitor-app] calendar POST", error);
    return NextResponse.json(
      { error: "Could not add that to your calendar." },
      { status: 500 }
    );
  }
}
