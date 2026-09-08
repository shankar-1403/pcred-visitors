import { adminDb, HAS_ADMIN_CONFIG } from "./firebase-admin";
import { sendMail, HAS_SMTP_CONFIG } from "./mailer";

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

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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

      const staffName = staff[staffId]?.name ?? "";
      const title = event.title || "the meeting";
      const time = formatTime(event.start);
      const clientEmail = event.clientEmail?.trim();

      // A client on file gets the reminder directly, with the staff member
      // Cc'd; with no client email to send it to, it falls back to the staff
      // member alone.
      const to = clientEmail || email;
      const cc = clientEmail ? `"${staffName}" <${email}>` : undefined;

      const greetingName = clientEmail
        ? event.clientName?.split(" ")[0] ?? "there"
        : staffName.split(" ")[0] || "there";

      const body = clientEmail
        ? `This is a reminder that "${title}" with ${staffName || "PCRED"} is scheduled for ${time} today` +
          (event.location ? ` at ${event.location}.` : ".")
        : `This is a reminder that "${title}" is scheduled for ${time} today` +
          (event.location ? ` at ${event.location}.` : ".") +
          (event.clientName ? `\nWith: ${[event.clientName, event.clientCompany].filter(Boolean).join(", ")}` : "");

      try {
        await sendMail({
          to,
          ...(cc ? { cc } : {}),
          subject: `Reminder: ${title} at ${time}`,
          text: [`Hi ${greetingName},`, "", body, "", "PCRED Venture Pvt. Ltd."].join("\n"),
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
