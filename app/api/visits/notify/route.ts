import { NextResponse } from "next/server";
import { adminMessaging, HAS_ADMIN_CONFIG } from "@/src/lib/firebase-admin";
import { bearerToken, rtdbGet, verifyIdToken } from "@/src/lib/rtdb-server";

export const runtime = "nodejs";

function seg(value: string) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

interface VisitorRequestRecord {
  staffName?: string;
  status?: string;
  postponedTo?: number | null;
  visitorPushToken?: string;
}

/** The office runs on IST; a server in UTC would otherwise name an hour the
    visitor never agreed to. */
function formatWhen(ms: number) {
  return new Date(ms).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function messageFor(visit: VisitorRequestRecord) {
  const host = visit.staffName?.trim() || "Your host";

  if (visit.status === "approved") {
    return {
      title: "You're approved to come in",
      body: `${host} is ready to see you. Please head in.`,
    };
  }

  if (visit.status === "postponed") {
    return {
      title: "Your visit has been postponed",
      body: visit.postponedTo
        ? `${host} suggested ${formatWhen(visit.postponedTo)}.`
        : `${host} asked to reschedule. Please see the front desk.`,
    };
  }

  return {
    title: "Your visit wasn't approved",
    body: `${host} can't meet right now. Please see the front desk.`,
  };
}

/**
 * Pushes the outcome of a visit to the device the visitor checked in on.
 *
 * The screen they checked in at only helps someone still watching it, and
 * waiting is exactly when attention wanders — so the answer follows them to
 * their phone or laptop instead, with the sound their device already makes
 * for a notification.
 *
 * Separate from the response itself, which is a database write the host's
 * browser already made. A push that fails costs the notification and nothing
 * else: the outcome stays recorded and on screen.
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

    // Read server-side rather than trusting the body: the outcome announced
    // has to be the one actually stored.
    const visit = await rtdbGet<VisitorRequestRecord>(
      `visitor_requests/${requestId}`,
      idToken
    );

    if (
      !HAS_ADMIN_CONFIG ||
      !visit?.visitorPushToken ||
      !visit.status ||
      visit.status === "pending"
    ) {
      return NextResponse.json({ success: true, sent: false });
    }

    const { title, body } = messageFor(visit);

    await adminMessaging().send({
      token: visit.visitorPushToken,
      // A notification payload is what makes the service worker display this
      // — and ring — while the page is closed or in the background.
      notification: { title, body },
      webpush: {
        headers: { Urgency: "high" },
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: `visit-${requestId}`,
          // Someone who has looked away is the whole reason this exists.
          requireInteraction: true,
          silent: false,
        },
      },
      data: { requestId, status: visit.status },
    });

    return NextResponse.json({ success: true, sent: true });
  } catch (error) {
    console.error("[visits/notify]", error);
    return NextResponse.json(
      { error: "Could not notify the visitor." },
      { status: 500 }
    );
  }
}
