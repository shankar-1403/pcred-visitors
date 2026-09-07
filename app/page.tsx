"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendarTime,
  IconCheck,
  IconClock,
  IconSearch,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { useStaff, type Staff } from "@/src/hooks/useStaff";
import { HAS_FIREBASE_CONFIG } from "@/src/lib/firebase";
import SetupNotice from "@/components/SetupNotice";
import { useVisitorRequest } from "@/src/hooks/useVisitorRequest";
import {
  createVisitorRequest,
  fetchAvailability,
  type Availability,
} from "@/src/lib/data";
import {
  MAX_LOOKAHEAD_HOURS,
  MIN_LEAD_MINUTES,
  type Slot,
} from "@/src/lib/availability";

const PURPOSES = [
  "Meeting",
  "Scheduled Appointment",
  "Interview",
  "Vendor / Supplier",
  "Delivery",
  "Loan / Scheme Enquiry",
  "Other",
] as const;

type Step =
  | "welcome"
  | "staff"
  | "when"
  | "details"
  | "purpose"
  | "review"
  | "status";

/** Steps that show the progress rail, in order. */
const FLOW_STEPS: Step[] = ["staff", "when", "details", "purpose", "review"];

const STEP_TITLES: Record<Step, string> = {
  welcome: "Welcome",
  staff: "Who are you here to meet?",
  when: "When would you like to meet?",
  details: "Tell us about you",
  purpose: "What brings you in?",
  review: "Check and confirm",
  status: "Your request",
};

/** A half-filled form left on a lobby tablet resets itself. */
const IDLE_RESET_MS = 90_000;
/** How long a finished request stays on screen before the tablet returns home. */
const RESULT_RESET_MS = 25_000;

const initialForm = {
  visitorName: "",
  visitorPhone: "",
  visitorEmail: "",
  company: "",
  partySize: "1",
  purpose: "" as (typeof PURPOSES)[number] | "",
  purposeNote: "",
};

