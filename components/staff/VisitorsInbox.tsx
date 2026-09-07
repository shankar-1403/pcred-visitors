"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconBuilding,
  IconCalendarTime,
  IconCheck,
  IconClock,
  IconPhone,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { respondToRequest } from "@/src/lib/data";
import { useAuth } from "@/src/context/AuthContext";
import {
  useVisitorRequests,
  type VisitorRequest,
  type VisitorStatus,
} from "@/src/hooks/useVisitorRequests";
import { usePagination } from "@/src/hooks/usePagination";
import TablePagination from "@/components/TablePagination";

type Decision = "approved" | "declined" | "postponed";

const STATUS_STYLES: Record<VisitorStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  declined: "bg-red-50 text-red-600",
  postponed: "bg-navy-500/10 text-navy-500",
};

const STATUS_LABELS: Record<VisitorStatus, string> = {
  pending: "Waiting",
  approved: "Approved",
  declined: "Declined",
  postponed: "Postponed",
};

function formatDateTime(ms?: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTime(ms?: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "2026-09-09T14:30" in the viewer's own local time — what a datetime-local
    input's value and min/max attributes require, built from local field
    getters rather than toISOString() so it never drifts to UTC. */
function toDateTimeLocal(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "4m 12s" — how long the visitor has been standing at the door. */
function useWaitingLabel(since?: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!since) return "";

  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const minutes = Math.floor(seconds / 60);

  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export default function VisitorsInbox() {
  const { user, profile } = useAuth();
  const { requests, loading } = useVisitorRequests();

  const [statusFilter, setStatusFilter] = useState<VisitorStatus | "all">("all");
  const [respondingTo, setRespondingTo] = useState<VisitorRequest | null>(null);
  const [decision, setDecision] = useState<Decision>("approved");
  const [note, setNote] = useState("");
  const [postponeMinutes, setPostponeMinutes] = useState(15);
  /** null while a quick pick (15/30/60/120 min) is in effect; a real date once
      the admin switches to picking an exact moment instead. */
  const [postponeCustom, setPostponeCustom] = useState<string>("");
  const [postponeCustomError, setPostponeCustomError] = useState("");
  const [respondingSince, setRespondingSince] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const scoped = requests;

  const pendingCards = useMemo(
    () => scoped.filter((request) => (request.status ?? "pending") === "pending"),
    [scoped]
  );

  const history = useMemo(() => {
    if (statusFilter === "all") return scoped;
    return scoped.filter(
      (request) => (request.status ?? "pending") === statusFilter
    );
  }, [scoped, statusFilter]);

  const {
    page: tablePage,
    setPage: setTablePage,
    pageSize: tablePageSize,
    setPageSize: setTablePageSize,
    total: tableTotal,
    totalPages: tableTotalPages,
    pageItems: tablePageItems,
  } = usePagination(history);

  const openResponder = (request: VisitorRequest, initial: Decision) => {
    setRespondingTo(request);
    setDecision(initial);
    setNote("");
    setPostponeMinutes(15);
    setPostponeCustom("");
    setPostponeCustomError("");
    setRespondingSince(Date.now());
    setError("");
  };

  async function handleRespond() {
    if (!respondingTo || !user) return;

    if (decision === "declined" && !note.trim()) {
      setError("Please give a reason — the visitor sees this at the door.");
      return;
    }

    if (decision === "postponed" && postponeCustom && postponeCustomError) {
      setError(postponeCustomError);
      return;
    }

    setSaving(true);
    setError("");

    const postponedTo =
      decision === "postponed"
        ? postponeCustom
          ? new Date(postponeCustom).getTime()
          : Date.now() + postponeMinutes * 60 * 1000
        : null;

    try {
      await respondToRequest(respondingTo.id, {
        status: decision,
        responseNote: note.trim().slice(0, 500),
        postponedTo,
        respondedAt: Date.now(),
        respondedBy: user.uid,
        respondedByName:
          profile?.displayName ?? user.displayName ?? user.email ?? "Reception",
      });

      setRespondingTo(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not send your response. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pt-20 pb-16 space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy-500">
            Visitors at the door
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Visitors here to see you. Your answer appears on their screen
            immediately.
          </p>
        </div>

      </section>

      {/* -------------------------------------------------- pending strip */}
      <section aria-label="Waiting visitors">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((key) => (
              <div
                key={key}
                className="h-52 animate-pulse rounded-3xl border border-navy-500/10 bg-navy-500/[0.04]"
              />
            ))}
          </div>
        ) : pendingCards.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-navy-500/20 bg-white px-6 py-12 text-center">
            <IconCheck className="mx-auto size-8 text-navy-500/30" />
            <p className="mt-3 text-sm font-medium text-navy-500">
              Nobody is waiting right now.
            </p>
            <p className="mt-1 text-sm text-stone-500">
              New check-ins appear here the moment they&rsquo;re submitted.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {pendingCards.map((request) => (
                <PendingCard
                  key={request.id}
                  request={request}
                  unassigned={!request.staffEmail}
                  onRespond={openResponder}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- responder */}
      <AnimatePresence>
        {respondingTo ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setRespondingTo(null)}
              className="absolute inset-0 cursor-pointer bg-navy-500/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.25 }}
              role="dialog"
              aria-modal="true"
              aria-label="Respond to visitor"
              className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-4xl bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-navy-500">
                    {respondingTo.visitorName}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {respondingTo.purpose}
                    {respondingTo.company ? ` · ${respondingTo.company}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRespondingTo(null)}
                  aria-label="Close"
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-navy-500/15 text-navy-500 transition-colors hover:bg-navy-500/10"
                >
                  <IconX className="size-5" />
                </button>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2">
                {(
                  [
                    ["approved", "Approve"],
                    ["postponed", "Postpone"],
                    ["declined", "Decline"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setDecision(value);
                      setError("");
                    }}
                    aria-pressed={decision === value}
                    className={`min-h-12 cursor-pointer rounded-xl border text-sm font-semibold transition-colors duration-200 ${
                      decision === value
                        ? value === "approved"
                          ? "border-green-600 bg-green-600 text-white"
                          : value === "declined"
                            ? "border-maroon-500 bg-maroon-500 text-white"
                            : "border-navy-500 bg-navy-500 text-white"
                        : "border-navy-500/20 bg-white text-navy-500 hover:bg-navy-500/6"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {decision === "postponed" ? (
                <fieldset className="mt-5">
                  <legend className="mb-2 block text-sm font-medium text-navy-500">
                    Ask them to come back
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {[15, 30, 60, 120].map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() => {
                          setPostponeMinutes(minutes);
                          setPostponeCustom("");
                          setPostponeCustomError("");
                        }}
                        aria-pressed={!postponeCustom && postponeMinutes === minutes}
                        className={`min-h-11 cursor-pointer rounded-xl border px-4 text-sm font-medium transition-colors duration-200 ${
                          !postponeCustom && postponeMinutes === minutes
                            ? "border-navy-500 bg-navy-500 text-white"
                            : "border-navy-500/20 text-navy-500 hover:bg-navy-500/6"
                        }`}
                      >
                        {minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3">
                    <label
                      htmlFor="postponeCustom"
                      className="mb-1.5 block text-xs font-medium text-stone-600"
                    >
                      Or pick an exact date and time
                    </label>
                    <input
                      id="postponeCustom"
                      type="datetime-local"
                      value={postponeCustom}
                      min={toDateTimeLocal(respondingSince + 5 * 60_000)}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPostponeCustom(value);

                        if (!value) {
                          setPostponeCustomError("");
                          return;
                        }

                        const picked = new Date(value).getTime();

                        setPostponeCustomError(
                          Number.isFinite(picked) && picked > Date.now()
                            ? ""
                            : "Please pick a time in the future."
                        );
                      }}
                      className="min-h-11 w-full max-w-xs rounded-xl border border-navy-500/20 px-3 text-sm text-navy-500 outline-none focus:border-navy-500 sm:w-auto"
                    />
                  </div>

                  {postponeCustomError ? (
                    <p role="alert" className="mt-2 text-sm text-red-600">
                      {postponeCustomError}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-stone-500">
                      The tablet will show{" "}
                      {postponeCustom
                        ? formatDateTime(new Date(postponeCustom).getTime())
                        : formatTime(respondingSince + postponeMinutes * 60 * 1000)}
                      .
                    </p>
                  )}
                </fieldset>
              ) : null}

              <div className="mt-5">
                <label
                  htmlFor="responseNote"
                  className="mb-2 block text-sm font-medium text-navy-500"
                >
                  {decision === "declined"
                    ? "Reason (shown to the visitor) *"
                    : "Message for the visitor"}
                </label>
                <textarea
                  id="responseNote"
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    decision === "approved"
                      ? "e.g. Please come up to the 3rd floor"
                      : decision === "postponed"
                        ? "e.g. Finishing a call, sorry for the wait"
                        : "e.g. In meetings all day — please email me instead"
                  }
                  className="w-full resize-none rounded-2xl border border-navy-500/20 px-4 py-3 text-sm text-navy-500 outline-none transition-colors focus:border-navy-500"
                />
              </div>

              {error ? (
                <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={handleRespond}
                disabled={saving}
                className="mt-6 min-h-12 w-full cursor-pointer rounded-2xl bg-navy-500 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Sending…" : "Send response to the tablet"}
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ----------------------------------------------------- visit log */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-navy-500">Visit log</h2>

          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "approved", "postponed", "declined"] as const).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  aria-pressed={statusFilter === value}
                  className={`min-h-11 cursor-pointer rounded-full border px-4 text-xs font-semibold capitalize transition-colors duration-200 ${
                    statusFilter === value
                      ? "border-navy-500 bg-navy-500 text-white"
                      : "border-navy-500/20 text-navy-500 hover:bg-navy-500/6"
                  }`}
                >
                  {value === "all" ? "All" : STATUS_LABELS[value]}
                </button>
              )
            )}
          </div>
        </div>

        <div className="max-w-full overflow-hidden rounded-xl border border-navy-500/15 bg-white">
          {/* Cards on phones — a seven-column log is unreadable at 375px. */}
          <ul className="divide-y divide-navy-500/10 sm:hidden">
            {loading ? (
              <li className="px-4 py-6 text-center text-sm text-stone-500">
                Loading visits…
              </li>
            ) : history.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-stone-500">
                No visits to show.
              </li>
            ) : (
              tablePageItems.map((request) => {
                const status = (request.status ?? "pending") as VisitorStatus;

                return (
                  <li key={request.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-navy-500">
                          {request.visitorName}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-stone-500">
                          {request.purpose}
                          {request.company ? ` · ${request.company}` : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
                      >
                        {STATUS_LABELS[status]}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-stone-500">
                      {formatDateTime(request.createdAt)}
                      {request.requestedFor
                        ? ` · asked for ${formatTime(request.requestedFor)}`
                        : ""}
                    </p>
                  </li>
                );
              })
            )}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-190 table-auto text-left text-sm">
              <thead className="border-b border-slate-800 bg-navy-500 text-sm uppercase text-white">
                <tr>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Visitor</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">To meet</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Purpose</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Arrived</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Asked for</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Status</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Answered by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-500">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-stone-500">
                      Loading visits…
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-stone-500">
                      No visits to show.
                    </td>
                  </tr>
                ) : (
                  tablePageItems.map((request) => {
                    const status = (request.status ?? "pending") as VisitorStatus;

                    return (
                      <tr key={request.id} className="text-sm text-navy-500">
                        <td className="px-4 py-2">
                          <span className="block max-w-50 truncate font-medium">
                            {request.visitorName}
                          </span>
                          <span className="block text-xs text-stone-500">
                            {request.visitorPhone}
                            {request.company ? ` · ${request.company}` : ""}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-stone-500">
                          {request.staffName || "—"}
                        </td>
                        <td className="px-4 py-2 text-stone-500">
                          {request.purpose || "—"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-stone-500">
                          {formatDateTime(request.createdAt)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-stone-500">
                          {request.requestedFor
                            ? formatTime(request.requestedFor)
                            : "Now"}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
                          >
                            {STATUS_LABELS[status]}
                          </span>
                          {status === "postponed" && request.postponedTo ? (
                            <span className="ml-2 text-xs text-stone-500">
                              {formatTime(request.postponedTo)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-stone-500">
                          {request.respondedByName || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && (
            <TablePagination
              page={tablePage}
              totalPages={tableTotalPages}
              pageSize={tablePageSize}
              totalItems={tableTotal}
              onPageChange={setTablePage}
              onPageSizeChange={setTablePageSize}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function PendingCard({
  request,
  unassigned,
  onRespond,
}: {
  request: VisitorRequest;
  unassigned: boolean;
  onRespond: (request: VisitorRequest, decision: Decision) => void;
}) {
  const waiting = useWaitingLabel(request.createdAt);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      className="rounded-3xl border border-amber-300/60 bg-white p-6 shadow-lg shadow-navy-500/5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-navy-500">
            {request.visitorName}
          </h3>
          <p className="mt-1 text-sm text-stone-500">
            here to meet{" "}
            <span className="font-medium text-navy-500">
              {request.staffName}
            </span>
          </p>
        </div>

        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold tabular-nums text-amber-700">
          <IconClock className="size-3.5" />
          {waiting}
        </span>
      </div>

      {request.requestedFor ? (
        <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-navy-500/10 px-3 py-1.5 text-sm font-semibold text-navy-500">
          <IconCalendarTime className="size-4" />
          Asking for {formatTime(request.requestedFor)}
        </p>
      ) : (
        <p className="mt-3 text-sm font-medium text-amber-700">
          Waiting at the door now
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-700">
        <span className="flex items-center gap-1.5">
          <IconCalendarTime className="size-4 text-stone-500" />
          {request.purpose}
        </span>
        <span className="flex items-center gap-1.5">
          <IconPhone className="size-4 text-stone-500" />
          {request.visitorPhone}
        </span>
        {request.company ? (
          <span className="flex items-center gap-1.5">
            <IconBuilding className="size-4 text-stone-500" />
            {request.company}
          </span>
        ) : null}
        {(request.partySize ?? 1) > 1 ? (
          <span className="flex items-center gap-1.5">
            <IconUsers className="size-4 text-stone-500" />
            {request.partySize} people
          </span>
        ) : null}
      </div>

      {request.purposeNote ? (
        <p className="mt-4 rounded-2xl bg-navy-500/[0.05] px-4 py-3 text-sm leading-relaxed text-navy-500">
          &ldquo;{request.purposeNote}&rdquo;
        </p>
      ) : null}

      {unassigned ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          {request.staffName} has no login — respond on their behalf.
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onRespond(request, "approved")}
          className="min-h-12 cursor-pointer rounded-xl bg-green-600 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => onRespond(request, "postponed")}
          className="min-h-12 cursor-pointer rounded-xl border border-navy-500/25 text-sm font-semibold text-navy-500 transition-colors hover:bg-navy-500/8"
        >
          Postpone
        </button>
        <button
          type="button"
          onClick={() => onRespond(request, "declined")}
          className="min-h-12 cursor-pointer rounded-xl border border-maroon-500/30 text-sm font-semibold text-maroon-500 transition-colors hover:bg-maroon-500/8"
        >
          Decline
        </button>
      </div>
    </motion.article>
  );
}
