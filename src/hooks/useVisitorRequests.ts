import { useEffect, useMemo, useState } from "react";
import { subscribeRequests } from "@/src/lib/data";
import { useAuth } from "@/src/context/AuthContext";
import { useRole } from "./useRole";

export type VisitorStatus = "pending" | "approved" | "declined" | "postponed";

export interface VisitorRequest {
  id: string;
  visitorName?: string;
  visitorPhone?: string;
  visitorEmail?: string;
  company?: string;
  partySize?: number;
  purpose?: string;
  purposeNote?: string;
  /** Slot the visitor asked for, or null when they asked to meet now. */
  requestedFor?: number | null;
  /** Set once an approval has been written into the staff member's calendar. */
  calendarEventId?: string | null;
  staffId?: string;
  staffName?: string;
  staffDepartment?: string;
  /** Lowercased login address of the person being visited. Empty when they have no login. */
  staffEmail?: string;
  status?: VisitorStatus;
  responseNote?: string;
  postponedTo?: number | null;
  createdAt?: number;
  respondedAt?: number | null;
  respondedBy?: string | null;
  respondedByName?: string | null;
  source?: string;
  [key: string]: unknown;
}

/**
 * Realtime visitor request log, newest first.
 *
 * Scoped by role: an admin gets everything, everyone else gets only the
 * visitors who came to see them. That scoping is enforced by the database
 * rules, not just here.
 */
export function useVisitorRequests() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const currentEmail = user?.email ?? null;

  const [requests, setRequests] = useState<VisitorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Wait for the role: subscribing as "staff" first and re-subscribing as
    // "admin" a moment later makes the inbox visibly flicker.
    if (roleLoading || !user) return;

    const unsubscribe = subscribeRequests(
      { role, email: currentEmail },
      (list) => {
        setRequests(list);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setRequests([]);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [role, roleLoading, currentEmail, user]);

  const pending = useMemo(
    () => requests.filter((request) => (request.status ?? "pending") === "pending"),
    [requests]
  );

  const mine = useMemo(() => {
    const me = currentEmail?.trim().toLowerCase();
    if (!me) return [];

    return requests.filter(
      (request) => (request.staffEmail ?? "").toLowerCase() === me
    );
  }, [requests, currentEmail]);

  /** Visitors for someone with no login — nobody's "mine", so easily missed. */
  const unassigned = useMemo(
    () => requests.filter((request) => !request.staffEmail),
    [requests]
  );

  const pendingForMe = useMemo(
    () => mine.filter((request) => (request.status ?? "pending") === "pending"),
    [mine]
  );

  return {
    requests,
    pending,
    mine,
    pendingForMe,
    unassigned,
    loading: loading || roleLoading,
    error,
  };
}