function initials(name?: string) {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatTime(ms?: number | null) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function ReceptionKioskPage() {
  const { activeStaff, loading: staffLoading, error: staffError } = useStaff();
  const reduceMotion = useReducedMotion();

  const [step, setStep] = useState<Step>("welcome");
  const [form, setForm] = useState(initialForm);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [search, setSearch] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  /** Chosen slot start, or null for "meet now". */
  const [requestedFor, setRequestedFor] = useState<number | null>(null);
  /** "HH:MM" typed into the custom time picker — separate so the input can
      hold a value the visitor is still typing, before it becomes a real pick. */
  const [customTime, setCustomTime] = useState("");
  const [customTimeError, setCustomTimeError] = useState("");

  const { request } = useVisitorRequest(requestId);
  const status = request?.status ?? "pending";
  const resolved = Boolean(requestId) && status !== "pending";

  const reset = useCallback(() => {
    setStep("welcome");
    setForm(initialForm);
    setSelectedStaff(null);
    setSearch("");
    setFieldErrors({});
    setSubmitError("");
    setRequestId(null);
    setAvailability(null);
    setAvailabilityError("");
    setRequestedFor(null);
    setCustomTime("");
    setCustomTimeError("");
  }, []);

  // Idle guard: any half-finished check-in is wiped so the next visitor never
  // sees (or accidentally submits under) someone else's details.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (step === "welcome" || step === "status") return;

    const bump = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(reset, IDLE_RESET_MS);
    };

    bump();

    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "keydown",
      "touchstart",
    ];
    events.forEach((event) => window.addEventListener(event, bump));

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach((event) => window.removeEventListener(event, bump));
    };
  }, [step, reset]);

  // Once the staff member has answered, hold the outcome on screen long enough
  // to read, then hand the tablet back to the next visitor.
  useEffect(() => {
    if (step !== "status" || !resolved) return;

    const timer = setTimeout(reset, RESULT_RESET_MS);
    return () => clearTimeout(timer);
  }, [step, resolved, reset]);

  const staffByDepartment = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matched = query
      ? activeStaff.filter((member) =>
          [member.name, member.designation, member.department]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value.includes(query))
        )
      : activeStaff;

    const groups = new Map<string, Staff[]>();

    matched.forEach((member) => {
      const key = String(member.department ?? "").trim() || "Team";
      groups.set(key, [...(groups.get(key) ?? []), member]);
    });

    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [activeStaff, search]);

  const selectStaff = useCallback(async (member: Staff) => {
    setSelectedStaff(member);
    setRequestedFor(null);
    setCustomTime("");
    setCustomTimeError("");
    setAvailability(null);
    setAvailabilityError("");
    setStep("when");
    setAvailabilityLoading(true);

    try {
      setAvailability(await fetchAvailability(member.id));
    } catch {
      // Never strand the visitor on a calendar problem — they can still ask
      // to meet now, exactly as before this step existed.
      setAvailabilityError(
        "We couldn't check their calendar just now."
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }, []);

  const setField = (name: keyof typeof initialForm, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const validateDetails = () => {
    const errors: Record<string, string> = {};

    if (!form.visitorName.trim()) {
      errors.visitorName = "Please enter your name.";
    }

    const phone = form.visitorPhone.trim();
    if (!phone) {
      errors.visitorPhone = "Please enter a phone number.";
    } else if (!/^[+]?[\d\s()-]{7,20}$/.test(phone)) {
      errors.visitorPhone = "That doesn't look like a valid phone number.";
    }

    const email = form.visitorEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      errors.visitorEmail = "That doesn't look like a valid email address.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  async function handleSubmit() {
    if (!selectedStaff) return;

    setSubmitError("");
    setSubmitting(true);

    try {
      const id = await createVisitorRequest({
        staffId: selectedStaff.id,
        visitorName: form.visitorName.trim(),
        visitorPhone: form.visitorPhone.trim(),
        visitorEmail: form.visitorEmail.trim(),
        company: form.company.trim(),
        partySize: Number(form.partySize) || 1,
        purpose: form.purpose || "Other",
        purposeNote: form.purposeNote.trim(),
        requestedFor,
      });

      setRequestId(id);
      setStep("status");
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "Check-in failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const availableSlots = useMemo(
    () => (availability?.slots ?? []).filter((slot: Slot) => slot.available),
    [availability]
  );

  /**
   * The slot grid only offers fixed intervals — someone due at 2:47pm for a
   * scheduled call has no way to say so otherwise. Same bounds as the grid
   * (a short lead time, and not past today), just without the 30-minute snap.
   */
  const applyCustomTime = (value: string) => {
    setCustomTime(value);
    setCustomTimeError("");

    if (!value) return;

    const [hours, minutes] = value.split(":").map(Number);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;

    const picked = new Date();
    picked.setHours(hours, minutes, 0, 0);

    const now = Date.now();
    const earliest = now + MIN_LEAD_MINUTES * 60_000;
    const latest = now + MAX_LOOKAHEAD_HOURS * 3_600_000;

    if (picked.getTime() < earliest) {
      setCustomTimeError(`Please pick a time at least ${MIN_LEAD_MINUTES} minutes from now.`);
      return;
    }

    if (picked.getTime() > latest) {
      setCustomTimeError("That's too far ahead — please pick a time later today, closer to now.");
      return;
    }

    setRequestedFor(picked.getTime());
  };

  const stepIndex = FLOW_STEPS.indexOf(step);

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

  if (!HAS_FIREBASE_CONFIG) return <SetupNotice tone="dark" />;

  return (
    <div className="relative flex min-h-screen flex-col bg-brand-deep text-white">
      {/* Ambient brand wash — static, so nothing animates behind text all day.
          Clipping lives on this layer, not the page: overflow-hidden on the
          root cut off anything taller than the viewport. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,#045178_0%,#022436_58%,#01161f_100%)]" />
        <div className="absolute -left-40 top-1/3 size-[36rem] rounded-full bg-gold-300/[0.07] blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6 lg:px-12">
          <div className="flex items-center gap-4">
            <Image
              src="/logo.webp"
              alt="PCRED"
              width={192}
              height={57}
              priority
              className="h-10 w-auto object-contain sm:h-12"
            />
          </div>

          {step !== "welcome" && step !== "status" ? (
            <button
              type="button"
              onClick={reset}
              className="flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-medium text-white/70 transition-colors duration-200 hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
            >
              <IconX className="size-4" />
              Start over
            </button>
          ) : null}
        </header>

        {/* Progress rail */}
        {stepIndex >= 0 ? (
          <div className="px-5 sm:px-8 lg:px-12">
            <div className="flex items-center gap-3">
              {FLOW_STEPS.map((flowStep, index) => (
                <div key={flowStep} className="flex flex-1 items-center gap-3">
                  <div
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                      index <= stepIndex ? "bg-gold-300" : "bg-white/12"
                    }`}
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              Step {stepIndex + 1} of {FLOW_STEPS.length} — {STEP_TITLES[step]}
            </p>
          </div>
        ) : null}

        <main className="flex flex-1 flex-col px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
          {/* Keyed on the step so React remounts and the entrance animation
              replays. Deliberately no AnimatePresence: `mode="wait"` here could
              leave a finished exit un-removed, stranding the visitor on a blank
              screen — an entrance-only transition cannot fail that way. */}
          <motion.div
            key={step}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
            className="flex flex-1 flex-col"
          >
            {/* ---------------------------------------------------- WELCOME */}
            {step === "welcome" ? (
              <section className="flex flex-1 flex-col items-center justify-center text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-gold-300">
                  PCRED Venture Pvt. Ltd.
                </p>
                <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
                  Welcome to our office
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/60">
                  Let the person you&rsquo;re here to meet know you&rsquo;ve
                  arrived. It takes under a minute.
                </p>

                <button
                  type="button"
                  onClick={() => setStep("staff")}
                  className="group mt-12 flex min-h-20 cursor-pointer items-center gap-4 rounded-full bg-gold-300 px-12 text-lg font-semibold text-brand-deep shadow-2xl shadow-gold-300/20 transition-all duration-200 hover:bg-gold-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-[0.98]"
                >
                  Check in
                  <IconArrowRight className="size-6 transition-transform duration-200 group-hover:translate-x-1" />
                </button>

                <p className="mt-10 text-sm text-white/35">
                  Need help? Please speak to the front desk.
                </p>
              </section>
            ) : null}

            {/* ------------------------------------------------------ STAFF */}
            {step === "staff" ? (
              <section className="flex flex-1 flex-col">
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <h2 className="font-serif text-4xl tracking-tight text-white sm:text-5xl">
                    {STEP_TITLES.staff}
                  </h2>

                  <div className="relative w-full max-w-sm">
                    <IconSearch
                      aria-hidden
                      className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-white/40"
                    />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name or team"
                      aria-label="Search staff by name or team"
                      className="min-h-14 w-full rounded-full border border-white/15 bg-white/[0.06] pl-13 pr-5 text-base text-white outline-none transition-colors duration-200 placeholder:text-white/35 focus:border-gold-300/70 focus:bg-white/10"
                    />
                  </div>
                </div>

                <div className="mt-8 flex-1 pb-4">
                  {staffLoading ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {[0, 1, 2, 3, 4, 5].map((key) => (
                        <div
                          key={key}
                          className="h-28 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04]"
                        />
                      ))}
                    </div>
                  ) : staffError ? (
                    <p className="rounded-3xl border border-red-400/30 bg-red-500/10 px-6 py-5 text-base text-red-200">
                      We couldn&rsquo;t load the staff list. Please speak to the
                      front desk.
                    </p>
                  ) : staffByDepartment.length === 0 ? (
                    <p className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-5 text-base text-white/60">
                      {activeStaff.length === 0
                        ? "No staff are listed yet. Please speak to the front desk."
                        : "Nobody matches that search. Try a different name."}
                    </p>
                  ) : (
                    <div className="space-y-10">
                      {staffByDepartment.map(([department, members]) => (
                        <div key={department}>
                          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">
                            {department}
                          </h3>

                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {members.map((member, index) => (
                              <motion.button
                                key={member.id}
                                type="button"
                                initial={
                                  reduceMotion
                                    ? undefined
                                    : { opacity: 0, y: 12 }
                                }
                                animate={
                                  reduceMotion ? undefined : { opacity: 1, y: 0 }
                                }
                                transition={{
                                  duration: 0.3,
                                  delay: Math.min(index * 0.04, 0.3),
                                }}
                                onClick={() => selectStaff(member)}
                                className={`flex min-h-28 cursor-pointer items-center gap-5 rounded-3xl border p-5 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 active:scale-[0.99] ${
                                  selectedStaff?.id === member.id
                                    ? "border-gold-300 bg-gold-300/12"
                                    : "border-white/12 bg-white/[0.05] hover:border-gold-300/50 hover:bg-white/[0.09]"
                                }`}
                              >
                                <span
                                  aria-hidden
                                  className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gold-300/15 font-serif text-xl font-semibold text-gold-300"
                                >
                                  {initials(member.name) || (
                                    <IconUser className="size-7" />
                                  )}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-lg font-semibold text-white">
                                    {member.name}
                                  </span>
                                  <span className="mt-0.5 block truncate text-sm text-white/50">
                                    {member.designation || department}
                                  </span>
                                </span>
                              </motion.button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            {/* ------------------------------------------------------- WHEN */}
            {step === "when" ? (
              <section className="flex flex-1 flex-col">
                <h2 className="font-serif text-4xl tracking-tight text-white sm:text-5xl">
                  {STEP_TITLES.when}
                </h2>
                <p className="mt-3 text-base text-white/50">
                  Meeting{" "}
                  <span className="font-medium text-gold-300">
                    {selectedStaff?.name}
                  </span>
                </p>

                <div className="mt-8 flex max-w-4xl flex-1 flex-col">
                  {availabilityLoading ? (
                    <div className="space-y-4">
                      <div className="h-6 w-72 animate-pulse rounded-full bg-white/10" />
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[0, 1, 2, 3, 4, 5, 6, 7].map((key) => (
                          <div
                            key={key}
                            className="h-16 animate-pulse rounded-2xl bg-white/[0.06]"
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <AvailabilityHeadline
                        availability={availability}
                        error={availabilityError}
                        firstName={selectedStaff?.name?.split(" ")[0]}
                      />

                      {/* "Now" is always offered. Even a fully booked person can
                          wave someone in, and the calendar may be wrong. */}
                      <button
                        type="button"
                        onClick={() => {
                          setRequestedFor(null);
                          setCustomTime("");
                          setCustomTimeError("");
                        }}
                        aria-pressed={requestedFor === null}
                        className={`mt-6 flex min-h-18 cursor-pointer items-center justify-between rounded-2xl border px-7 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 ${
                          requestedFor === null
                            ? "border-gold-300 bg-gold-300 text-brand-deep"
                            : "border-white/15 bg-white/[0.05] text-white hover:border-white/35 hover:bg-white/[0.09]"
                        }`}
                      >
                        <span>
                          <span className="block text-lg font-semibold">
                            Ask to meet now
                          </span>
                          <span
                            className={`mt-0.5 block text-sm ${
                              requestedFor === null
                                ? "text-brand-deep/70"
                                : "text-white/45"
                            }`}
                          >
                            They&rsquo;ll be asked straight away
                          </span>
                        </span>
                        {requestedFor === null ? (
                          <IconCheck className="size-6 shrink-0" />
                        ) : null}
                      </button>

                      {availableSlots.length > 0 ? (
                        <>
                          <p className="mt-8 mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                            Or book a time today
                          </p>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                            {availableSlots.map((slot) => (
                              <button
                                key={slot.start}
                                type="button"
                                onClick={() => {
                                  setRequestedFor(slot.start);
                                  setCustomTime("");
                                  setCustomTimeError("");
                                }}
                                aria-pressed={requestedFor === slot.start}
                                className={`flex min-h-16 cursor-pointer items-center justify-center rounded-2xl border text-lg font-semibold tabular-nums transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 active:scale-[0.98] ${
                                  requestedFor === slot.start
                                    ? "border-gold-300 bg-gold-300 text-brand-deep"
                                    : "border-white/15 bg-white/[0.05] text-white/80 hover:border-white/35 hover:bg-white/[0.09] hover:text-white"
                                }`}
                              >
                                {formatTime(slot.start)}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : null}

                      <div className="mt-8">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                          Or choose your own time
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            type="time"
                            value={customTime}
                            onChange={(e) => applyCustomTime(e.target.value)}
                            aria-label="Choose a specific time to meet"
                            // Matches the native picker's icon and popover to the
                            // kiosk's dark theme instead of the browser default.
                            style={{ colorScheme: "dark" }}
                            className={`min-h-16 rounded-2xl border bg-white/[0.05] px-5 text-lg font-semibold tabular-nums text-white outline-none transition-colors duration-200 focus:border-gold-300/70 ${
                              customTime && requestedFor !== null && !customTimeError
                                ? "border-gold-300"
                                : "border-white/15"
                            }`}
                          />
                          {customTime && requestedFor !== null && !customTimeError ? (
                            <span className="flex min-h-11 items-center gap-2 rounded-full bg-gold-300/15 px-4 text-sm font-medium text-gold-200">
                              <IconCheck className="size-4" />
                              Set for {formatTime(requestedFor)}
                            </span>
                          ) : null}
                        </div>
                        {customTimeError ? (
                          <p role="alert" className="mt-2 text-sm text-red-300">
                            {customTimeError}
                          </p>
                        ) : null}
                      </div>
                    </>
                  )}

                  <div className="mt-auto flex gap-4 pt-8">
                    <BackButton onClick={() => setStep("staff")} />
                    <NextButton
                      label="Continue"
                      disabled={availabilityLoading}
                      onClick={() => setStep("details")}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {/* ---------------------------------------------------- DETAILS */}
            {step === "details" ? (
              <section className="flex flex-1 flex-col">
                <h2 className="font-serif text-4xl tracking-tight text-white sm:text-5xl">
                  {STEP_TITLES.details}
                </h2>
                <p className="mt-3 text-base text-white/50">
                  Meeting{" "}
                  <span className="font-medium text-gold-300">
                    {selectedStaff?.name}
                  </span>
                </p>

                <form
                  className="mt-8 grid max-w-4xl flex-1 content-start gap-6 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (validateDetails()) setStep("purpose");
                  }}
                >
                  <KioskField
                    id="visitorName"
                    label="Your name"
                    required
                    value={form.visitorName}
                    onChange={(value) => setField("visitorName", value)}
                    error={fieldErrors.visitorName}
                    autoComplete="name"
                    placeholder="Full name"
                  />
                  <KioskField
                    id="visitorPhone"
                    label="Phone number"
                    required
                    type="tel"
                    inputMode="tel"
                    value={form.visitorPhone}
                    onChange={(value) => setField("visitorPhone", value)}
                    error={fieldErrors.visitorPhone}
                    autoComplete="tel"
                    placeholder="+91 98765 43210"
                  />
                  <KioskField
                    id="company"
                    label="Company"
                    value={form.company}
                    onChange={(value) => setField("company", value)}
                    autoComplete="organization"
                    placeholder="Optional"
                  />
                  <KioskField
                    id="visitorEmail"
                    label="Email"
                    type="email"
                    inputMode="email"
                    value={form.visitorEmail}
                    onChange={(value) => setField("visitorEmail", value)}
                    error={fieldErrors.visitorEmail}
                    autoComplete="email"
                    placeholder="Optional"
                  />

                  <fieldset className="sm:col-span-2">
                    <legend className="mb-3 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                      How many of you are visiting?
                    </legend>
                    <div className="flex flex-wrap gap-3">
                      {["1", "2", "3", "4", "5+"].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() =>
                            setField("partySize", size === "5+" ? "5" : size)
                          }
                          aria-pressed={
                            form.partySize === (size === "5+" ? "5" : size)
                          }
                          className={`flex min-h-14 min-w-16 cursor-pointer items-center justify-center gap-2 rounded-2xl border px-5 text-base font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 ${
                            form.partySize === (size === "5+" ? "5" : size)
                              ? "border-gold-300 bg-gold-300 text-brand-deep"
                              : "border-white/15 bg-white/[0.05] text-white/70 hover:border-white/30 hover:text-white"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <div className="flex gap-4 pt-4 sm:col-span-2">
                    <BackButton onClick={() => setStep("when")} />
                    <NextButton type="submit" label="Continue" />
                  </div>
                </form>
              </section>
            ) : null}

            {/* ---------------------------------------------------- PURPOSE */}
            {step === "purpose" ? (
              <section className="flex flex-1 flex-col">
                <h2 className="font-serif text-4xl tracking-tight text-white sm:text-5xl">
                  {STEP_TITLES.purpose}
                </h2>
                <p className="mt-3 text-base text-white/50">
                  This helps {selectedStaff?.name?.split(" ")[0] ?? "them"}{" "}
                  decide right away.
                </p>

                <div className="mt-8 flex max-w-4xl flex-1 flex-col">
                  <div className="flex flex-wrap gap-3">
                    {PURPOSES.map((purpose) => (
                      <button
                        key={purpose}
                        type="button"
                        onClick={() => setField("purpose", purpose)}
                        aria-pressed={form.purpose === purpose}
                        className={`flex min-h-16 cursor-pointer items-center rounded-2xl border px-7 text-base font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 active:scale-[0.98] ${
                          form.purpose === purpose
                            ? "border-gold-300 bg-gold-300 text-brand-deep"
                            : "border-white/15 bg-white/[0.05] text-white/75 hover:border-white/35 hover:bg-white/[0.09] hover:text-white"
                        }`}
                      >
                        {purpose}
                      </button>
                    ))}
                  </div>

                  <div className="mt-8">
                    <label
                      htmlFor="purposeNote"
                      className="mb-3 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45"
                    >
                      Anything else they should know?
                    </label>
                    <textarea
                      id="purposeNote"
                      rows={4}
                      value={form.purposeNote}
                      maxLength={500}
                      onChange={(e) => setField("purposeNote", e.target.value)}
                      placeholder="Optional — e.g. referred by Mr. Sharma, or here for the 3 PM appointment"
                      className="w-full resize-none rounded-3xl border border-white/15 bg-white/[0.06] px-6 py-5 text-base leading-relaxed text-white outline-none transition-colors duration-200 placeholder:text-white/30 focus:border-gold-300/70 focus:bg-white/10"
                    />
                  </div>

                  <div className="mt-auto flex gap-4 pt-8">
                    <BackButton onClick={() => setStep("details")} />
                    <NextButton
                      label="Review"
                      disabled={!form.purpose}
                      onClick={() => setStep("review")}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {/* ----------------------------------------------------- REVIEW */}
            {step === "review" ? (
              <section className="flex flex-1 flex-col">
                <h2 className="font-serif text-4xl tracking-tight text-white sm:text-5xl">
                  {STEP_TITLES.review}
                </h2>

                <dl className="mt-8 grid max-w-4xl gap-px overflow-hidden rounded-3xl border border-white/12 bg-white/10 sm:grid-cols-2">
                  <ReviewRow label="Here to meet" value={selectedStaff?.name} />
                  <ReviewRow
                    label="When"
                    value={
                      requestedFor
                        ? `Today at ${formatTime(requestedFor)}`
                        : "As soon as possible"
                    }
                  />
                  <ReviewRow label="Your name" value={form.visitorName} />
                  <ReviewRow label="Phone" value={form.visitorPhone} />
                  <ReviewRow label="Company" value={form.company || "—"} />
                  <ReviewRow label="Email" value={form.visitorEmail || "—"} />
                  <ReviewRow
                    label="Visitors"
                    value={`${form.partySize} ${
                      form.partySize === "1" ? "person" : "people"
                    }`}
                  />
                  <ReviewRow label="Purpose" value={form.purpose} />
                  <ReviewRow
                    label="Note"
                    value={form.purposeNote || "—"}
                    span
                  />
                </dl>

                {submitError ? (
                  <p
                    role="alert"
                    className="mt-6 max-w-4xl rounded-2xl border border-red-400/30 bg-red-500/10 px-6 py-4 text-base text-red-200"
                  >
                    {submitError}
                  </p>
                ) : null}

                <div className="mt-auto flex max-w-4xl gap-4 pt-8">
                  <BackButton
                    onClick={() => setStep("purpose")}
                    disabled={submitting}
                  />
                  <NextButton
                    label={submitting ? "Notifying…" : "Notify them now"}
                    disabled={submitting}
                    loading={submitting}
                    onClick={handleSubmit}
                  />
                </div>
              </section>
            ) : null}

            {/* ----------------------------------------------------- STATUS */}
            {step === "status" ? (
              <section className="flex flex-1 flex-col items-center justify-center text-center">
                {status === "pending" ? (
                  <>
                    <span
                      aria-hidden
                      className="relative flex size-28 items-center justify-center"
                    >
                      <span
                        className={`absolute inset-0 rounded-full bg-gold-300/15 ${
                          reduceMotion ? "" : "animate-ping"
                        }`}
                      />
                      <span className="relative flex size-20 items-center justify-center rounded-full bg-gold-300/20">
                        <IconClock className="size-9 text-gold-300" />
                      </span>
                    </span>

                    <h2 className="mt-10 max-w-3xl font-serif text-4xl tracking-tight text-white sm:text-5xl">
                      We&rsquo;ve let {selectedStaff?.name ?? "them"} know
                    </h2>
                    <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/55">
                      Please take a seat — this screen will update the moment
                      they respond.
                    </p>
                    <p
                      role="status"
                      aria-live="polite"
                      className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-white/35"
                    >
                      Waiting for a response
                    </p>
                  </>
                ) : (
                  <StatusResult
                    status={status}
                    staffName={selectedStaff?.name}
                    note={request?.responseNote}
                    postponedTo={request?.postponedTo}
                    requestedFor={requestedFor}
                  />
                )}

                {resolved ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="mt-12 min-h-14 cursor-pointer rounded-full border border-white/15 px-8 text-base font-medium text-white/60 transition-colors duration-200 hover:border-white/35 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
                  >
                    Done
                  </button>
                ) : null}
              </section>
            ) : null}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function AvailabilityHeadline({
  availability,
  error,
  firstName,
}: {
  availability: Availability | null;
  error: string;
  firstName?: string;
}) {
  const who = firstName ?? "They";

  if (error || !availability) {
    return (
      <p className="rounded-2xl border border-white/12 bg-white/[0.05] px-6 py-4 text-base text-white/65">
        {error || "Pick a time that suits you."} You can still ask to meet now.
      </p>
    );
  }

  // Outside working days there are no slots to offer, and saying "busy for the
  // rest of today" would be plain wrong — the office simply isn't open.
  if (!availability.openToday) {
    return (
      <p className="rounded-2xl border border-white/12 bg-white/[0.05] px-6 py-4 text-base text-white/65">
        There are no bookable times today, but you can still ask to meet now.
      </p>
    );
  }

  if (availability.freeNow) {
    return (
      <p className="flex items-center gap-2 text-base text-emerald-300">
        <span aria-hidden className="size-2 rounded-full bg-emerald-400" />
        {who} is free right now.
      </p>
    );
  }

  const next = availability.slots.find((slot) => slot.available);

  return (
    <p className="flex items-center gap-2 text-base text-gold-200">
      <span aria-hidden className="size-2 rounded-full bg-gold-300" />
      {who} is busy right now
      {next
        ? ` — next free at ${formatTime(next.start)}`
        : " and has nothing free later today"}
      .
    </p>
  );
}

function StatusResult({
  status,
  staffName,
  note,
  postponedTo,
  requestedFor,
}: {
  status: string;
  staffName?: string;
  note?: string;
  postponedTo?: number | null;
  requestedFor?: number | null;
}) {
  const first = staffName?.split(" ")[0] ?? "They";

  const config: Record<
    string,
    { icon: React.ReactNode; ring: string; title: string; body: string }
  > = {
    approved: requestedFor
      ? {
          // A booked slot is a confirmation, not an invitation to walk up now.
          icon: <IconCheck className="size-10 text-emerald-300" />,
          ring: "bg-emerald-400/15",
          title: `Confirmed for ${formatTime(requestedFor)}`,
          body: `${first} will see you then. Please come back a few minutes before.`,
        }
      : {
          icon: <IconCheck className="size-10 text-emerald-300" />,
          ring: "bg-emerald-400/15",
          title: "You're expected — please go ahead",
          body: `${first} has accepted your request.`,
        },
    declined: {
      icon: <IconX className="size-10 text-maroon-200" />,
      ring: "bg-maroon-500/25",
      title: `${first} can't meet right now`,
      body: "Please speak to the front desk — they'll help you from here.",
    },
    postponed: {
      icon: <IconCalendarTime className="size-10 text-gold-300" />,
      ring: "bg-gold-300/15",
      title: `${first} has suggested a later time`,
      body: postponedTo
        ? `Please come back at ${formatTime(postponedTo)}.`
        : "Please check with the front desk for a new time.",
    },
  };

  const view = config[status] ?? config.declined;

  return (
    <>
      <span
        aria-hidden
        className={`flex size-24 items-center justify-center rounded-full ${view.ring}`}
      >
        {view.icon}
      </span>

      <h2
        role="status"
        aria-live="polite"
        className="mt-10 max-w-3xl font-serif text-4xl leading-tight tracking-tight text-white sm:text-5xl"
      >
        {view.title}
      </h2>

      <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/55">
        {view.body}
      </p>

      {note ? (
        <p className="mt-8 max-w-xl rounded-3xl border border-white/12 bg-white/[0.06] px-8 py-5 text-lg leading-relaxed text-white">
          &ldquo;{note}&rdquo;
        </p>
      ) : null}
    </>
  );
}

function ReviewRow({
  label,
  value,
  span,
}: {
  label: string;
  value?: string;
  span?: boolean;
}) {
  return (
    <div
      className={`bg-brand-deep px-7 py-5 ${span ? "sm:col-span-2" : ""}`}
    >
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </dt>
      <dd className="mt-2 text-lg leading-snug text-white break-words">
        {value || "—"}
      </dd>
    </div>
  );
}

function KioskField({
  id,
  label,
  value,
  onChange,
  error,
  required,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  type?: string;
  inputMode?: "tel" | "email" | "text";
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-3 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45"
      >
        {label}
        {required ? <span className="ml-1 text-gold-300">*</span> : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`min-h-16 w-full rounded-2xl border bg-white/[0.06] px-6 text-lg text-white outline-none transition-colors duration-200 placeholder:text-white/30 focus:bg-white/10 ${
          error
            ? "border-red-400/60 focus:border-red-400"
            : "border-white/15 focus:border-gold-300/70"
        }`}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function BackButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-16 cursor-pointer items-center gap-2 rounded-full border border-white/15 px-8 text-base font-medium text-white/65 transition-colors duration-200 hover:border-white/35 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <IconArrowLeft className="size-5" />
      Back
    </button>
  );
}

function NextButton({
  label,
  onClick,
  disabled,
  loading,
  type = "button",
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="group flex min-h-16 flex-1 cursor-pointer items-center justify-center gap-3 rounded-full bg-gold-300 px-10 text-lg font-semibold text-brand-deep shadow-xl shadow-gold-300/15 transition-all duration-200 hover:bg-gold-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/35 disabled:shadow-none"
    >
      {loading ? (
        <span
          aria-hidden
          className="size-5 animate-spin rounded-full border-2 border-brand-deep/30 border-t-brand-deep"
        />
      ) : null}
      {label}
      {!loading ? (
        <IconArrowRight className="size-5 transition-transform duration-200 group-hover:translate-x-1 group-disabled:translate-x-0" />
      ) : null}
    </button>
  );
}
