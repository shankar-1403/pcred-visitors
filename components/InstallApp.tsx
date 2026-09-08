"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { IconDownload, IconShare2, IconX } from "@tabler/icons-react";

/**
 * The prompt that puts this on someone's home screen.
 *
 * Android hands us a real install prompt to fire. Apple never does — an iPhone
 * can only be added from Safari's own Share menu, and until someone does that
 * iOS refuses to deliver notifications to the site at all. So iPhone users get
 * instructions rather than a button, because a button we cannot honour would
 * be worse than none.
 */

const DISMISS_KEY = "pcred_install_dismissed_v1";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/*
 * These three facts live in the browser, not in React — whether the app is
 * already installed, whether this is an iPhone, and whether the prompt was
 * dismissed before. Read through useSyncExternalStore so they are never
 * mirrored into state by an effect, and so SSR gets a defined answer.
 */

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribeStandalone(listener: () => void) {
  listeners.add(listener);

  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", listener);
  window.addEventListener("appinstalled", listener);

  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("appinstalled", listener);
  };
}

function isStandaloneNow() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own flag for a home-screen app.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOSNow() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !/crios|fxios/i.test(navigator.userAgent)
  );
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

const noopSubscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export default function InstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );

  // Hidden during SSR and the first paint: better to appear a beat late than
  // to flash an install banner at someone who already installed it.
  const installed = useSyncExternalStore(
    subscribeStandalone,
    isStandaloneNow,
    () => true
  );
  const isIOS = useSyncExternalStore(noopSubscribe, isIOSNow, () => false);
  const dismissed = useSyncExternalStore(noopSubscribe, wasDismissed, () => true);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Chrome shows its own mini-infobar otherwise; we want it on our terms.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;

    await deferred.prompt();
    const { outcome } = await deferred.userChoice;

    // The event is single-use, whatever they chose.
    setDeferred(null);

    if (outcome === "accepted") emit();
  }, [deferred]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Non-fatal — it just reappears next time.
    }
    emit();
  }, []);

  if (installed || dismissed) return null;
  if (!deferred && !isIOS) return null;

  return (
    <div className="mx-auto mb-6 max-w-5xl px-4">
      <div className="relative flex flex-col gap-3 rounded-2xl border border-navy-500/15 bg-white p-4 sm:flex-row sm:items-center sm:gap-4">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-navy-500/10 text-navy-500"
        >
          <IconDownload className="size-5" />
        </span>

        <div className="min-w-0 flex-1 pr-8 sm:pr-0">
          <p className="text-sm font-semibold text-navy-500">
            Install PCRED Visitors
          </p>

          {isIOS ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm leading-relaxed text-stone-600">
              Tap
              <IconShare2 className="inline size-4 text-navy-500" aria-label="the Share button" />
              in Safari, then <strong className="font-semibold">Add to Home Screen</strong>.
              Notifications only reach an iPhone once it&rsquo;s added.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-stone-600">
              Opens full screen with its own icon, and lets visitor alerts reach
              you when the browser is closed.
            </p>
          )}
        </div>

        {deferred ? (
          <button
            type="button"
            onClick={install}
            className="min-h-11 shrink-0 cursor-pointer rounded-xl bg-navy-500 px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Install
          </button>
        ) : null}

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 flex size-8 cursor-pointer items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-navy-500/8 sm:static sm:size-9"
        >
          <IconX className="size-4" />
        </button>
      </div>
    </div>
  );
}
