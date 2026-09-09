"use client";

import { useMemo } from "react";
import { useOfficeMeetings } from "@/src/hooks/useOfficeMeetings";
import { useStaff } from "@/src/hooks/useStaff";
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

function visitorLabel(meeting: OfficeMeeting) {
  const named = meeting.clientName?.trim();
  if (named) return named;

  if (meeting.isVisit) {
    return meeting.title.replace(/^Visitor:\s*/i, "").replace(/\s*\(.*\)\s*$/, "") || "Visitor";
  }

  return "—";
}

function whenLabel(meeting: OfficeMeeting, now: number) {
  const start = new Date(meeting.start);
  const today = new Date(now);
  const isToday =
    start.getFullYear() === today.getFullYear() &&
    start.getMonth() === today.getMonth() &&
    start.getDate() === today.getDate();

  if (isToday) return `Today, ${timeFmt.format(start)}`;
  return dateTimeFmt.format(start);
}

export default function ScheduledMeetings() {
  const { upcoming, loading, error, now } = useOfficeMeetings();
  const { staff } = useStaff();

  const staffNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const member of staff) {
      names.set(member.id, member.name?.trim() || "Unnamed");
    }
    return names;
  }, [staff]);

  const {
    page: tablePage,
    setPage: setTablePage,
    pageSize: tablePageSize,
    setPageSize: setTablePageSize,
    total: tableTotal,
    totalPages: tableTotalPages,
    pageItems: tablePageItems,
  } = usePagination(upcoming);

  return (
    <div className="max-w-7xl mx-auto px-4 pt-8 pb-16 space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy-500 dark:text-white">
            Scheduled meetings
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-white/50">
            Upcoming meetings across the office, soonest first.
          </p>
        </div>
      </section>

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
          ) : upcoming.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-stone-500 dark:text-white/50">
              No upcoming meetings scheduled.
            </li>
          ) : (
            tablePageItems.map((meeting) => {
              const inProgress =
                meeting.start <= now && meeting.end > now;

              return (
                <li key={`${meeting.staffId}-${meeting.id}`} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy-500 dark:text-white">
                        {meeting.title || "Untitled"}
                      </p>
                      <p className="mt-0.5 text-sm text-stone-500 dark:text-white/50">
                        {whenLabel(meeting, now)}
                      </p>
                    </div>
                    {inProgress ? (
                      <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-400/15 dark:text-green-300">
                        Now
                      </span>
                    ) : meeting.isVisit ? (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                        Visit
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-navy-500 dark:text-white">
                    {staffNames.get(meeting.staffId) ?? "Unknown host"}
                    <span className="text-stone-500 dark:text-white/50">
                      {" "}
                      · {visitorLabel(meeting)}
                    </span>
                  </p>
                </li>
              );
            })
          )}
        </ul>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-190 table-auto text-left text-xs sm:text-sm">
            <thead className="border-b border-slate-800 bg-navy-500 text-sm uppercase text-white dark:border-white/10">
              <tr>
                <th className="px-4 py-2 font-medium whitespace-nowrap">When</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Meeting</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">With</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Visitor</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Kind</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-500 dark:divide-white/10">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-stone-500 dark:text-white/50"
                  >
                    Loading meetings…
                  </td>
                </tr>
              ) : upcoming.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-stone-500 dark:text-white/50"
                  >
                    No upcoming meetings scheduled.
                  </td>
                </tr>
              ) : (
                tablePageItems.map((meeting) => {
                  const inProgress =
                    meeting.start <= now && meeting.end > now;

                  return (
                    <tr
                      key={`${meeting.staffId}-${meeting.id}`}
                      className="text-sm text-navy-500 dark:text-white"
                    >
                      <td className="whitespace-nowrap px-4 py-2">
                        {whenLabel(meeting, now)}
                      </td>
                      <td className="max-w-xs truncate px-4 py-2">
                        {meeting.title || "Untitled"}
                      </td>
                      <td className="px-4 py-2 text-stone-500 dark:text-white/50">
                        {staffNames.get(meeting.staffId) ?? "Unknown"}
                      </td>
                      <td className="px-4 py-2 text-stone-500 dark:text-white/50">
                        {visitorLabel(meeting)}
                      </td>
                      <td className="px-4 py-2">
                        {inProgress ? (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-400/15 dark:text-green-300">
                            Now
                          </span>
                        ) : meeting.isVisit ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                            Visit
                          </span>
                        ) : (
                          <span className="rounded-full bg-navy-500/8 px-2 py-0.5 text-xs font-semibold text-navy-500 dark:bg-white/10 dark:text-white/70">
                            Scheduled
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && upcoming.length > 0 ? (
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
