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
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_HEIGHT,
  layOutDay,
} from "@/src/lib/day-layout";
import { useAuth } from "@/src/context/AuthContext";
import RoleGate from "@/components/RoleGate";

const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i
);

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

function hourLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    hour12: true,
  }).format(date);
}

function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // The date lives in the URL so a particular day can be linked and the back
  // button steps through days the way people expect.
  const day = useMemo(() => fromKey(searchParams.get("date")), [searchParams]);
  const dayStart = day.getTime();
  const dayEnd = dayStart + 24 * 3_600_000;

  // One piece of state, written only from the resolved fetch. "Loading" is
  // then derived from whether the result belongs to the day on screen, which
  // also stops a slow response for yesterday overwriting today.
  const [result, setResult] = useState<{
    key: number;
    events: CalendarEvent[];
    error: string;
  } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const fresh = result?.key === dayStart ? result : null;
  // Memoised so the empty fallback is not a fresh array on every render, which
  // would re-run the day layout continuously.
  const events = useMemo(() => fresh?.events ?? [], [fresh]);
  const error = fresh?.error ?? "";
  const loading = Boolean(user) && fresh === null;

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [form, setForm] = useState({ title: "", start: "10:00", end: "11:00" });

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    fetchMyEvents(dayStart, dayEnd)
      .then((data) => {
        if (cancelled) return;
        setResult({
          key: dayStart,
          events: data.events,
          error: "",
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResult({
          key: dayStart,
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
  }, [dayStart, dayEnd, user, reloadNonce]);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  // Keeps the "now" line honest without re-fetching.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const goto = (date: Date) => router.push(`/staff/calendar?date=${toKey(date)}`);

  const shiftDay = (delta: number) => {
    const next = new Date(day);
    next.setDate(next.getDate() + delta);
    goto(next);
  };

  const positioned = useMemo(() => layOutDay(events, dayStart), [events, dayStart]);
  const allDay = useMemo(() => events.filter((e) => e.allDay), [events]);

  const isToday = toKey(new Date()) === toKey(day);
  const nowOffset =
    ((now - dayStart) / 3_600_000 - DAY_START_HOUR) * HOUR_HEIGHT;
  const showNowLine =
    isToday && nowOffset >= 0 && nowOffset <= (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;

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
          <h1 className="font-serif text-2xl text-navy-500">My calendar</h1>
          <p className="mt-1 text-sm text-stone-500">
            {user?.email ? `Signed in as ${user.email}` : "Your own schedule"} —
            visitor bookings appear here automatically.
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

      {/* Date navigation */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-navy-500/15 bg-white p-1">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            aria-label="Previous day"
            className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-navy-500 transition-colors hover:bg-navy-500/8"
          >
            <IconChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => goto(new Date())}
            className="min-h-10 cursor-pointer rounded-lg px-4 text-sm font-semibold text-navy-500 transition-colors hover:bg-navy-500/8"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftDay(1)}
            aria-label="Next day"
            className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-navy-500 transition-colors hover:bg-navy-500/8"
          >
            <IconChevronRight className="size-5" />
          </button>
        </div>

        <p className="font-serif text-lg text-navy-500">
          {dayFmt.format(day)}
          {isToday ? (
            <span className="ml-2 rounded-full bg-gold-300/25 px-2 py-0.5 align-middle text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-500">
              Today
            </span>
          ) : null}
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-6 rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {allDay.length ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {allDay.map((event) => (
            <span
              key={event.id}
              className="rounded-lg bg-navy-500/10 px-3 py-1.5 text-sm font-medium text-navy-500"
            >
              {event.title}
            </span>
          ))}
        </div>
      ) : null}

      {/* Timeline */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-navy-500/12 bg-white">
        {loading ? (
          <div className="space-y-px p-4">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <div
                key={key}
                className="h-14 animate-pulse rounded-lg bg-navy-500/[0.05]"
              />
            ))}
          </div>
        ) : (
          <div className="relative flex">
            {/* Hour gutter */}
            <div className="w-16 shrink-0 border-r border-navy-500/10 sm:w-20">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{ height: HOUR_HEIGHT }}
                  className="relative -top-2 pr-2 text-right text-[11px] font-medium tabular-nums text-stone-500"
                >
                  {hourLabel(hour)}
                </div>
              ))}
            </div>

            {/* Event canvas */}
            <div
              className="relative flex-1"
              style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT }}
            >
              {HOURS.map((hour, index) => (
                <div
                  key={hour}
                  style={{ top: index * HOUR_HEIGHT }}
                  className="pointer-events-none absolute inset-x-0 border-t border-navy-500/8"
                />
              ))}

              {showNowLine ? (
                <div
                  style={{ top: nowOffset }}
                  className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                  aria-hidden
                >
                  <span className="size-2 rounded-full bg-maroon-500" />
                  <span className="h-px flex-1 bg-maroon-500" />
                </div>
              ) : null}

              {positioned.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <p className="text-sm font-medium text-navy-500">
                    Nothing scheduled {isToday ? "today" : "this day"}.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="min-h-10 cursor-pointer rounded-lg border border-navy-500/20 px-4 text-sm font-medium text-navy-500 transition-colors hover:bg-navy-500/8"
                  >
                    Add an event
                  </button>
                </div>
              ) : null}

              {positioned.map(({ event, top, height, column, columns }) => {
                const width = 100 / columns;

                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      top,
                      height,
                      left: `calc(${column * width}% + 6px)`,
                      width: `calc(${width}% - 12px)`,
                    }}
                    className={`absolute z-10 overflow-hidden rounded-lg border-l-4 px-3 py-1.5 ${
                      event.isVisit
                        ? "border-l-gold-500 bg-gold-100/70"
                        : "border-l-navy-500 bg-navy-500/[0.07]"
                    }`}
                  >
                    <p
                      className={`flex items-center gap-1.5 truncate text-xs font-semibold ${
                        event.isVisit ? "text-gold-700" : "text-navy-500"
                      }`}
                    >
                      {event.isVisit ? (
                        <IconUserCheck className="size-3.5 shrink-0" />
                      ) : null}
                      <span className="truncate">{event.title}</span>
                    </p>
                    {height > 40 ? (
                      <p className="mt-0.5 truncate text-[11px] tabular-nums text-stone-600">
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
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-500">
        <span className="flex items-center gap-2">
          <span className="h-3 w-1 rounded-full bg-navy-500" />
          Your meetings
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-1 rounded-full bg-gold-500" />
          Booked at the front desk
        </span>
      </p>

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
              className="relative z-10 w-full max-w-md rounded-4xl bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-navy-500">Add event</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    Added to your calendar on {dayFmt.format(day)}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  aria-label="Close"
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-navy-500/15 text-navy-500 transition-colors hover:bg-navy-500/10"
                >
                  <IconX className="size-5" />
                </button>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleAdd}>
                <div>
                  <label
                    htmlFor="eventTitle"
                    className="mb-2 block text-sm font-medium text-navy-500"
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
                    placeholder="e.g. Client call — Kotak"
                    className="min-h-12 w-full rounded-xl border border-navy-500/20 px-4 text-navy-500 outline-none focus:border-navy-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="eventStart"
                      className="mb-2 block text-sm font-medium text-navy-500"
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
                      className="min-h-12 w-full rounded-xl border border-navy-500/20 px-4 text-navy-500 outline-none focus:border-navy-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="eventEnd"
                      className="mb-2 block text-sm font-medium text-navy-500"
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
                      className="min-h-12 w-full rounded-xl border border-navy-500/20 px-4 text-navy-500 outline-none focus:border-navy-500"
                    />
                  </div>
                </div>

                {addError ? (
                  <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
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
      <Suspense fallback={<div className="min-h-[60vh] bg-stone-50" />}>
        <CalendarView />
      </Suspense>
    </RoleGate>
  );
}
