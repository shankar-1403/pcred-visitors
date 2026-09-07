import { useEffect, useMemo, useState } from "react";
import { subscribeStaff } from "@/src/lib/data";

export interface Staff {
  id: string;
  name?: string;
  designation?: string;
  department?: string;
  /**
   * The address this person signs in with. It is what links them to their own
   * visitors — leave it blank and reception answers on their behalf.
   */
  email?: string;
  phone?: string;
  active?: boolean;
  /** Booked slots come from their own in-app calendar, inside these hours. */
  workingHours?: { start: string; end: string; days: number[] };
  slotMinutes?: number;
  createdAt?: number;
  createdBy?: string | null;
  updatedAt?: number;
  updatedBy?: string | null;
  [key: string]: unknown;
}

/**
 * Realtime staff directory. The door kiosk reads this unauthenticated, so the
 * node must stay free of anything private — see database.rules.example.json.
 */
export function useStaff() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeStaff(
      (list) => {
        setStaff(list);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setStaff([]);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const activeStaff = useMemo(
    () => staff.filter((member) => member.active !== false),
    [staff]
  );

  return { staff, activeStaff, loading, error };
}
