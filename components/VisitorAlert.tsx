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
import {
  useVisitorRequests,
  type VisitorRequest,
} from "@/src/hooks/useVisitorRequests";

/**
 * Two-note chime built with the Web Audio API — deliberately no audio file, so
 * there is no asset to ship, cache-bust or 404. Plays once per visitor, not on
 * a repeating loop — a single chime reads as a notification; a repeating one
 * reads as an alarm.
 */
function playChime() {
  if (typeof window === "undefined") return;

  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioCtor) return;

  try {
    const ctx = new AudioCtor();

    // Autoplay policy: if the user hasn't interacted with the page yet the
    // context stays suspended and the chime is simply skipped.
    void ctx.resume?.();

    [
      { frequency: 880, at: 0 },
      { frequency: 1174.66, at: 0.16 },
    ].forEach(({ frequency, at }) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + at + 0.42
      );

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime + at);
      oscillator.stop(ctx.currentTime + at + 0.45);
    });

    setTimeout(() => void ctx.close?.(), 1200);
  } catch {
    // A blocked or unavailable audio context must never break the alert.
  }
}

/**
 * Live alert for staff: a new visitor at the door raises a modal, a repeating
 * chime and — once permitted — a native OS notification that reaches them even
 * when this tab is in the background.
 *
 * Mounted for every internal CMS page, not just the visitors inbox.
 */
export default function VisitorAlert() {
  const router = useRouter();
  const { user } = useAuth();
  const { requests, loading } = useVisitorRequests();

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

  // Ids already seen. Seeded from the first snapshot so opening a page never
  // replays a backlog of alerts for visitors who arrived hours ago.
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (loading || !user) return;

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

    // One chime per arrival, not a repeating loop — a notification, not an alarm.
    playChime();

    if (
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
            router.push("/staff");
            notification.close();
          };
        } catch {
          // Notification construction can throw on some platforms — ignore.
        }
      });
    }
  }, [requests, loading, user, router]);

  const dismiss = useCallback((id: string) => {
    setQueue((prev) => prev.filter((request) => request.id !== id));
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    try {
      // Must be called from a real click — browsers reject a bare page-load ask.
      const result = await Notification.requestPermission();
      setAnsweredPermission(result);
    } catch {
      // Denied or unsupported: the in-app alert still works on its own.
    }
  }, []);

  const current = queue[0];

  if (!user) return null;

  return (
    <>
      {permission === "default" ? (
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
              {(current.staffEmail ?? "").toLowerCase() ===
              (user.email ?? "").toLowerCase() && user.email ? (
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
                  className="min-h-10 flex-1 cursor-pointer rounded-xl border border-navy-500/20 text-sm font-semibold text-navy-500 transition-colors hover:bg-navy-500/6"
                >
                  Later
                </button>
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
