import {
  equalTo,
  onValue,
  orderByChild,
  push,
  query as dbQuery,
  ref,
  set,
  update,
} from "firebase/database";
import { db, HAS_FIREBASE_CONFIG } from "./firebase";
import type { Slot } from "./availability";
import type { Role, RoleRecord } from "@/src/hooks/useRole";
import type { Staff } from "@/src/hooks/useStaff";
import type { VisitorRequest } from "@/src/hooks/useVisitorRequests";

/**
 * Every read and write in the app goes through here, so the pages and hooks
 * never touch firebase/database directly.
 */

type Unsubscribe = () => void;

/**
 * Without config there is no database object, and `ref(null, …)` throws.
 *
 * Components call their hooks before they can decide to render the setup
 * notice, so the guard has to live here rather than relying on every caller
 * checking first.
 */
const NOT_CONFIGURED = new Error(
  "Firebase is not configured. Fill in .env.local and restart the dev server."
);

const noop: Unsubscribe = () => {};

/** Turns an RTDB object-of-objects into the id-carrying list the app uses. */
function toList<T>(value: unknown): T[] {
  return value
    ? (Object.entries(value as Record<string, object>).map(([id, data]) => ({
        id,
        ...data,
      })) as T[])
    : [];
}

/* ----------------------------------------------------------------- roles */

export function subscribeRole(
  uid: string,
  onData: (record: RoleRecord | null) => void
): Unsubscribe {
  if (!HAS_FIREBASE_CONFIG) {
    onData(null);
    return noop;
  }

  return onValue(
    ref(db, `users/${uid}`),
    (snapshot) => onData((snapshot.val() as RoleRecord | null) ?? null),
    () => onData(null)
  );
}

/* ----------------------------------------------------------------- staff */

export function subscribeStaff(
  onData: (staff: Staff[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  if (!HAS_FIREBASE_CONFIG) {
    onError(NOT_CONFIGURED);
    return noop;
  }

  return onValue(
    ref(db, "staff"),
    (snapshot) => onData(sortStaff(toList<Staff>(snapshot.val()))),
    (error) => {
      console.error(
        "[visitor-app] staff read denied — rules must allow reads on /staff.",
        error
      );
      onError(error);
    }
  );
}

function sortStaff(staff: Staff[]) {
  // Alphabetical: the kiosk grid is scanned by eye, not by recency.
  return [...staff].sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, {
      sensitivity: "base",
    })
  );
}

export async function saveStaffMember(
  staffId: string | null,
  record: Omit<Staff, "id">
): Promise<string> {
  if (!HAS_FIREBASE_CONFIG) throw NOT_CONFIGURED;

  const nextId = staffId ?? push(ref(db, "staff")).key;

  if (!nextId) throw new Error("Could not create staff record.");

  await set(ref(db, `staff/${nextId}`), record);
  return nextId;
}

export async function patchStaffMember(
  staffId: string,
  patch: Partial<Staff>
): Promise<void> {
  if (!HAS_FIREBASE_CONFIG) throw NOT_CONFIGURED;

  await update(ref(db, `staff/${staffId}`), patch);
}

/* -------------------------------------------------------------- requests */

/**
 * Visitor requests the signed-in person is allowed to see.
 *
 * An admin reads the whole node. Everyone else issues a query constrained to
 * their own address — which is not a convenience, it is the shape the database
 * rules require. An unconstrained read from a non-admin is refused outright,
 * so a staff member cannot see who visited anyone else.
 */
