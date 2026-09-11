import {
  equalTo,
  get,
  onValue,
  orderByChild,
  push,
  query as dbQuery,
  ref,
  set,
  update,
} from "firebase/database";
import { db, HAS_FIREBASE_CONFIG } from "./firebase";
import type { BusyInterval } from "./availability";
import type { Role, RoleRecord } from "@/src/hooks/useRole";
import type { Staff } from "@/src/hooks/useStaff";
import type { VisitorRequest } from "@/src/hooks/useVisitorRequests";

/**
 * A staff member's busy blocks — timing only, never a title. Public read, by
 * database rule design: this is exactly what a booking link needs to grey
 * out slots without ever exposing what any of their meetings actually are.
 */
export async function fetchBusyBlocks(staffId: string): Promise<BusyInterval[]> {
  if (!HAS_FIREBASE_CONFIG) return [];

  const snapshot = await get(ref(db, `busy_blocks/${staffId}`));
  const value = snapshot.val() as Record<string, BusyInterval> | null;

  return Object.values(value ?? {});
}

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
 * An admin or reception reads the whole node. Everyone else issues a query
 * constrained to their own address — which is not a convenience, it is the
 * shape the database rules require. An unconstrained read from ordinary staff
 * is refused outright, so they cannot see who visited anyone else.
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
    role === "admin" || role === "reception"
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

export interface NewVisitorRequest {
  staffId: string;
  visitorName: string;
  visitorPhone: string;
  visitorEmail: string;
  company: string;
  designation: string;
  address: string;
  purpose: string;
  purposeNote: string;
  /** The slot picked on a staff member's own booking link. Omitted (or null)
      on the walk-in kiosk, which has no schedule to pick from. */
  requestedFor?: number | null;
  /** Where to push the outcome once the host answers. Captured at check-in
      because an anonymous visitor cannot edit their request afterwards. */
  visitorPushToken?: string;
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
  /** Only a "manual" event (one staff added themselves) can be edited from
      the calendar — a visitor booking's fields belong to that request. */
  source?: "manual" | "approved" | "postponed";
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientCompany?: string;
}

export interface CalendarResult {
  events: CalendarEvent[];
}

/** A calendar event plus whose diary it lives on — reception's office-wide list. */
export interface OfficeMeeting extends CalendarEvent {
  staffId: string;
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
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientCompany?: string;
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

/** Edits an event staff added themselves — same notification as adding a new
    one fires again, since it reads as freshly scheduled either way. */
export async function updateMyEvent(
  id: string,
  event: {
    title: string;
    start: number;
    end: number;
    location?: string;
    clientName?: string;
    clientPhone?: string;
    clientEmail?: string;
    clientCompany?: string;
  }
): Promise<void> {
  const response = await fetch("/api/calendar", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ id, ...event }),
  });

  const data = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Could not update that event.");
  }
}

/**
 * Every meeting on every staff member's calendar. Reception and admin are
 * the only roles the database rules will answer this for — a staff member
 * asking for the whole tree is refused outright.
 */
export function subscribeAllCalendarEvents(
  onData: (meetings: OfficeMeeting[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  if (!HAS_FIREBASE_CONFIG) {
    onError(NOT_CONFIGURED);
    return noop;
  }

  return onValue(
    ref(db, "calendar_events"),
    (snapshot) => onData(flattenOfficeMeetings(snapshot.val())),
    (error) => {
      console.error(
        "[visitor-app] calendar_events read denied — reception and admin can read the whole tree; staff cannot.",
        error
      );
      onError(error);
    }
  );
}

function flattenOfficeMeetings(value: unknown): OfficeMeeting[] {
  const tree = (value ?? {}) as Record<string, Record<string, Omit<CalendarEvent, "id">>>;

  const meetings: OfficeMeeting[] = [];

  for (const [staffId, byId] of Object.entries(tree)) {
    for (const [id, event] of Object.entries(byId ?? {})) {
      meetings.push({ id, staffId, ...event });
    }
  }

  return meetings.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
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

/**
 * Puts an approved or postponed visit on the host's own calendar, so the
 * month's record holds every meeting that actually happened rather than only
 * the ones staff typed in themselves.
 *
 * Safe to call more than once: the server returns the block a visit already
 * has instead of adding a second one, which is what lets a missed write be
 * recovered later.
 */
export async function addVisitToCalendar(requestId: string): Promise<void> {
  const response = await fetch("/api/visits/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
    },
    body: JSON.stringify({ requestId }),
  });

  if (!response.ok) {
    throw new Error(`Could not add the visit to the calendar: ${response.status}`);
  }
}

export async function respondToRequest(
  requestId: string,
  patch: Partial<VisitorRequest>
): Promise<void> {
  if (!HAS_FIREBASE_CONFIG) throw NOT_CONFIGURED;

  await update(ref(db, `visitor_requests/${requestId}`), patch);

  // Reach the visitor wherever they are. The kiosk screen only helps someone
  // still looking at it, and waiting for an answer is exactly when attention
  // wanders — so every outcome, including a decline, is pushed to whatever
  // device they checked in on.
  if (patch.status && patch.status !== "pending") {
    try {
      await fetch("/api/visits/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify({ requestId }),
      });
    } catch (error) {
      console.error(
        "[visitor-app] responded, but could not notify the visitor:",
        error
      );
    }
  }

  // The visitor has already been told the outcome by the write above, so a
  // calendar failure is logged and swallowed rather than surfaced as a failed
  // approval. A postponed visit gets a calendar slot too — that's the whole
  // point of postponing rather than declining — just at the rescheduled time.
  // Anything lost here is picked up again by the calendar's own backfill.
  if (patch.status === "approved" || patch.status === "postponed") {
    try {
      await addVisitToCalendar(requestId);
    } catch (error) {
      console.error(
        "[visitor-app] responded, but could not add it to the calendar:",
        error
      );
    }
  }
}
