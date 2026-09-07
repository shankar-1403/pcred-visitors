"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconMapPin,
  IconPlus,
  IconUserCheck,
  IconX,
} from "@tabler/icons-react";
import {
  createMyEvent,
  fetchMyEvents,
  type CalendarEvent,
} from "@/src/lib/data";
import { useAuth } from "@/src/context/AuthContext";
import RoleGate from "@/components/RoleGate";

function toKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromKey(key: string | null): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? "");
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date();

  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * The 6x7 grid a traditional month calendar shows — the selected month plus
 * enough of the adjacent months to fill whole weeks, starting on Sunday.
 */
function buildMonthGrid(monthCursor: Date): Date[] {
  const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return date;
  });
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const monthFmt = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dayFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // The date lives in the URL so a particular day can be linked and the back
  // button steps through days the way people expect.
  const day = useMemo(() => fromKey(searchParams.get("date")), [searchParams]);
  const dayStart = day.getTime();

  // Which month the grid is showing. Independent of the selected day so
  // paging through months doesn't lose your place, but re-synced whenever the
  // selected day lands outside it (a URL visit, or the Today button) — done
  // by adjusting state during render, React's own pattern for this, rather
  // than an effect that would commit the stale month for one extra frame.
  const dayMonthKey = `${day.getFullYear()}-${day.getMonth()}`;
  const [monthCursor, setMonthCursor] = useState(
    () => new Date(day.getFullYear(), day.getMonth(), 1)
  );
  const [syncedDayMonthKey, setSyncedDayMonthKey] = useState(dayMonthKey);

  if (dayMonthKey !== syncedDayMonthKey) {
    setSyncedDayMonthKey(dayMonthKey);
    setMonthCursor(new Date(day.getFullYear(), day.getMonth(), 1));
  }

  const monthGrid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const monthRangeStart = monthGrid[0].getTime();
  const monthRangeEnd = monthGrid[monthGrid.length - 1].getTime() + 24 * 3_600_000;

  // One piece of state, written only from the resolved fetch. "Loading" is
  // then derived from whether the result belongs to the month on screen,
  // which also stops a slow response for last month overwriting this one.
  const [result, setResult] = useState<{
    key: number;
    events: CalendarEvent[];
    error: string;
  } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const fresh = result?.key === monthRangeStart ? result : null;
  // Memoised so the empty fallback is not a fresh array on every render, which
  // would re-run the month grouping and day layout continuously.
  const monthEvents = useMemo(() => fresh?.events ?? [], [fresh]);
  const error = fresh?.error ?? "";
  const loading = Boolean(user) && fresh === null;

  const [addOpen, setAddOpen] = useState(false);
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [form, setForm] = useState({ title: "", start: "10:00", end: "11:00" });

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    fetchMyEvents(monthRangeStart, monthRangeEnd)
      .then((data) => {
        if (cancelled) return;
        setResult({
          key: monthRangeStart,
          events: data.events,
          error: "",
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResult({
          key: monthRangeStart,
          events: [],
          error:
            err instanceof Error
              ? err.message
              : "Could not load your calendar.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [monthRangeStart, monthRangeEnd, user, reloadNonce]);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  // Keeps the "now" line honest without re-fetching.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const goto = (date: Date) => router.push(`/staff/calendar?date=${toKey(date)}`);

  const shiftMonth = (delta: number) => {
    setMonthCursor(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
    );
  };

  const goToday = () => {
    const today = new Date();
    setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    goto(today);
  };

  // Which days in the visible grid have something on them, for the dot under
  // each date — the whole reason the month is fetched in one request instead
  // of one per day.
  const eventDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const event of monthEvents) keys.add(toKey(new Date(event.start)));
    return keys;
  }, [monthEvents]);

  const events = useMemo(
    () => monthEvents.filter((event) => toKey(new Date(event.start)) === toKey(day)),
    [monthEvents, day]
  );

  const isToday = toKey(new Date()) === toKey(day);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError("");

    const toMs = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      return dayStart + (h * 60 + m) * 60_000;
    };

    const start = toMs(form.start);
    const end = toMs(form.end);

    if (!form.title.trim()) {
      setAddError("Give it a title.");
      return;
    }

    if (end <= start) {
      setAddError("The end time must be after the start.");
      return;
    }

    setSaving(true);

    try {
      await createMyEvent({ title: form.title.trim(), start, end });
      setAddOpen(false);
      setForm({ title: "", start: "10:00", end: "11:00" });
      reload();
    } catch (err: unknown) {
      setAddError(
        err instanceof Error ? err.message : "Could not add that event."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-navy-500 dark:text-white">My calendar</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-white/50">
            {user?.email ? `Signed in as ${user.email}.` : "Your own schedule."} Visitor
            bookings appear here automatically.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-navy-500 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <IconPlus className="size-4" />
          Add event
        </button>
      </header>

      {/* Month calendar — the familiar grid, one tap to jump anywhere. */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-navy-500/12 bg-white dark:bg-surface-dark-card">
        <div className="flex items-center justify-between border-b border-navy-500/10 dark:border-white/10 px-4 py-3 sm:px-6">
          <p className="font-serif text-lg text-navy-500 dark:text-white sm:text-xl">
            {monthFmt.format(monthCursor)}
          </p>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goToday}
              className="mr-1 hidden min-h-9 cursor-pointer rounded-lg px-3 text-sm font-medium text-navy-500 dark:text-white transition-colors hover:bg-navy-500/8 dark:hover:bg-white/8 sm:block"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-navy-500 dark:text-white transition-colors hover:bg-navy-500/8 dark:hover:bg-white/8"
            >
              <IconChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-navy-500 dark:text-white transition-colors hover:bg-navy-500/8 dark:hover:bg-white/8"
            >
              <IconChevronRight className="size-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-navy-500/10 dark:border-white/10 bg-navy-500/[0.03]">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="py-2 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500 dark:text-white/50"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {monthGrid.map((cellDate) => {
            const key = toKey(cellDate);
            const inMonth = cellDate.getMonth() === monthCursor.getMonth();
            const isSelected = key === toKey(day);
            const isCellToday = key === toKey(new Date());
            const hasEvents = eventDayKeys.has(key);

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  goto(cellDate);
                  setDayModalOpen(true);
                }}
                aria-current={isSelected ? "date" : undefined}
                className={`relative flex aspect-square min-h-11 cursor-pointer flex-col items-center justify-center gap-1 border-b border-r border-navy-500/[0.06] text-sm transition-colors duration-150 last:border-r-0 sm:aspect-auto sm:min-h-16 ${
                  isSelected
                    ? "bg-navy-500 font-semibold text-white"
                    : inMonth
                      ? "text-navy-500 dark:text-white hover:bg-navy-500/6 dark:hover:bg-white/6"
                      : "text-stone-400 hover:bg-navy-500/[0.04]"
                }`}
              >
                <span
                  className={
                    isCellToday && !isSelected
                      ? "flex size-6 items-center justify-center rounded-full border border-gold-500 font-semibold text-gold-600"
                      : ""
                  }
                >
                  {cellDate.getDate()}
                </span>
                {hasEvents ? (
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${
                      isSelected ? "bg-white dark:bg-surface-dark-card" : "bg-gold-500"
                    }`}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-6 rounded-2xl bg-red-50 dark:bg-red-400/15 px-5 py-4 text-sm text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* Day detail — a popup rather than a section that pushes the page
          around every time a different date is tapped. The month grid above
          already shows the shape of the month (the gold dots); this only
          needs to answer "what's on this one day", so a plain ordered list
          does that better than an hour-ruled canvas once every event here
          runs 30–60 minutes anyway. */}
      <AnimatePresence>
        {dayModalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setDayModalOpen(false)}
              className="absolute inset-0 cursor-pointer bg-navy-500/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.25 }}
              role="dialog"
              aria-modal="true"
              aria-label={dayFmt.format(day)}
              className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-4xl bg-white dark:bg-surface-dark-card shadow-2xl"
            >
              <div className="sticky top-0 flex items-center justify-between border-b border-navy-500/10 dark:border-white/10 bg-white dark:bg-surface-dark-card px-6 py-5">
                <p className="font-serif text-lg text-navy-500 dark:text-white">
                  {dayFmt.format(day)}
                  {isToday ? (
                    <span className="ml-2 rounded-full bg-gold-300/25 px-2 py-0.5 align-middle text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-500">
                      Today
                    </span>
                  ) : null}
                </p>
                <button
                  type="button"
                  onClick={() => setDayModalOpen(false)}
                  aria-label="Close"
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-navy-500/15 dark:border-white/10 text-navy-500 dark:text-white transition-colors hover:bg-navy-500/10 dark:bg-white/10"
                >
                  <IconX className="size-5" />
                </button>
              </div>

              {loading ? (
                <div className="space-y-px p-4">
                  {[0, 1, 2].map((key) => (
                    <div
                      key={key}
                      className="h-16 animate-pulse rounded-lg bg-navy-500/[0.05]"
                    />
                  ))}
                </div>
              ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                  <p className="text-sm font-medium text-navy-500 dark:text-white">
                    Nothing scheduled {isToday ? "today" : "this day"}.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setDayModalOpen(false);
                      setAddOpen(true);
                    }}
                    className="min-h-10 cursor-pointer rounded-lg border border-navy-500/20 dark:border-white/15 px-4 text-sm font-medium text-navy-500 dark:text-white transition-colors hover:bg-navy-500/8 dark:hover:bg-white/8"
                  >
                    Add an event
                  </button>
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-navy-500 dark:divide-white/10/8">
                    {[...events]
                      .sort((a, b) => a.start - b.start)
                      .map((event) => {
                        const isNow =
                          isToday && now >= event.start && now < event.end;

                        return (
                          <li
                            key={event.id}
                            className={`flex items-start gap-4 px-6 py-3.5 ${
                              isNow ? "bg-maroon-500/[0.04]" : ""
                            }`}
                          >
                            <div className="w-16 shrink-0 pt-0.5 text-right text-sm tabular-nums text-stone-600 dark:text-white/60">
                              {event.allDay ? "All day" : timeFmt.format(event.start)}
                            </div>

                            <div
                              className={`h-full min-h-10 w-1 shrink-0 self-stretch rounded-full ${
                                event.isVisit ? "bg-gold-500" : "bg-navy-500"
                              }`}
                              aria-hidden
                            />

                            <div className="min-w-0 flex-1">
                              <p
                                className={`flex items-center gap-1.5 text-sm font-semibold ${
                                  event.isVisit ? "text-gold-700" : "text-navy-500 dark:text-white"
                                }`}
                              >
                                {event.isVisit ? (
                                  <IconUserCheck className="size-3.5 shrink-0" />
                                ) : null}
                                <span className="truncate">{event.title}</span>
                                {isNow ? (
                                  <span className="rounded-full bg-maroon-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-maroon-500">
                                    Now
                                  </span>
                                ) : null}
                              </p>
                              {!event.allDay ? (
                                <p className="mt-0.5 text-xs text-stone-500 dark:text-white/50">
                                  {timeFmt.format(event.start)} –{" "}
                                  {timeFmt.format(event.end)}
                                  {event.location ? (
                                    <span className="ml-2 inline-flex items-center gap-1">
                                      <IconMapPin className="size-3" />
                                      {event.location}
                                    </span>
                                  ) : null}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                  </ul>

                  <div className="flex items-center justify-between gap-4 border-t border-navy-500/10 dark:border-white/10 px-6 py-4">
                    {events.some((e) => e.isVisit) ? (
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-white/50">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2.5 w-1 rounded-full bg-navy-500" />
                          Your meetings
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2.5 w-1 rounded-full bg-gold-500" />
                          Booked at the front desk
                        </span>
                      </p>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDayModalOpen(false);
                        setAddOpen(true);
                      }}
                      className="min-h-9 shrink-0 cursor-pointer rounded-lg border border-navy-500/20 dark:border-white/15 px-3 text-xs font-medium text-navy-500 dark:text-white transition-colors hover:bg-navy-500/8 dark:hover:bg-white/8"
                    >
                      + Add event
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Add event */}
      <AnimatePresence>
        {addOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setAddOpen(false)}
              className="absolute inset-0 cursor-pointer bg-navy-500/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.25 }}
              role="dialog"
              aria-modal="true"
              aria-label="Add an event"
              className="relative z-10 w-full max-w-md rounded-4xl bg-white dark:bg-surface-dark-card p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-navy-500 dark:text-white">Add event</h2>
                  <p className="mt-1 text-sm text-stone-500 dark:text-white/50">
                    Added to your calendar on {dayFmt.format(day)}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  aria-label="Close"
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-navy-500/15 dark:border-white/10 text-navy-500 dark:text-white transition-colors hover:bg-navy-500/10 dark:bg-white/10"
                >
                  <IconX className="size-5" />
                </button>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleAdd}>
                <div>
                  <label
                    htmlFor="eventTitle"
                    className="mb-2 block text-sm font-medium text-navy-500 dark:text-white"
                  >
                    Title *
                  </label>
                  <input
                    id="eventTitle"
                    required
                    value={form.title}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="e.g. Client call with Kotak"
                    className="min-h-12 w-full rounded-xl border border-navy-500/20 dark:border-white/15 px-4 text-navy-500 dark:text-white outline-none focus:border-navy-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="eventStart"
                      className="mb-2 block text-sm font-medium text-navy-500 dark:text-white"
                    >
                      From
                    </label>
                    <input
                      id="eventStart"
                      type="time"
                      value={form.start}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, start: e.target.value }))
                      }
                      className="min-h-12 w-full rounded-xl border border-navy-500/20 dark:border-white/15 px-4 text-navy-500 dark:text-white outline-none focus:border-navy-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="eventEnd"
                      className="mb-2 block text-sm font-medium text-navy-500 dark:text-white"
                    >
                      Until
                    </label>
                    <input
                      id="eventEnd"
                      type="time"
                      value={form.end}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, end: e.target.value }))
                      }
                      className="min-h-12 w-full rounded-xl border border-navy-500/20 dark:border-white/15 px-4 text-navy-500 dark:text-white outline-none focus:border-navy-500"
                    />
                  </div>
                </div>

                {addError ? (
                  <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-400/15 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                    {addError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-12 w-full cursor-pointer rounded-2xl bg-navy-500 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Adding…" : "Add to my calendar"}
                </button>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <RoleGate
      allow="staff"
      title="This calendar is for staff"
      body="It shows the day of the person visitors come to see. As an admin you manage the directory and logins instead."
      backHref="/staff"
      backLabel="Go to the directory"
    >
      {/* useSearchParams needs a Suspense boundary so the route stays prerenderable. */}
      <Suspense fallback={<div className="min-h-[60vh] bg-stone-50 dark:bg-surface-dark" />}>
        <CalendarView />
      </Suspense>
    </RoleGate>
  );
}
