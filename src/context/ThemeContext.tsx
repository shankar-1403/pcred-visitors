"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * Light/dark for the admin and staff screens only.
 *
 * This provider does not touch <html> or <body> — AppShell mounts it around
 * just the staff-area chrome, and applies the resulting `.dark` class to a
 * div it renders there. The kiosk and the login screen are outside that tree
 * entirely, so this can never affect either, regardless of what someone picks.
 *
 * Preference and the OS setting both live in the browser, outside React —
 * read through useSyncExternalStore rather than mirrored into state by an
 * effect, which is what lets the very first render already show the right
 * theme instead of flashing light-then-correct on every load.
 */

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  /** What the person picked — including "system", before resolving it. */
  preference: ThemePreference;
  /** What to actually render — "system" resolved against the OS setting. */
  theme: ResolvedTheme;
  setPreference: (value: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = "pcred_staff_theme_v1";

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", listener);
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("storage", listener);
  };
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Private mode or blocked storage: fall back to the light default.
  }

  return "light";
}

function readSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Deterministic first paint on the server, corrected the instant the client
// snapshot is read — never "light" flashed before the real value arrives.
const getServerSnapshot = (): ThemePreference => "light";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(
    subscribe,
    readPreference,
    getServerSnapshot
  );

  const systemDark = useSyncExternalStore(
    subscribe,
    readSystemDark,
    () => false
  );

  const setPreference = useCallback((value: ThemePreference) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Non-fatal — it just won't be remembered next visit.
    }
    // The storage event only reaches other tabs, never this one — this tab
    // has to be told directly that its own write just happened.
    emit();
  }, []);

  const theme: ResolvedTheme =
    preference === "dark" || (preference === "system" && systemDark)
      ? "dark"
      : "light";

  const value = useMemo(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider.");
  }

  return context;
}
