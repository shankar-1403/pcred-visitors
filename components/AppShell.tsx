"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { IconLogout, IconMenu2, IconX } from "@tabler/icons-react";
import { useAuth } from "@/src/context/AuthContext";
import { useVisitorRequests } from "@/src/hooks/useVisitorRequests";
import { useRole } from "@/src/hooks/useRole";
import { ThemeProvider, useTheme } from "@/src/context/ThemeContext";
import ProtectedRoute from "./ProtectedRoute";
import VisitorAlert from "./VisitorAlert";
import InstallApp from "./InstallApp";
import ThemeToggle from "./ThemeToggle";

/**
 * Staff have two places to be. An admin has one — the directory is all of
 * `/staff` for them — so they get no nav at all rather than a lone tab.
 */
const NAV: { label: string; href: string; roles: ("admin" | "staff")[] }[] = [
  { label: "Visitors", href: "/staff", roles: ["staff"] },
  { label: "My calendar", href: "/staff/calendar", roles: ["staff"] },
];

/**
 * Chrome for the signed-in staff pages: nav, live waiting badge, and the
 * global visitor alert — mounted here so a waiting visitor reaches staff on
 * any page, not only the inbox.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  // Everything for the admin/staff screens lives inside this provider and its
  // `.dark`-toggling wrapper — the kiosk and the login screen are rendered
  // completely outside this tree, so neither can be reached by this toggle.
  return (
    <ThemeProvider>
      <ThemedShell>
        <ProtectedRoute>
          <ShellChrome>{children}</ShellChrome>
        </ProtectedRoute>
      </ThemedShell>
    </ThemeProvider>
  );
}

function ThemedShell({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  return (
    <div
      className={`flex min-h-screen flex-col transition-colors duration-200 ${
        theme === "dark" ? "dark bg-surface-dark" : "bg-stone-50"
      }`}
    >
      {children}
    </div>
  );
}

function ShellChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, logout } = useAuth();
  const { pending } = useVisitorRequests();
  const { isAdmin } = useRole();
  const [menuOpen, setMenuOpen] = useState(false);

  // Cosmetic only — each page guards itself and the rules refuse the writes
  // regardless of what is on screen.
  const nav = NAV.filter((item) =>
    item.roles.includes(isAdmin ? "admin" : "staff")
  );

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const waitingLabel = `${pending.length} ${
    pending.length === 1 ? "visitor" : "visitors"
  } waiting at the door`;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-navy-500/10 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-surface-dark/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/staff" className="flex shrink-0 items-center gap-3">
            <Image
              src="/logo.webp"
              alt="PCRED"
              width={192}
              height={57}
              priority
              className="h-9 w-auto object-contain"
            />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`flex min-h-10 items-center rounded-lg px-4 text-sm font-medium transition-colors duration-200 ${
                  pathname === item.href
                    ? "bg-navy-500 text-white"
                    : "text-navy-500 hover:bg-navy-500/8 dark:text-white/80 dark:hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {!isAdmin && pending.length > 0 ? (
              <Link
                href="/staff"
                aria-label={waitingLabel}
                className="flex min-h-10 items-center gap-2 rounded-lg bg-amber-100 px-3 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-200 dark:bg-amber-400/15 dark:text-amber-300 dark:hover:bg-amber-400/25"
              >
                <span className="relative flex size-2" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-amber-600" />
                </span>
                <span className="tabular-nums">{pending.length}</span>
                <span className="hidden sm:inline">waiting</span>
              </Link>
            ) : null}

            <span className="hidden max-w-40 truncate text-sm text-stone-600 lg:block dark:text-white/60">
              {profile?.displayName ?? user?.email}
            </span>

            <ThemeToggle />

            <button
              type="button"
              onClick={handleLogout}
              title={`Sign out ${profile?.displayName ?? user?.email ?? ""}`.trim()}
              aria-label="Sign out"
              className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-navy-500/20 px-3 text-sm font-medium text-navy-500 transition-colors hover:bg-navy-500/8 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/10"
            >
              <IconLogout className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>

            {nav.length > 0 ? (
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="flex size-10 cursor-pointer items-center justify-center rounded-lg border border-navy-500/20 text-navy-500 sm:hidden dark:border-white/15 dark:text-white/80"
            >
              {menuOpen && nav.length > 0 ? (
                <IconX className="size-5" />
              ) : (
                <IconMenu2 className="size-5" />
              )}
            </button>
            ) : null}
          </div>
        </div>

        {menuOpen && nav.length > 0 ? (
          <nav
            aria-label="Mobile"
            className="border-t border-navy-500/10 bg-white px-4 py-3 sm:hidden dark:border-white/10 dark:bg-surface-dark"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-12 items-center rounded-lg px-3 text-sm font-medium text-navy-500 hover:bg-navy-500/8 dark:text-white/80 dark:hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}

          </nav>
        ) : null}
      </header>

      <main className="flex-1">
        {/* Staff are who install this — a visitor at the door never should. */}
        <div className="pt-6">
          <InstallApp />
        </div>
        {children}
      </main>

      <VisitorAlert />
    </>
  );
}
