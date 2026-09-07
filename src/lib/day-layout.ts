import type { CalendarEvent } from "./data";

/** The window the timeline renders. Anything outside is clamped into view. */
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 21;
export const HOUR_HEIGHT = 64;

export interface PositionedEvent {
  event: CalendarEvent;
  /** Pixels from the top of the timeline. */
  top: number;
  height: number;
  /** Which of `columns` side-by-side lanes this sits in. */
  column: number;
  columns: number;
}

function minutesFromDayStart(ms: number, dayStart: number) {
  return (ms - dayStart) / 60_000;
}

/**
 * Positions a day's events, splitting anything that overlaps into side-by-side
 * lanes.
 *
 * Real calendars double-book constantly — a "team sync" landing inside a
 * client call is normal. Stacking those on top of each other would hide one
 * entirely, which is exactly the meeting someone would then miss.
 */
export function layOutDay(
  events: CalendarEvent[],
  dayStartMs: number
): PositionedEvent[] {
  const timelineStart = dayStartMs + DAY_START_HOUR * 3_600_000;
  const timelineEnd = dayStartMs + DAY_END_HOUR * 3_600_000;

  const visible = events
    .filter((event) => !event.allDay)
    .filter((event) => event.end > timelineStart && event.start < timelineEnd)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  // Group into clusters that transitively overlap, then lane them within each
  // cluster so two unrelated meetings never lose width to each other.
  const clusters: CalendarEvent[][] = [];
  let current: CalendarEvent[] = [];
  let clusterEnd = -Infinity;

  for (const event of visible) {
    if (current.length && event.start >= clusterEnd) {
      clusters.push(current);
      current = [];
      clusterEnd = -Infinity;
    }

    current.push(event);
    clusterEnd = Math.max(clusterEnd, event.end);
  }

  if (current.length) clusters.push(current);

  const positioned: PositionedEvent[] = [];

  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    const laneOf = new Map<string, number>();

    for (const event of cluster) {
      let lane = laneEnds.findIndex((end) => end <= event.start);

      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(event.end);
      } else {
        laneEnds[lane] = event.end;
      }

      laneOf.set(event.id, lane);
    }

    for (const event of cluster) {
      const start = Math.max(event.start, timelineStart);
      const end = Math.min(event.end, timelineEnd);

      const top =
        ((minutesFromDayStart(start, dayStartMs) - DAY_START_HOUR * 60) / 60) *
        HOUR_HEIGHT;

      const height = Math.max(
        22,
        ((end - start) / 3_600_000) * HOUR_HEIGHT - 2
      );

      positioned.push({
        event,
        top,
        height,
        column: laneOf.get(event.id) ?? 0,
        columns: laneEnds.length,
      });
    }
  }

  return positioned;
}
