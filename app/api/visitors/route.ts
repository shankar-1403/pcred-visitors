import { NextResponse } from "next/server";
import { adminDb, adminMessaging, HAS_ADMIN_CONFIG } from "@/src/lib/firebase-admin";

export const runtime = "nodejs";

const RTDB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}][\p{L}\s.'-]*$/u;

/** A phone number is either a 10-digit local number or a 12-digit one with
    the country code included (with or without a leading "+"). */
function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 12;
}

/** Purposes the kiosk offers. Anything else is coerced to "Other". */
const ALLOWED_PURPOSES = [
  "Meeting",
  "Scheduled Appointment",
  "Interview",
  "Vendor / Supplier",
  "Delivery",
  "Loan / Scheme Enquiry",
  "Other",
] as const;

/** Trim and cap a field so one submission can't write an unbounded payload. */
const field = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

// The kiosk URL is public, so a single tablet (or anyone who learns the URL)
// could otherwise flood the database. Per-instance memory is enough here: it
// throttles a burst from one source without adding infrastructure.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const submissionsByIp = new Map<string, number[]>();

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (submissionsByIp.get(ip) ?? []).filter(
    (at) => now - at < RATE_LIMIT_WINDOW_MS
  );

  if (recent.length >= RATE_LIMIT_MAX) {
    submissionsByIp.set(ip, recent);
    return true;
  }

  recent.push(now);
  submissionsByIp.set(ip, recent);

  // Drop stale buckets so a long-running instance doesn't grow unbounded.
  if (submissionsByIp.size > 500) {
    for (const [key, times] of submissionsByIp) {
      if (times.every((at) => now - at >= RATE_LIMIT_WINDOW_MS)) {
        submissionsByIp.delete(key);
      }
    }
  }

  return false;
}

