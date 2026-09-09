import { useEffect, useMemo, useState } from "react";
import {
  subscribeAllCalendarEvents,
  type OfficeMeeting,
} from "@/src/lib/data";

/**
 * Office-wide calendar: every staff member's upcoming (and in-progress)
 * meetings, soonest first. Reception's dashboard is the only caller — the
 * database rules refuse this read from ordinary staff.
 */
export function useOfficeMeetings() {
  const [meetings, setMeetings] = useState<OfficeMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unsubscribe = subscribeAllCalendarEvents(
      (list) => {
        setMeetings(list);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setMeetings([]);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const upcoming = useMemo(
    () => meetings.filter((meeting) => (meeting.end ?? 0) >= now),
    [meetings, now]
  );

  return { meetings, upcoming, loading, error, now };
}
