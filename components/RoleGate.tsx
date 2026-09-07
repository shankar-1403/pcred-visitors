"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRole } from "@/src/hooks/useRole";

/**
 * Blocks a page for the wrong role.
 *
 * A courtesy on top of the database rules, not a substitute for them — the
 * rules refuse the reads and writes whatever this renders.
 */
export default function RoleGate({
  allow,
  title,
  body,
  backHref,
  backLabel,
  children,
}: {
  allow: "admin" | "staff";
  title: string;
  body: string;
  backHref: string;
  backLabel: string;
  children: ReactNode;
}) {
  const { role, loading } = useRole();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span
          role="status"
          aria-label="Loading"
          className="size-8 animate-spin rounded-full border-2 border-navy-500/20 border-t-navy-500 dark:border-white/15 dark:border-t-white"
        />
      </div>
    );
  }

  if (role !== allow) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-serif text-2xl text-navy-500 dark:text-white">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-500 dark:text-white/60">{body}</p>
        <Link
          href={backHref}
          className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-navy-500 px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {backLabel}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
