"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import {
  IconArrowRight,
  IconCalendarTime,
  IconCheck,
  IconClock,
  IconX,
} from "@tabler/icons-react";
import { useStaff, type Staff } from "@/src/hooks/useStaff";
import { HAS_FIREBASE_CONFIG } from "@/src/lib/firebase";
import SetupNotice from "@/components/SetupNotice";
import { useVisitorRequest } from "@/src/hooks/useVisitorRequest";
import { createVisitorRequest } from "@/src/lib/data";

const PURPOSES = [
  "Meeting",
  "Scheduled Appointment",
  "Interview",
  "Vendor / Supplier",
  "Delivery",
  "Loan / Scheme Enquiry",
  "Other",
] as const;

const PURPOSE_OPTIONS = PURPOSES.map((purpose) => ({ value: purpose, label: purpose }));

type Step = "welcome" | "form" | "status";

/** How long a half-filled form left on a lobby tablet sits before it resets. */
const IDLE_RESET_MS = 90_000;
/** How long a finished request stays on screen before the tablet returns home. */
const RESULT_RESET_MS = 25_000;

const initialForm = {
  visitorName: "",
  visitorPhone: "",
  visitorEmail: "",
  company: "",
  designation: "",
  address: "",
  purpose: "" as (typeof PURPOSES)[number] | "",
  purposeOther: "",
};

