/**
 * Turning a person's busy blocks into the slots a visitor can tap.
 *
 * Deliberately pure and Google-free: the calendar provider hands in busy
 * intervals, and everything below is arithmetic. That keeps the slot rules
 * testable and lets the demo, the working-hours fallback and the real calendar
 * all share one implementation.
 */

/** A block of time the person is already occupied. */
export interface BusyInterval {
  start: number;
  end: number;
}

export interface Slot {
  start: number;
  end: number;
  available: boolean;
}

export interface WorkingHours {
  /** "10:00" — 24h, in the office's local time. */
  start: string;
  end: string;
  /** Days the office is open. 0 = Sunday … 6 = Saturday. */
  days: number[];
}

/** The office has no fixed hours — anyone can be checked in any day, any time. */
export const DEFAULT_WORKING_HOURS: WorkingHours = {
  start: "00:00",
  end: "23:59",
  days: [0, 1, 2, 3, 4, 5, 6],
};

export const DEFAULT_SLOT_MINUTES = 30;

/** A visitor at the door won't wait past this, so don't offer it. */
export const MAX_LOOKAHEAD_HOURS = 8;

/** Never offer a slot starting sooner than this — nobody can teleport. */
export const MIN_LEAD_MINUTES = 10;

function parseHhMm(value: string, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return fallback;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return fallback;

  return hours * 60 + minutes;
}

/** Minutes since midnight, in the viewer's local timezone. */
function minutesIntoDay(ms: number): number {
  const date = new Date(ms);
  return date.getHours() * 60 + date.getMinutes();
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function overlaps(slot: Slot, busy: BusyInterval): boolean {
  // Touching edges is not an overlap: a meeting ending at 11:30 leaves the
  // 11:30 slot free.
  return slot.start < busy.end && busy.start < slot.end;
}

/**
 * Builds the slot grid for the rest of the working day.
 *
 * @param now          Reference time — the moment the visitor is standing there.
 * @param busy         Blocks the person is already occupied (may be empty).
 * @param workingHours Office hours to stay inside.
 * @param slotMinutes  Granularity of the offered times.
 */
export function buildSlots({
  now,
  busy,
  workingHours = DEFAULT_WORKING_HOURS,
  slotMinutes = DEFAULT_SLOT_MINUTES,
}: {
  now: number;
  busy: BusyInterval[];
  workingHours?: WorkingHours;
  slotMinutes?: number;
}): Slot[] {
  const days = workingHours.days?.length
    ? workingHours.days
    : DEFAULT_WORKING_HOURS.days;

  if (!days.includes(new Date(now).getDay())) return [];

  const size = Math.max(5, Math.min(slotMinutes, 120));
  const openMinutes = parseHhMm(workingHours.start, 10 * 60);
  const closeMinutes = parseHhMm(workingHours.end, 18 * 60);

  if (closeMinutes <= openMinutes) return [];

  const dayStart = startOfDay(now);
  const closeMs = dayStart + closeMinutes * 60_000;

  // Round the first slot up to the next clean boundary after the lead time, so
  // visitors get "11:45", never "11:43".
  const earliest = now + MIN_LEAD_MINUTES * 60_000;
  const earliestMinutes = Math.max(openMinutes, minutesIntoDay(earliest));
  const firstMinutes = Math.ceil(earliestMinutes / size) * size;

  const horizon = Math.min(closeMs, now + MAX_LOOKAHEAD_HOURS * 3_600_000);

  const slots: Slot[] = [];

  for (
    let startMinutes = firstMinutes;
    startMinutes + size <= closeMinutes;
    startMinutes += size
  ) {
    const start = dayStart + startMinutes * 60_000;
    const end = start + size * 60_000;

    if (start >= horizon) break;

    const slot: Slot = { start, end, available: true };
    slot.available = !busy.some((interval) => overlaps(slot, interval));

    slots.push(slot);
  }

  return slots;
}

/** True when today is one of the configured working days. */
export function isWorkingDay(
  now: number,
  workingHours: WorkingHours = DEFAULT_WORKING_HOURS
): boolean {
  const days = workingHours.days?.length
    ? workingHours.days
    : DEFAULT_WORKING_HOURS.days;

  return days.includes(new Date(now).getDay());
}

/** True when nothing occupies the person right now. */
export function isFreeNow(now: number, busy: BusyInterval[]): boolean {
  return !busy.some((interval) => interval.start <= now && now < interval.end);
}

/** The first free slot, used for the "busy until…" line on the kiosk. */
export function nextAvailable(slots: Slot[]): Slot | null {
  return slots.find((slot) => slot.available) ?? null;
}

/**
 * The slot grid for one whole chosen day — a staff member's booking link
 * (someone browsing ahead of time, not standing at the door) has no reason
 * to be bounded by `MAX_LOOKAHEAD_HOURS`, which only exists to keep a walk-in
 * from being offered a slot hours from now. If the chosen day is today, slots
 * already in the past (or too soon to be reachable) are simply left out.
 */
export function buildDaySlots({
  dayStart,
  now,
  busy,
  slotMinutes = DEFAULT_SLOT_MINUTES,
}: {
  /** Midnight, local time, of the day being viewed. */
  dayStart: number;
  now: number;
  busy: BusyInterval[];
  slotMinutes?: number;
}): Slot[] {
  const size = Math.max(5, Math.min(slotMinutes, 120));
  const isToday = startOfDay(now) === dayStart;

  const earliestMinutes = isToday
    ? minutesIntoDay(now + MIN_LEAD_MINUTES * 60_000)
    : 0;
  const firstMinutes = Math.max(0, Math.ceil(earliestMinutes / size) * size);

  const slots: Slot[] = [];

  for (
    let startMinutes = firstMinutes;
    startMinutes + size <= 24 * 60;
    startMinutes += size
  ) {
    const start = dayStart + startMinutes * 60_000;
    const end = start + size * 60_000;

    const slot: Slot = { start, end, available: true };
    slot.available = !busy.some((interval) => overlaps(slot, interval));

    slots.push(slot);
  }

  return slots;
}
