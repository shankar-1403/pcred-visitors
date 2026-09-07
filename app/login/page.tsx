"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useAuth } from "@/src/context/AuthContext";
import { HAS_FIREBASE_CONFIG } from "@/src/lib/firebase";
import SetupNotice from "@/components/SetupNotice";

function LoginForm() {
  const { user, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Only ever an in-app path — an absolute URL here would be an open redirect.
  const requested = searchParams.get("redirect") ?? "/staff";
  const redirect = requested.startsWith("/") && !requested.startsWith("//")
    ? requested
    : "/staff";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace(redirect);
  }, [user, redirect, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(email, password);
      router.replace(redirect);
    } catch {
      // Deliberately generic: naming which half was wrong tells an attacker
      // whether an account exists.
      setError("Email or password is incorrect.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!HAS_FIREBASE_CONFIG) return <SetupNotice tone="dark" />;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(120%_90%_at_50%_-10%,#045178_0%,#022436_60%,#01161f_100%)] px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-sm">
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo.webp"
            alt="PCRED"
            width={192}
            height={57}
            priority
            className="h-12 w-auto object-contain"
          />
        </div>

        <h1 className="text-center font-serif text-2xl text-white">
          Staff sign in
        </h1>
        <p className="mt-2 text-center text-sm text-white/50">
          Ask an admin if you don&rsquo;t have a login yet.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/50"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@pcred.org"
              className="min-h-13 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none transition-colors placeholder:text-white/30 focus:border-gold-300/70 focus:bg-white/10"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/50"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-13 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 pr-14 text-white outline-none transition-colors focus:border-gold-300/70 focus:bg-white/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                {showPassword ? (
                  <IconEyeOff className="size-5" />
                ) : (
                  <IconEye className="size-5" />
                )}
              </button>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-13 w-full cursor-pointer rounded-xl bg-gold-300 text-sm font-semibold text-brand-deep transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary so the route can still be
  // prerendered rather than opting the whole page into client rendering.
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-deep" />}>
      <LoginForm />
    </Suspense>
  );
}
