import { NextResponse } from "next/server";
import {
  buildSlots,
  isFreeNow,
  DEFAULT_SLOT_MINUTES,
  DEFAULT_WORKING_HOURS,
  isWorkingDay,
  MAX_LOOKAHEAD_HOURS,
  type BusyInterval,
  type WorkingHours,
} from "@/src/lib/availability";
import { fetchBusy, HAS_CALENDAR_CONFIG } from "@/src/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RTDB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

/** Keep the id to a safe flat segment — blocks "../" in the REST URL. */
function seg(value: string) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

interface StaffRecord {
  name?: string;
  email?: string;
  active?: boolean;
  useCalendar?: boolean;
  workingHours?: WorkingHours;
  slotMinutes?: number;
}

export async function GET(request: Request) {
  try {
    const staffId = seg(new URL(request.url).searchParams.get("staffId") ?? "");

    if (!staffId) {
      return NextResponse.json({ error: "Missing staffId." }, { status: 400 });
    }

    if (!RTDB_URL) throw new Error("Firebase database URL not configured.");

    const staffResponse = await fetch(`${RTDB_URL}/staff/${staffId}.json`, {
      cache: "no-store",
    });

    if (!staffResponse.ok) {
      throw new Error(`Staff lookup failed: ${staffResponse.status}`);
    }

    const staff = (await staffResponse.json()) as StaffRecord | null;

    if (!staff || staff.active === false) {
      return NextResponse.json(
        { error: "That person is not available right now." },
        { status: 400 }
      );
    }

    const now = Date.now();
    const horizon = now + MAX_LOOKAHEAD_HOURS * 3_600_000;

    const workingHours = staff.workingHours ?? DEFAULT_WORKING_HOURS;
    const slotMinutes = staff.slotMinutes ?? DEFAULT_SLOT_MINUTES;

    let busy: BusyInterval[] = [];
    // "calendar" = real free/busy. "hours" = working hours only, either because
    // the person has no calendar or because the lookup failed.
    let source: "calendar" | "hours" = "hours";

    const wantsCalendar = staff.useCalendar !== false && Boolean(staff.email);

    if (wantsCalendar && HAS_CALENDAR_CONFIG) {
      try {
        busy = await fetchBusy(staff.email!, now, horizon);
        source = "calendar";
      } catch (error) {
        // A calendar outage must not stop someone checking in. Fall back to
        // plain working hours and say so, rather than showing a broken screen.
        console.error(
          `[visitor-app] free/busy failed for ${staff.email}, falling back to working hours:`,
          error
        );
      }
    }

    const slots = buildSlots({ now, busy, workingHours, slotMinutes });

    return NextResponse.json({
      staffName: staff.name ?? "",
      source,
      freeNow: source === "calendar" ? isFreeNow(now, busy) : true,
      openToday: isWorkingDay(now, workingHours),
      slots,
      now,
    });
  } catch (error) {
    console.error("[visitor-app] availability", error);
    return NextResponse.json(
      { error: "Could not check availability." },
      { status: 500 }
    );
  }
}
