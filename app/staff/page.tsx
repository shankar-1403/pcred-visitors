"use client";

import { useRole } from "@/src/hooks/useRole";
import VisitorsInbox from "@/components/staff/VisitorsInbox";
import StaffDirectory from "@/components/staff/StaffDirectory";

/**
 * One front door per role.
 *
 * An admin administers, a staff member receives visitors — so rather than
 * making one of them navigate to a sub-page they'd never leave, `/staff` is
 * simply whichever of those two things applies to you. Reception is sent to
 * `/reception` by the shell, so this page never renders their inbox.
 */
export default function StaffPage() {
  const { isAdmin, isReception, loading } = useRole();

  if (loading || isReception) {
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

  return isAdmin ? <StaffDirectory /> : <VisitorsInbox />;
}
