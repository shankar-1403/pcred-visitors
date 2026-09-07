"use client";

import { useState, useRef, useEffect } from "react";
import { IconMoon, IconSun, IconDeviceDesktop } from "@tabler/icons-react";
import { useTheme, type ThemePreference } from "@/src/context/ThemeContext";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof IconSun }[] = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "system", label: "System", icon: IconDeviceDesktop },
];

/** Light / dark / system, for the admin and staff screens only. */
export default function ThemeToggle() {
  const { preference, theme, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onClickAway = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const CurrentIcon = theme === "dark" ? IconMoon : IconSun;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Theme: ${preference}. Click to change.`}
        title={`Theme: ${preference}`}
        className="flex size-10 cursor-pointer items-center justify-center rounded-lg border border-navy-500/20 text-navy-500 transition-colors hover:bg-navy-500/8 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/10"
      >
        <CurrentIcon className="size-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-40 overflow-hidden rounded-xl border border-navy-500/15 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-surface-dark-card"
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={preference === value}
              onClick={() => {
                setPreference(value);
                setOpen(false);
              }}
              className={`flex min-h-10 w-full cursor-pointer items-center gap-2.5 px-3 text-sm transition-colors ${
                preference === value
                  ? "bg-navy-500/8 font-medium text-navy-500 dark:bg-white/10 dark:text-white"
                  : "text-navy-500/80 hover:bg-navy-500/6 dark:text-white/70 dark:hover:bg-white/5"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
