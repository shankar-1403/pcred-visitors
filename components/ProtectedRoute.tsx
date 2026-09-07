"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";
import { HAS_FIREBASE_CONFIG } from "@/src/lib/firebase";
import SetupNotice from "./SetupNotice";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!HAS_FIREBASE_CONFIG) return;

    if (!loading && !user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, pathname, router]);

  if (!HAS_FIREBASE_CONFIG) return <SetupNotice />;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span
          aria-label="Loading"
          role="status"
          className="size-8 animate-spin rounded-full border-2 border-navy-500/20 border-t-navy-500 dark:border-white/15 dark:border-t-white"
        />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
