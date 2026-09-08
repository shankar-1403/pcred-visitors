import { adminDb, HAS_ADMIN_CONFIG } from "./firebase-admin";
import { HAS_SMTP_CONFIG } from "./mailer";
import { sendMeetingEmail } from "./meeting-email";

/**
 * Every 15-minutes-out, un-reminded meeting on a staff member's own calendar
 * gets a one-time email — but only meetings with a real lead time to be
 * reminded about: one they added themselves, or a visit they postponed to a
 * later slot. An instantly-approved "meet now" walk-in has no such lead time,
 * so it never earns a reminder.
 */

const REMINDER_WINDOW_MINUTES = 15;

interface CalendarEventRecord {
  title?: string;
  start?: number;
  location?: string;
  reminderSentAt?: number | null;
  source?: "manual" | "approved" | "postponed";
  clientName?: string;
  clientEmail?: string;
  clientCompany?: string;
}

interface StaffRecord {
  name?: string;
  email?: string;
}

export async function sendDueMeetingReminders(): Promise<void> {
  if (!HAS_ADMIN_CONFIG || !HAS_SMTP_CONFIG) return;

  const db = adminDb();

  const [staffSnapshot, eventsSnapshot] = await Promise.all([
    db.ref("staff").get(),
    db.ref("calendar_events").get(),
  ]);

  const staff = (staffSnapshot.val() ?? {}) as Record<string, StaffRecord>;
  const eventsByStaff = (eventsSnapshot.val() ?? {}) as Record<
    string,
    Record<string, CalendarEventRecord> | null
  >;

  const now = Date.now();

  for (const [staffId, events] of Object.entries(eventsByStaff)) {
    const email = staff[staffId]?.email?.trim();
    if (!email || !events) continue;

    for (const [eventId, event] of Object.entries(events)) {
      if (!event?.start || event.reminderSentAt) continue;

      // An instant "meet now" approval has already happened by the time
      // anyone could read a reminder — only a planned meeting is worth one.
      if (event.source === "approved") continue;

      const minutesUntilStart = (event.start - now) / 60_000;
      if (minutesUntilStart <= 0 || minutesUntilStart > REMINDER_WINDOW_MINUTES) {
        continue;
      }

      try {
        await sendMeetingEmail({
          kind: "reminder",
          staffName: staff[staffId]?.name ?? "",
          staffEmail: email,
          clientName: event.clientName,
          clientEmail: event.clientEmail,
          clientCompany: event.clientCompany,
          title: event.title || "the meeting",
          start: event.start,
          location: event.location,
        });

        await db.ref(`calendar_events/${staffId}/${eventId}/reminderSentAt`).set(now);
      } catch (error) {
        console.error(
          `[meeting-reminders] Could not email ${email} for event ${eventId}:`,
          error
        );
      }
    }
  }
}