export function subscribeRequests(
  { role, email }: { role: Role; email?: string | null },
  onData: (requests: VisitorRequest[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  if (!HAS_FIREBASE_CONFIG) {
    onError(NOT_CONFIGURED);
    return noop;
  }

  const base = ref(db, "visitor_requests");
  const scoped =
    role === "admin"
      ? base
      : dbQuery(
          base,
          orderByChild("staffEmail"),
          equalTo((email ?? "").trim().toLowerCase())
        );

  return onValue(
    scoped,
    (snapshot) => onData(sortRequests(toList<VisitorRequest>(snapshot.val()))),
    (error) => {
      console.error(
        "[visitor-app] visitor_requests read denied — check the rules and your role.",
        error
      );
      onError(error);
    }
  );
}

function sortRequests(requests: VisitorRequest[]) {
  return [...requests].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function subscribeRequest(
  requestId: string,
  onData: (request: VisitorRequest | null) => void,
  onError: (error: Error) => void
): Unsubscribe {
  if (!HAS_FIREBASE_CONFIG) {
    onError(NOT_CONFIGURED);
    return noop;
  }

  return onValue(
    ref(db, `visitor_requests/${requestId}`),
    (snapshot) => {
      const value = snapshot.val();
      onData(value ? { id: requestId, ...value } : null);
    },
    (error) => {
      console.error(
        `[visitor-app] visitor_requests/${requestId} read denied — rules must allow public reads on a single request.`,
        error
      );
      onError(error);
    }
  );
}

/* ---------------------------------------------------------- availability */

export interface Availability {
  staffName: string;
  freeNow: boolean;
  /** False when today is outside the configured working days. */
  openToday: boolean;
  slots: Slot[];
  now: number;
}

export async function fetchAvailability(
  staffId: string
): Promise<Availability> {
  const response = await fetch(
    `/api/availability?staffId=${encodeURIComponent(staffId)}`,
    { cache: "no-store" }
  );

  const data = (await response.json()) as Availability & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Could not check availability.");
  }

  return data;
}

export interface NewVisitorRequest {
  staffId: string;
  visitorName: string;
  visitorPhone: string;
  visitorEmail: string;
  company: string;
  partySize: number;
  purpose: string;
  purposeNote: string;
  /** Chosen slot start, or null for "meet now". */
  requestedFor: number | null;
}

export async function createVisitorRequest(
  payload: NewVisitorRequest
): Promise<string> {
  const response = await fetch("/api/visitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as { id?: string; error?: string };

  if (!response.ok || !data.id) {
    throw new Error(data.error ?? "Check-in failed. Please see reception.");
  }

  return data.id;
}

/* -------------------------------------------------------------- calendar */

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
  /** True when this app created it from a visitor check-in. */
  isVisit: boolean;
}

export interface CalendarResult {
  events: CalendarEvent[];
}

async function authHeader(): Promise<Record<string, string>> {
  const { auth } = await import("./firebase");
  const idToken = await auth?.currentUser?.getIdToken();

  if (!idToken) throw new Error("Please sign in again.");

  return { Authorization: `Bearer ${idToken}` };
}

/** The signed-in person's own events. Never anyone else's. */
export async function fetchMyEvents(
  from: number,
  to: number
): Promise<CalendarResult> {
  const response = await fetch(`/api/calendar?from=${from}&to=${to}`, {
    cache: "no-store",
    headers: await authHeader(),
  });

  const data = (await response.json()) as CalendarResult & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Could not load your calendar.");
  }

  return data;
}

export async function createMyEvent(event: {
  title: string;
  start: number;
  end: number;
  location?: string;
}): Promise<void> {
  const response = await fetch("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(event),
  });

  const data = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Could not add that to your calendar.");
  }
}

/* -------------------------------------------------------- staff accounts */

export interface NewStaffAccount {
  email: string;
  password: string;
  displayName: string;
  /** Omit when resetting an existing login without touching its access level. */
  role?: Role;
}

/** Creates a login. Admin-only, and re-checked server-side. */
/** Creates a login for that email, or resets the password if it already exists. */
export async function createStaffAccount(
  account: NewStaffAccount
): Promise<{ created: boolean }> {
  const response = await fetch("/api/staff-accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
    },
    body: JSON.stringify(account),
  });

  const data = (await response.json()) as { error?: string; created?: boolean };

  if (!response.ok) {
    throw new Error(data.error ?? "Could not save that login.");
  }

  return { created: data.created ?? true };
}

export async function respondToRequest(
  requestId: string,
  patch: Partial<VisitorRequest>
): Promise<void> {
  if (!HAS_FIREBASE_CONFIG) throw NOT_CONFIGURED;

  await update(ref(db, `visitor_requests/${requestId}`), patch);

  // The visitor has already been told the outcome by the write above, so a
  // calendar failure is logged and swallowed rather than surfaced as a failed
  // approval.
  if (patch.status === "approved") {
    try {
      await fetch("/api/visits/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify({ requestId }),
      });
    } catch (error) {
      console.error(
        "[visitor-app] approved, but could not add it to the calendar:",
        error
      );
    }
  }
}
