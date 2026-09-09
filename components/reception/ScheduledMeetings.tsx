"use client";

import { useMemo, useState } from "react";
import { useOfficeMeetings } from "@/src/hooks/useOfficeMeetings";
import { useStaff } from "@/src/hooks/useStaff";
import {
  useVisitorRequests,
  type VisitorStatus,
} from "@/src/hooks/useVisitorRequests";
import { usePagination } from "@/src/hooks/usePagination";
import TablePagination from "@/components/TablePagination";
import type { OfficeMeeting } from "@/src/lib/data";

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

type RowStatus = VisitorStatus | "scheduled" | "now";
type StatusFilter = "all" | "scheduled" | "postponed" | "declined";

const STATUS_STYLES: Record<RowStatus, string> = {
  pending: "bg-amber-50 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300",
  approved: "bg-green-50 dark:bg-green-400/15 text-green-700 dark:text-green-300",
  declined: "bg-red-50 dark:bg-red-400/15 text-red-600 dark:text-red-300",
  postponed: "bg-navy-500/10 dark:bg-white/10 text-navy-500 dark:text-white",
  scheduled: "bg-navy-500/8 dark:bg-white/10 text-navy-500 dark:text-white/70",
  now: "bg-green-50 dark:bg-green-400/15 text-green-600 dark:text-green-300",
};

const STATUS_LABELS: Record<RowStatus, string> = {
  pending: "Waiting",
  approved: "Approved",
  declined: "Declined",
  postponed: "Postponed",
  scheduled: "Scheduled",
  now: "Now",
};

interface ReceptionRow {
  id: string;
  when: number;
  visitor: string;
  host: string;
  title: string;
  company?: string;
  status: RowStatus;
  note?: string;
  postponedTo?: number | null;
}

function visitorFromMeeting(meeting: OfficeMeeting) {
  const named = meeting.clientName?.trim();
  if (named) return named;

  if (meeting.isVisit) {
    return (
      meeting.title.replace(/^Visitor:\s*/i, "").replace(/\s*\(.*\)\s*$/, "") ||
      "Visitor"
    );
  }

  return "—";
}

function whenLabel(ms: number, now: number) {
  const start = new Date(ms);
  const today = new Date(now);
  const isToday =
    start.getFullYear() === today.getFullYear() &&
    start.getMonth() === today.getMonth() &&
    start.getDate() === today.getDate();

  if (isToday) return `Today, ${timeFmt.format(start)}`;
  return dateTimeFmt.format(start);
}

