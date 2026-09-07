"use client";

import { IconSettings } from "@tabler/icons-react";
import { HAS_FIREBASE_CONFIG } from "@/src/lib/firebase";

/**
 * Shown while `.env.local` has no Firebase project in it.
 *
 * Without it there is no sign-in and no database, and every screen would fail
 * in a different confusing way — an empty staff list here, a silent login
 * failure there. One clear explanation beats five vague symptoms.
 *
 * Owns its own full-screen background so callers can return it directly; a
 * wrapper that only sets a height is how it ended up floating in the top
 * two-thirds of the page.
 */
export default function SetupNotice({
  tone = "light",
}: {
  tone?: "light" | "dark";
}) {
  if (HAS_FIREBASE_CONFIG) return null;

  const dark = tone === "dark";

  return (
    <div
      className={`flex min-h-screen w-full flex-1 items-center justify-center px-4 py-10 ${
        dark
          ? "bg-[radial-gradient(120%_90%_at_50%_-10%,#045178_0%,#022436_60%,#01161f_100%)] text-white"
          : "bg-stone-50 dark:bg-surface-dark"
      }`}
    >
      <div
        className={`w-full max-w-lg rounded-3xl border p-8 text-center sm:p-10 ${
          dark
            ? "border-white/12 bg-white/[0.05]"
            : "border-navy-500/15 bg-white shadow-sm dark:border-white/10 dark:bg-surface-dark-card dark:shadow-none"
        }`}
      >
        <span
          aria-hidden
          className={`mx-auto flex size-12 items-center justify-center rounded-2xl ${
            dark
              ? "bg-gold-300/15 text-gold-300"
              : "bg-navy-500/10 text-navy-500 dark:bg-white/10 dark:text-white"
          }`}
        >
          <IconSettings className="size-6" />
        </span>

        <h1
          className={`mt-5 font-serif text-2xl tracking-tight ${
            dark ? "text-white" : "text-navy-500 dark:text-white"
          }`}
        >
          Firebase isn&rsquo;t connected yet
        </h1>

        <p
          className={`mt-3 text-sm leading-relaxed ${
            dark ? "text-white/60" : "text-stone-600 dark:text-white/60"
          }`}
        >
          This app needs its own Firebase project before anything will load.
        </p>

        <ol
          className={`mt-6 space-y-3 text-left text-sm leading-relaxed ${
            dark ? "text-white/70" : "text-stone-700 dark:text-white/70"
          }`}
        >
          {[
            <>
              Copy <code className="font-mono text-xs">.env.example</code> to{" "}
              <code className="font-mono text-xs">.env.local</code> and fill in
              the seven Firebase values.
            </>,
            <>
              Publish{" "}
              <code className="font-mono text-xs">database.rules.json</code> in
              the Firebase console.
            </>,
            <>Restart the dev server.</>,
          ].map((step, index) => (
            <li key={index} className="flex gap-3">
              <span
                aria-hidden
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  dark
                    ? "bg-white/10 text-white"
                    : "bg-navy-500/10 text-navy-500 dark:bg-white/10 dark:text-white"
                }`}
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <p
          className={`mt-6 text-xs ${dark ? "text-white/40" : "text-stone-500 dark:text-white/40"}`}
        >
          Step-by-step instructions are in the README.
        </p>
      </div>
    </div>
  );
}
