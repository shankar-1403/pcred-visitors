"use client";

import { useRole } from "@/src/hooks/useRole";
import VisitorsInbox from "@/components/staff/VisitorsInbox";
import StaffDirectory from "@/components/staff/StaffDirectory";

/**
 * One front door per role.
 *
 * An admin administers, a staff member receives visitors — so rather than
 * making one of them navigate to a sub-page they'd never leave, `/staff` is
 * simply whichever of those two things applies to you.
 */
export default function StaffPage() {
  const { isAdmin, loading } = useRole();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span
          role="status"
          aria-label="Loading"
          className="size-8 animate-spin rounded-full border-2 border-navy-500/20 border-t-navy-500"
        />
      </div>
    );
  }

  return isAdmin ? <StaffDirectory /> : <VisitorsInbox />;
}