export default function ScheduledMeetings() {
  const { upcoming, loading: meetingsLoading, error: meetingsError, now } =
    useOfficeMeetings();
  const { requests, loading: requestsLoading, error: requestsError } =
    useVisitorRequests();
  const { staff } = useStaff();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const loading = meetingsLoading || requestsLoading;

  const staffNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const member of staff) {
      names.set(member.id, member.name?.trim() || "Unnamed");
    }
    return names;
  }, [staff]);

  const rows = useMemo(() => {
    const linkedEventIds = new Set(
      requests
        .map((request) => request.calendarEventId)
        .filter((id): id is string => Boolean(id))
    );

    const fromVisits: ReceptionRow[] = requests.map((request) => {
      const status = (request.status ?? "pending") as VisitorStatus;
      const when =
        status === "postponed"
          ? request.postponedTo ?? request.respondedAt ?? request.createdAt ?? 0
          : status === "declined"
            ? request.respondedAt ?? request.createdAt ?? 0
            : request.requestedFor ?? request.createdAt ?? 0;

      return {
        id: `visit-${request.id}`,
        when,
        visitor: request.visitorName?.trim() || "Visitor",
        host: request.staffName?.trim() || "Unknown",
        title: request.purpose?.trim() || "Visit",
        company: request.company,
        status,
        note: request.responseNote,
        postponedTo: request.postponedTo,
      };
    });

    const fromCalendar: ReceptionRow[] = upcoming
      .filter((meeting) => !meeting.isVisit && !linkedEventIds.has(meeting.id))
      .map((meeting) => {
        const inProgress = meeting.start <= now && meeting.end > now;

        return {
          id: `cal-${meeting.staffId}-${meeting.id}`,
          when: meeting.start,
          visitor: visitorFromMeeting(meeting),
          host: staffNames.get(meeting.staffId) ?? "Unknown",
          title: meeting.title || "Untitled",
          company: meeting.clientCompany,
          status: inProgress ? "now" : "scheduled",
        };
      });

    return [...fromVisits, ...fromCalendar].sort((a, b) => b.when - a.when);
  }, [requests, upcoming, now, staffNames]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return rows;
    if (statusFilter === "scheduled") {
      return rows.filter(
        (row) =>
          row.status === "scheduled" ||
          row.status === "approved" ||
          row.status === "now"
      );
    }
    return rows.filter((row) => row.status === statusFilter);
  }, [rows, statusFilter]);

  const {
    page: tablePage,
    setPage: setTablePage,
    pageSize: tablePageSize,
    setPageSize: setTablePageSize,
    total: tableTotal,
    totalPages: tableTotalPages,
    pageItems: tablePageItems,
  } = usePagination(filtered);

  const error = requestsError ?? meetingsError;

  return (
    <div className="max-w-7xl mx-auto px-4 pt-8 pb-16 space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy-500 dark:text-white">
            Scheduled meetings
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-white/50">
            Office-wide visits and meetings, including postponed and declined.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["scheduled", "Scheduled"],
            ["postponed", "Postponed"],
            ["declined", "Declined"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            aria-pressed={statusFilter === value}
            className={`min-h-11 cursor-pointer rounded-full border px-4 text-xs font-semibold transition-colors duration-200 ${
              statusFilter === value
                ? "border-navy-500 bg-navy-500 text-white"
                : "border-navy-500/20 text-navy-500 hover:bg-navy-500/6 dark:border-white/15 dark:text-white dark:hover:bg-white/6"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-400/15 dark:text-red-300"
        >
          Could not load the office calendar. Ask an admin to publish the
          latest database rules if this keeps happening.
        </p>
      ) : null}

      <section className="max-w-full overflow-hidden rounded-xl border border-navy-500/15 bg-white dark:border-white/10 dark:bg-surface-dark-card">
        <ul className="divide-y divide-navy-500 dark:divide-white/10 sm:hidden">
          {loading ? (
            <li className="px-4 py-6 text-center text-sm text-stone-500 dark:text-white/50">
              Loading meetings…
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-stone-500 dark:text-white/50">
              Nothing to show.
            </li>
          ) : (
            tablePageItems.map((row) => (
              <li key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-navy-500 dark:text-white">
                      {row.visitor}
                    </p>
                    <p className="mt-0.5 text-sm text-stone-500 dark:text-white/50">
                      {whenLabel(row.when, now)}
                      {row.status === "postponed" && row.postponedTo
                        ? ` · back ${timeFmt.format(new Date(row.postponedTo))}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[row.status]}`}
                  >
                    {STATUS_LABELS[row.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-navy-500 dark:text-white">
                  {row.host}
                  <span className="text-stone-500 dark:text-white/50">
                    {" "}
                    · {row.title}
                    {row.company ? ` · ${row.company}` : ""}
                  </span>
                </p>
                {row.note ? (
                  <p className="mt-2 text-xs text-stone-500 dark:text-white/50">
                    {row.note}
                  </p>
                ) : null}
              </li>
            ))
          )}
        </ul>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-190 table-auto text-left text-xs sm:text-sm">
            <thead className="border-b border-slate-800 bg-navy-500 text-sm uppercase text-white dark:border-white/10">
              <tr>
                <th className="px-4 py-2 font-medium whitespace-nowrap">When</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Visitor</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">With</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Meeting</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Status</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-500 dark:divide-white/10">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-stone-500 dark:text-white/50"
                  >
                    Loading meetings…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-stone-500 dark:text-white/50"
                  >
                    Nothing to show.
                  </td>
                </tr>
              ) : (
                tablePageItems.map((row) => (
                  <tr
                    key={row.id}
                    className="text-sm text-navy-500 dark:text-white"
                  >
                    <td className="whitespace-nowrap px-4 py-2">
                      {whenLabel(row.when, now)}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2">
                      {row.visitor}
                      {row.company ? (
                        <span className="block truncate text-xs text-stone-500 dark:text-white/50">
                          {row.company}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-stone-500 dark:text-white/50">
                      {row.host}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-stone-500 dark:text-white/50">
                      {row.title}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[row.status]}`}
                      >
                        {STATUS_LABELS[row.status]}
                      </span>
                      {row.status === "postponed" && row.postponedTo ? (
                        <span className="ml-2 text-xs text-stone-500 dark:text-white/50">
                          {timeFmt.format(new Date(row.postponedTo))}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-stone-500 dark:text-white/50">
                      {row.note || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 ? (
          <TablePagination
            page={tablePage}
            totalPages={tableTotalPages}
            pageSize={tablePageSize}
            totalItems={tableTotal}
            onPageChange={setTablePage}
            onPageSizeChange={setTablePageSize}
          />
        ) : null}
      </section>
    </div>
  );
}
