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
import { rtdbGet } from "@/src/lib/rtdb-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read by the anonymous door tablet, so it only ever touches `busy_blocks` —
 * the public mirror that carries start/end and nothing else. The full event
 * detail in `calendar_events` (titles, locations) is never reachable from
 * here, by construction: this route has no path to that node at all.
 */

/** Keep the id to a safe flat segment — blocks "../" in the REST URL. */
function seg(value: string) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

interface StaffRecord {
  name?: string;
  email?: string;
  active?: boolean;
  workingHours?: WorkingHours;
  slotMinutes?: number;
}

export async function GET(request: Request) {
  try {
    const staffId = seg(new URL(request.url).searchParams.get("staffId") ?? "");

    if (!staffId) {
      return NextResponse.json({ error: "Missing staffId." }, { status: 400 });
    }

    const staff = await rtdbGet<StaffRecord>(`staff/${staffId}`);

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

    const stored = await rtdbGet<Record<string, BusyInterval>>(
      `busy_blocks/${staffId}`
    );

    const busy: BusyInterval[] = Object.values(stored ?? {}).filter(
      (block) => block.end > now && block.start < horizon
    );

    const slots = buildSlots({ now, busy, workingHours, slotMinutes });

    return NextResponse.json({
      staffName: staff.name ?? "",
      freeNow: isFreeNow(now, busy),
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