/** Keep the id to a safe flat segment — blocks "../" path traversal in the REST URL. */
function seg(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

interface StaffRecord {
  name?: string;
  department?: string;
  email?: string;
  active?: boolean;
  fcmTokens?: Record<string, boolean>;
}

/** Push is a bonus on top of the in-app/email alerts — a failure here must
    never fail the check-in itself. */
async function sendPushAlert(
  staffId: string,
  tokens: Record<string, boolean>,
  visitorName: string,
  purpose: string
) {
  if (!HAS_ADMIN_CONFIG) return;

  const tokenList = Object.keys(tokens);
  if (tokenList.length === 0) return;

  try {
    const messaging = adminMessaging();
    const response = await messaging.sendEachForMulticast({
      tokens: tokenList,
      notification: {
        title: `${visitorName} is at the door`,
        body: `Here to meet you · ${purpose}`,
      },
      data: { staffId },
    });

    const stale: string[] = [];
    response.responses.forEach((result, index) => {
      if (
        !result.success &&
        result.error?.code === "messaging/registration-token-not-registered"
      ) {
        stale.push(tokenList[index]!);
      }
    });

    if (stale.length > 0) {
      const db = adminDb();
      await Promise.all(
        stale.map((token) =>
          db.ref(`staff/${staffId}/fcmTokens/${token}`).remove()
        )
      );
    }
  } catch (error) {
    console.error("[visitor-app] Push send failed:", error);
  }
}

async function readStaff(staffId: string): Promise<StaffRecord | null> {
  const res = await fetch(`${RTDB_URL}/staff/${staffId}.json`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Staff lookup failed: ${res.status}`);
  }

  return (await res.json()) as StaffRecord | null;
}

async function createRequest(data: Record<string, unknown>) {
  const res = await fetch(`${RTDB_URL}/visitor_requests.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Database write failed: ${res.status} ${text}`);
  }

  // RTDB returns the generated push key as { name: "-Nxyz..." }.
  const { name } = (await res.json()) as { name?: string };

  if (!name) {
    throw new Error("Database write succeeded but returned no id.");
  }

  return name;
}

export async function POST(request: Request) {
  try {
    if (!RTDB_URL) {
      throw new Error("Firebase database URL not configured.");
    }

    if (isRateLimited(clientIp(request))) {
      return NextResponse.json(
        { error: "Too many check-ins from this device. Please see reception." },
        { status: 429 }
      );
    }

    const body = await request.json();

    const staffId = seg(field(body.staffId, 80));
    const visitorName = field(body.visitorName, 120);
    const visitorPhone = field(body.visitorPhone, 40);
    const visitorEmail = field(body.visitorEmail, 200);
    const company = field(body.company, 160);
    const visitorDesignation = field(body.designation, 120);
    const visitorAddress = field(body.address, 300);

    if (
      !staffId ||
      !visitorName ||
      !visitorPhone ||
      !visitorEmail ||
      !company ||
      !visitorDesignation
    ) {
      return NextResponse.json(
        {
          error:
            "Please provide your name, phone, email, company, designation, and who you are here to meet.",
        },
        { status: 400 }
      );
    }

    if (!NAME_RE.test(visitorName)) {
      return NextResponse.json(
        { error: "Name can only contain letters." },
        { status: 400 }
      );
    }

    if (!isValidPhone(visitorPhone)) {
      return NextResponse.json(
        {
          error: "Enter a 10-digit phone number, or 12 digits with the country code.",
        },
        { status: 400 }
      );
    }

    if (!EMAIL_RE.test(visitorEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // Resolved server-side rather than trusted from the body: the kiosk must not
    // be able to invent a target, address a deactivated employee, or spoof the
    // staffEmail that decides who gets the approval.
    const staff = await readStaff(staffId);

    if (!staff || staff.active === false) {
      return NextResponse.json(
        { error: "That person is not available right now. Please see reception." },
        { status: 400 }
      );
    }

    const rawPurpose = field(body.purpose, 60);
    const purpose = (ALLOWED_PURPOSES as readonly string[]).includes(rawPurpose)
      ? rawPurpose
      : "Other";

    // A chosen slot must be a real future time inside the booking window —
    // anything else is dropped rather than trusted. The window covers the
    // 7-day picker on a staff member's own link, with a day of slack.
    const requestedRaw = Number(body.requestedFor);
    const now = Date.now();
    const requestedFor =
      Number.isFinite(requestedRaw) &&
      requestedRaw > now &&
      requestedRaw < now + 8 * 24 * 60 * 60 * 1000
        ? Math.floor(requestedRaw)
        : null;

    const partySizeRaw = Number(body.partySize);
    const partySize =
      Number.isFinite(partySizeRaw) && partySizeRaw >= 1
        ? Math.min(Math.floor(partySizeRaw), 20)
        : 1;

    const data = {
      visitorName,
      visitorPhone,
      visitorEmail,
      company,
      visitorDesignation,
      visitorAddress,
      partySize,
      purpose,
      purposeNote: field(body.purposeNote, 500),
      requestedFor,
      staffId,
      staffName: field(staff.name, 120),
      staffDepartment: field(staff.department, 120),
      // Lowercased so "For me" matching never turns on how someone typed it.
      staffEmail: String(staff.email ?? "").trim().toLowerCase(),
      // Stamped here, never taken from the body — a kiosk cannot pre-approve
      // itself or backdate a visit.
      status: "pending" as const,
      responseNote: "",
      postponedTo: null,
      createdAt: now,
      respondedAt: null,
      respondedBy: null,
      respondedByName: null,
      calendarEventId: null,
      source: "kiosk",
    };

    const id = await createRequest(data);

    if (staff.fcmTokens) {
      void sendPushAlert(staffId, staff.fcmTokens, visitorName, purpose);
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("[visitor-app]", error);
    return NextResponse.json(
      { error: "Check-in failed. Please try again or see reception." },
      { status: 500 }
    );
  }
}
