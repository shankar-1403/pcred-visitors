import { useEffect, useState } from "react";
import { subscribeRequest } from "@/src/lib/data";
import type { VisitorRequest } from "./useVisitorRequests";

interface Snapshot {
  /** The id this snapshot belongs to — lets stale results be ignored. */
  id: string;
  request: VisitorRequest | null;
  error: Error | null;
}

/**
 * Subscribes to a single visitor request. Drives the kiosk status screen, so
 * the visitor at the door sees Approved / Declined / Postponed the instant the
 * staff member taps it — no polling, no reload.
 */
export function useVisitorRequest(requestId: string | null) {
  // One piece of state, written only from the subscription callback. The
  // "no id yet" and "waiting for the first snapshot" cases are derived below
  // rather than pushed through setState in an effect.
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!requestId) return;

    const unsubscribe = subscribeRequest(
      requestId,
      (request) => setSnapshot({ id: requestId, request, error: null }),
      (error) => setSnapshot({ id: requestId, request: null, error })
    );

    return () => unsubscribe();
  }, [requestId]);

  const fresh = requestId && snapshot?.id === requestId ? snapshot : null;

  return {
    request: fresh?.request ?? null,
    loading: Boolean(requestId) && fresh === null,
    error: fresh?.error ?? null,
  };
}