const NAME_RE = /^[\p{L}][\p{L}\s.'-]*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Strips anything that can't belong in a person's name as they type, rather
    than only complaining after the fact — a name never contains a digit. */
function sanitizeName(value: string) {
  return value.replace(/[^\p{L}\s.'-]/gu, "");
}

/** Keeps only digits and a single leading "+" — a phone number never
    contains a letter, so there is no reason to let one sit in the field. */
function sanitizePhone(value: string) {
  const stripped = value.replace(/[^\d+]/g, "");
  return stripped.replace(/(?!^)\+/g, "");
}

/** A phone number here is either a 10-digit local number or a 12-digit one
    with the country code included (with or without a leading "+"). */
function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 12;
}

function formatTime(ms?: number | null) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function CheckInFlow({
  presetStaffId,
}: {
  /** When set, the visitor is checking in via a specific staff member's own
      link — that person is fixed and the "who are you here to meet" step
      never shows. */
  presetStaffId?: string;
}) {
  const { activeStaff, staff, loading: staffLoading, error: staffLoadError } =
    useStaff();
  const reduceMotion = useReducedMotion();

  const presetStaff = useMemo(
    () => (presetStaffId ? staff.find((member) => member.id === presetStaffId) : null),
    [staff, presetStaffId]
  );
  const presetStaffInvalid =
    Boolean(presetStaffId) &&
    !staffLoading &&
    (!presetStaff || presetStaff.active === false);

  const [step, setStep] = useState<Step>("welcome");
  const [form, setForm] = useState(initialForm);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [purposeError, setPurposeError] = useState("");
  const [staffError, setStaffError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  const { request } = useVisitorRequest(requestId);
  const status = request?.status ?? "pending";
  const resolved = Boolean(requestId) && status !== "pending";

  const meetingStaff = presetStaffId ? presetStaff ?? null : selectedStaff;

  const reset = useCallback(() => {
    setStep("welcome");
    setForm(initialForm);
    setSelectedStaff(null);
    setFieldErrors({});
    setPurposeError("");
    setStaffError("");
    setSubmitError("");
    setRequestId(null);
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

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
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

  const staffOptions = useMemo(
    () =>
      [...activeStaff]
        .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
        .map((member) => ({
          value: member.id,
          label: [member.name, member.designation || member.department]
            .filter(Boolean)
            .join(" — "),
        })),
    [activeStaff]
  );

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

    const name = form.visitorName.trim();
    if (!name) {
      errors.visitorName = "Please enter your name.";
    } else if (!NAME_RE.test(name)) {
      errors.visitorName = "Name can only contain letters.";
    }

    const phone = form.visitorPhone.trim();
    if (!phone) {
      errors.visitorPhone = "Please enter a phone number.";
    } else if (!isValidPhone(phone)) {
      errors.visitorPhone = "Enter a 10-digit number, or 12 digits with the country code.";
    }

    const email = form.visitorEmail.trim();
    if (!email) {
      errors.visitorEmail = "Please enter an email address.";
    } else if (!EMAIL_RE.test(email)) {
      errors.visitorEmail = "Enter a valid email, such as name@company.com.";
    }

    if (!form.company.trim()) {
      errors.company = "Please enter your company name.";
    }

    if (!form.designation.trim()) {
      errors.designation = "Please enter your designation.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const detailsOk = validateDetails();

    const isOther = form.purpose === "Other";
    const hasPurpose = Boolean(form.purpose) && (!isOther || Boolean(form.purposeOther.trim()));
    setPurposeError(
      !form.purpose
        ? "Please choose a purpose."
        : isOther && !form.purposeOther.trim()
          ? "Please tell us what brings you in."
          : ""
    );

    const target = presetStaff ?? selectedStaff;
    const hasStaff = presetStaffId ? Boolean(presetStaff) : Boolean(selectedStaff);
    setStaffError(hasStaff ? "" : "Please choose who you're here to meet.");

    if (!detailsOk || !hasPurpose || !hasStaff || !target) return;

    setSubmitError("");
    setSubmitting(true);

    // The server's purpose allowlist has no room for free text, so a custom
    // "Other" reason travels in the note instead of being silently dropped.
    const purposeNote = isOther ? form.purposeOther.trim() : "";

    try {
      const id = await createVisitorRequest({
        staffId: target.id,
        visitorName: form.visitorName.trim(),
        visitorPhone: form.visitorPhone.trim(),
        visitorEmail: form.visitorEmail.trim(),
        company: form.company.trim(),
        designation: form.designation.trim(),
        address: form.address.trim(),
        purpose: form.purpose || "Other",
        purposeNote,
      });

      setSelectedStaff(target);
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

  const selectStaffById = (id: string) => {
    setSelectedStaff(activeStaff.find((member) => member.id === id) ?? null);
    setStaffError("");
  };

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

  if (!HAS_FIREBASE_CONFIG) return <SetupNotice tone="dark" />;

  if (presetStaffInvalid) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-deep px-6 text-center text-white">
        <h1 className="font-serif text-4xl tracking-tight">This link isn&rsquo;t valid</h1>
        <p className="mt-4 max-w-md text-lg text-white/60">
          Please check the link you were given, or speak to the front desk.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-brand-deep text-white">
      {/* Ambient brand wash — static, so nothing animates behind text all day.
          Clipping lives on this layer, not the page: overflow-hidden on the
          root cut off anything taller than the viewport. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
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

        {step === "form" ? (
          <div className="px-5 sm:px-8 lg:px-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              Check-in
            </p>
          </div>
        ) : null}

        <main className="flex flex-1 flex-col px-5 py-4 sm:px-8 sm:py-6 lg:px-12">
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
                  {presetStaff
                    ? `Let ${presetStaff.name?.split(" ")[0] ?? "them"} know you've arrived. It takes under a minute.`
                    : "Let the person you're here to meet know you've arrived. It takes under a minute."}
                </p>

                <button
                  type="button"
                  onClick={() => setStep("form")}
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

            {/* ------------------------------------------------------- FORM */}
            {step === "form" ? (
              <form
                className="flex flex-1 flex-col"
                onSubmit={handleSubmit}
              >
                {/* ---- your details + scan ---- */}
                <section>
                  <h2 className="font-serif text-2xl tracking-tight text-white sm:text-3xl">
                    Your details
                  </h2>
                  {presetStaff ? (
                    <p className="mt-2 text-sm text-white/50">
                      Checking in to meet{" "}
                      <span className="font-medium text-gold-300">{presetStaff.name}</span>
                    </p>
                  ) : null}

                  <div className="mt-5">
                    <div className="grid content-start gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      <KioskField
                        id="visitorName"
                        label="Name"
                        required
                        value={form.visitorName}
                        onChange={(value) => setField("visitorName", sanitizeName(value))}
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
                        onChange={(value) => setField("visitorPhone", sanitizePhone(value))}
                        error={fieldErrors.visitorPhone}
                        maxLength={13}
                        autoComplete="tel"
                        placeholder="+91 98765 43210"
                      />
                      <KioskField
                        id="visitorEmail"
                        label="Email"
                        required
                        type="email"
                        inputMode="email"
                        value={form.visitorEmail}
                        onChange={(value) => setField("visitorEmail", value)}
                        error={fieldErrors.visitorEmail}
                        autoComplete="email"
                        placeholder="you@company.com"
                      />
                      <KioskField
                        id="company"
                        label="Company name"
                        required
                        value={form.company}
                        onChange={(value) => setField("company", value)}
                        error={fieldErrors.company}
                        autoComplete="organization"
                        placeholder="Company"
                      />
                      <KioskField
                        id="designation"
                        label="Designation"
                        required
                        value={form.designation}
                        onChange={(value) => setField("designation", value)}
                        error={fieldErrors.designation}
                        autoComplete="organization-title"
                        placeholder="Job title"
                      />
                      <KioskField
                        id="purpose"
                        label="Purpose of visit"
                        required
                        value={form.purpose}
                        onChange={(value) => {
                          setField("purpose", value as (typeof PURPOSES)[number]);
                          setPurposeError("");
                        }}
                        error={form.purpose === "Other" ? undefined : purposeError}
                        placeholder="Select a purpose"
                        options={PURPOSE_OPTIONS}
                      />
                      {form.purpose === "Other" ? (
                        <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
                          <KioskField
                            id="purposeOther"
                            label="Please specify"
                            required
                            value={form.purposeOther}
                            onChange={(value) => {
                              setField("purposeOther", value);
                              setPurposeError("");
                            }}
                            error={purposeError}
                            placeholder="Tell us what brings you in"
                          />
                        </div>
                      ) : null}
                      {!presetStaffId ? (
                        <KioskField
                          id="meetingStaff"
                          label="Who are you here to meet?"
                          required
                          value={selectedStaff?.id ?? ""}
                          onChange={(value) => selectStaffById(value)}
                          error={staffError}
                          placeholder={
                            staffLoading
                              ? "Loading staff…"
                              : staffLoadError
                                ? "Couldn't load the staff list"
                                : "Select who you're here to see"
                          }
                          options={staffOptions}
                        />
                      ) : null}
                      <KioskField
                        id="address"
                        label="Address"
                        value={form.address}
                        onChange={(value) => setField("address", value)}
                        autoComplete="street-address"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </section>

                {/* ---- submit ---- */}
                <section className="mt-6 border-t border-white/10 pt-6 pb-2">
                  {submitError ? (
                    <p
                      role="alert"
                      className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-6 py-4 text-base text-red-200"
                    >
                      {submitError}
                    </p>
                  ) : null}

                  <div className="flex justify-center">
                    <NextButton
                      type="submit"
                      label={submitting ? "Sending…" : "Send request"}
                      disabled={submitting}
                      loading={submitting}
                    />
                  </div>
                </section>
              </form>
            ) : null}

            {/* ----------------------------------------------------- STATUS */}
            {step === "status" ? (
              <section className="flex flex-1 flex-col items-center justify-center text-center">
                {status === "pending" ? (
                  <>
                    <span aria-hidden className="relative flex size-28 items-center justify-center">
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
                      We&rsquo;ve let {meetingStaff?.name ?? "them"} know
                    </h2>
                    <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/55">
                      Please take a seat. This screen will update the moment they respond.
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
                    staffName={meetingStaff?.name}
                    note={request?.responseNote}
                    postponedTo={request?.postponedTo}
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

function StatusResult({
  status,
  staffName,
  note,
  postponedTo,
}: {
  status: string;
  staffName?: string;
  note?: string;
  postponedTo?: number | null;
}) {
  const first = staffName?.split(" ")[0] ?? "They";

  const config: Record<
    string,
    { icon: React.ReactNode; ring: string; title: string; body: string }
  > = {
    approved: {
      icon: <IconCheck className="size-10 text-emerald-300" />,
      ring: "bg-emerald-400/15",
      title: "You're expected. Please go ahead.",
      body: `${first} has accepted your request.`,
    },
    declined: {
      icon: <IconX className="size-10 text-maroon-200" />,
      ring: "bg-maroon-500/25",
      title: `${first} can't meet right now`,
      body: "Please speak to the front desk. They'll help you from here.",
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

      <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/55">{view.body}</p>

      {note ? (
        <p className="mt-8 max-w-xl rounded-3xl border border-white/12 bg-white/[0.06] px-8 py-5 text-lg leading-relaxed text-white">
          &ldquo;{note}&rdquo;
        </p>
      ) : null}
    </>
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
  maxLength,
  options,
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
  maxLength?: number;
  /** When set, renders a dropdown of these choices instead of a text input. */
  options?: readonly { value: string; label: string }[];
}) {
  const fieldClassName = `min-h-13 w-full rounded-2xl border bg-white/[0.06] px-5 text-base text-white outline-none transition-colors duration-200 placeholder:text-white/30 focus:bg-white/10 ${
    error ? "border-red-400/60 focus:border-red-400" : "border-white/15 focus:border-gold-300/70"
  }`;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-white/45"
      >
        {label}
        {required ? <span className="ml-1 text-gold-300">*</span> : null}
      </label>
      {options ? (
        <select
          id={id}
          name={id}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldClassName} cursor-pointer appearance-none bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%23D9B872%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.6%22%20d%3D%22m5%207.5%205%205%205-5%22%2F%3E%3C%2Fsvg%3E')] bg-[length:20px] bg-[right_1.25rem_center] bg-no-repeat pr-14`}
        >
          <option value="" disabled className="text-stone-500">
            {placeholder ?? "Select an option"}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-brand-deep text-white">
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          placeholder={placeholder}
          maxLength={maxLength}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClassName}
        />
      )}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
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
      className="group flex min-h-16 cursor-pointer items-center gap-3 rounded-full bg-gold-300 px-12 text-lg font-semibold text-brand-deep shadow-xl shadow-gold-300/15 transition-all duration-200 hover:bg-gold-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/35 disabled:shadow-none"
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
