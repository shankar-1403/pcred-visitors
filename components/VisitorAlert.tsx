"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { IconBell, IconBellRinging, IconX } from "@tabler/icons-react";
import { useAuth } from "@/src/context/AuthContext";
import { useStaff } from "@/src/hooks/useStaff";
import { useRole } from "@/src/hooks/useRole";
import { registerPushToken } from "@/src/lib/push";
import {
  useVisitorRequests,
  type VisitorRequest,
} from "@/src/hooks/useVisitorRequests";

/**
 * Live alert for a visitor at the door.
 *
 * Staff get a personal toast (and, if they opted in, an OS notification and
 * push) so they can respond. Reception sees the same arrival as office-wide
 * information — no "for you", no respond action, no host push registration.
 */
export default function VisitorAlert() {
  const router = useRouter();
  const { user } = useAuth();
  const { isReception, loading: roleLoading } = useRole();
  const { requests, loading } = useVisitorRequests();
  const { staff } = useStaff();

  const myStaffRecord = staff.find(
    (member) =>
      (member.email ?? "").trim().toLowerCase() ===
      (user?.email ?? "").trim().toLowerCase()
  );

  const [queue, setQueue] = useState<VisitorRequest[]>([]);

  // Read straight off the browser rather than mirroring it into an effect —
  // Notification.permission is an external store, and it returns a stable
  // string, so a no-op subscription is all it needs.
  const browserPermission = useSyncExternalStore(
    () => () => {},
    () =>
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "unsupported",
    () => "unsupported"
  );

  // Set the moment the user answers the prompt, so the button disappears
  // without waiting for a re-render triggered by something else.
  const [answeredPermission, setAnsweredPermission] =
    useState<NotificationPermission | null>(null);

  const permission = answeredPermission ?? browserPermission;

  // Permission may already have been granted before this device ever ran
  // this push-registration code (e.g. from the earlier in-tab-only alert
  // feature) — in that case the "Enable" button never shows again, so this
  // is the only place a token gets saved for that device.
  const registeredStaffId = useRef<string | null>(null);
  useEffect(() => {
    // Reception is not a host. Registering their device against a staff
    // record would deliver "here to meet you" pushes that belong to someone
    // else — or to a leftover personal login on the same email.
    if (roleLoading || isReception) return;
    if (permission !== "granted" || !myStaffRecord) return;
    if (registeredStaffId.current === myStaffRecord.id) return;

    registeredStaffId.current = myStaffRecord.id;
    void registerPushToken(myStaffRecord.id);
  }, [permission, myStaffRecord, roleLoading, isReception]);

  // Ids already seen. Seeded from the first snapshot so opening a page never
  // replays a backlog of alerts for visitors who arrived hours ago.
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (loading || roleLoading || !user) return;

    const pending = requests.filter(
      (request) => (request.status ?? "pending") === "pending"
    );

    if (seenIds.current === null) {
      seenIds.current = new Set(requests.map((request) => request.id));
      return;
    }

    const fresh = pending.filter(
      (request) => !seenIds.current!.has(request.id)
    );

    requests.forEach((request) => seenIds.current!.add(request.id));

    if (fresh.length === 0) return;

    setQueue((prev) => {
      const existing = new Set(prev.map((request) => request.id));
      return [...prev, ...fresh.filter((request) => !existing.has(request.id))];
    });

    // No sound is played here on purpose. The OS notification below carries
    // the one the person has chosen on their own device, and a tone of ours
    // on top of it would both double up and override that choice.

    // Staff get a native OS popup as well. Reception only needs the in-app
    // toast — those OS notifications are phrased as a host's personal alert.
    if (
      !isReception &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      fresh.forEach((request) => {
        try {
          const notification = new Notification(
            `${request.visitorName} is at the door`,
            {
              body: `Here to meet ${request.staffName} · ${request.purpose}`,
              // Tagged per request so a re-render can't stack duplicates.
              tag: `visitor-${request.id}`,
              icon: "/logo.png",
            }
          );

          notification.onclick = () => {
            window.focus();
            router.push(isReception ? "/reception" : "/staff");
            notification.close();
          };
        } catch {
          // Notification construction can throw on some platforms — ignore.
        }
      });
    }
  }, [requests, loading, roleLoading, user, router, isReception]);

  const dismiss = useCallback((id: string) => {
    setQueue((prev) => prev.filter((request) => request.id !== id));
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    try {
      // Must be called from a real click — browsers reject a bare page-load ask.
      // Token registration itself happens in the effect above, which reacts
      // to this permission change the same way it does for a device that
      // was already granted before this page ever loaded.
      const result = await Notification.requestPermission();
      setAnsweredPermission(result);
    } catch {
      // Denied or unsupported: the in-app alert still works on its own.
    }
  }, []);

  const current = queue[0];

  if (!user || roleLoading) return null;

  return (
    <>
      {permission === "default" && !isReception ? (
        <button
          type="button"
          onClick={requestPermission}
          className="fixed bottom-5 right-5 z-40 flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-navy-500/20 bg-white px-4 text-xs font-semibold text-navy-500 shadow-lg transition-colors hover:bg-navy-500/6"
        >
          <IconBell className="size-4" />
          Enable visitor alerts
        </button>
      ) : null}

      {/* A corner toast, not a takeover — it sits alongside whatever the
          staff member is doing rather than blocking it, closer to how a
          native OS notification behaves than to an alarm. */}
      <AnimatePresence>
        {current ? (
          <motion.div
            role="status"
            aria-live="polite"
            aria-label="Visitor waiting at the door"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            className="fixed right-4 top-4 z-[60] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-navy-500/10 sm:right-5 sm:top-5"
          >
            <div className="flex items-center justify-between bg-navy-500 px-5 py-3 text-white">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                <IconBellRinging className="size-4" />
                Visitor at the door
              </span>
              <button
                type="button"
                onClick={() => dismiss(current.id)}
                aria-label="Dismiss"
                className="flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/15"
              >
                <IconX className="size-3.5" />
              </button>
            </div>

            <div className="p-5">
              {!isReception &&
              (current.staffEmail ?? "").toLowerCase() ===
                (user.email ?? "").toLowerCase() &&
              user.email ? (
                <span className="mb-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                  For you
                </span>
              ) : null}

              <h2 className="text-lg font-bold text-navy-500">
                {current.visitorName}
              </h2>
              <p className="mt-0.5 text-sm text-stone-500">
                Here to meet{" "}
                <span className="font-medium text-navy-500">
                  {current.staffName}
                </span>{" "}
                &middot; {current.purpose}
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => dismiss(current.id)}
                  className={`min-h-10 cursor-pointer rounded-xl border border-navy-500/20 text-sm font-semibold text-navy-500 transition-colors hover:bg-navy-500/6 ${
                    isReception ? "w-full" : "flex-1"
                  }`}
                >
                  {isReception ? "Dismiss" : "Later"}
                </button>
                {!isReception ? (
                  <button
                    type="button"
                    onClick={() => {
                      dismiss(current.id);
                      router.push("/staff");
                    }}
                    className="min-h-10 flex-1 cursor-pointer rounded-xl bg-navy-500 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Respond now
                  </button>
                ) : null}
              </div>

              {queue.length > 1 ? (
                <p className="mt-3 text-center text-xs text-stone-500">
                  {queue.length - 1} more{" "}
                  {queue.length - 1 === 1 ? "visitor" : "visitors"} waiting
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
