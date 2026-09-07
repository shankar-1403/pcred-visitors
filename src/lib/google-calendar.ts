import { JWT } from "google-auth-library";
import type { BusyInterval } from "./availability";

/**
 * Google Calendar access, server-side only.
 *
 * Uses a service account with domain-wide delegation, so your Workspace admin
 * approves once for the organisation and no staff member ever clicks through
 * an OAuth screen. The service account impersonates the person whose calendar
 * is being read.
 *
 * Availability is read through freeBusy, never events.list — that returns only
 * the blocks of time someone is occupied, with no titles, attendees or
 * details. A stranger at the front desk must never be able to infer who you
 * are meeting.
 */

const CLIENT_EMAIL = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_CALENDAR_PRIVATE_KEY?.replace(
  /\\n/g,
  "\n"
);

export const OFFICE_TIMEZONE = process.env.OFFICE_TIMEZONE || "Asia/Kolkata";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
];

export const HAS_CALENDAR_CONFIG = Boolean(CLIENT_EMAIL && PRIVATE_KEY);

/** A JWT client impersonating one staff member. */
function clientFor(staffEmail: string): JWT {
  if (!HAS_CALENDAR_CONFIG) {
    throw new Error("Google Calendar is not configured.");
  }

  return new JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: SCOPES,
    // Domain-wide delegation: act as this person.
    subject: staffEmail,
  });
}

async function authorizedFetch(
  staffEmail: string,
  url: string,
  init: RequestInit
) {
  const client = clientFor(staffEmail);
  const { token } = await client.getAccessToken();

  if (!token) throw new Error("Could not obtain a Google access token.");

  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Calendar ${response.status}: ${body.slice(0, 400)}`);
  }

  return response.json();
}

/**
 * Busy blocks for one person between two times.
 *
 * Throws if the calendar can't be reached — callers decide whether to fall
 * back to working hours or surface the failure.
 */
export async function fetchBusy(
  staffEmail: string,
  timeMin: number,
  timeMax: number
): Promise<BusyInterval[]> {
  const data = (await authorizedFetch(
    staffEmail,
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      body: JSON.stringify({
        timeMin: new Date(timeMin).toISOString(),
        timeMax: new Date(timeMax).toISOString(),
        timeZone: OFFICE_TIMEZONE,
        items: [{ id: staffEmail }],
      }),
    }
  )) as {
    calendars?: Record<
      string,
      { busy?: { start: string; end: string }[]; errors?: { reason: string }[] }
    >;
  };

  const calendar = data.calendars?.[staffEmail];

  if (calendar?.errors?.length) {
    throw new Error(
      `Calendar unavailable for ${staffEmail}: ${calendar.errors
        .map((error) => error.reason)
        .join(", ")}`
    );
  }

  return (calendar?.busy ?? []).map((interval) => ({
    start: new Date(interval.start).getTime(),
    end: new Date(interval.end).getTime(),
  }));
}

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

/**
 * One person's actual events for a window.
 *
 * Unlike freeBusy this returns titles, so it is only ever used to show someone
 * **their own** calendar. The caller is responsible for having proved who they
 * are — never pass in an address that came from a request body.
 */
export async function fetchEvents(
  staffEmail: string,
  timeMin: number,
  timeMax: number
): Promise<CalendarEvent[]> {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      staffEmail
    )}/events`
  );

  url.searchParams.set("timeMin", new Date(timeMin).toISOString());
  url.searchParams.set("timeMax", new Date(timeMax).toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");

  const data = (await authorizedFetch(staffEmail, url.toString(), {
    method: "GET",
  })) as {
    items?: {
      id?: string;
      summary?: string;
      location?: string;
      status?: string;
      extendedProperties?: { private?: Record<string, string> };
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }[];
  };

  return (data.items ?? [])
    .filter((item) => item.status !== "cancelled" && item.id)
    .map((item) => {
      const allDay = Boolean(item.start?.date && !item.start?.dateTime);

      const startRaw = item.start?.dateTime ?? item.start?.date;
      const endRaw = item.end?.dateTime ?? item.end?.date;

      return {
        id: item.id!,
        title: item.summary?.trim() || "(no title)",
        start: startRaw ? new Date(startRaw).getTime() : 0,
        end: endRaw ? new Date(endRaw).getTime() : 0,
        allDay,
        location: item.location,
        isVisit: item.extendedProperties?.private?.pcredVisit === "1",
      };
    })
    .filter((event) => event.start && event.end);
}

/** Creates an ordinary event the staff member typed in themselves. */
export async function createOwnEvent({
  staffEmail,
  title,
  start,
  end,
  location,
}: {
  staffEmail: string;
  title: string;
  start: number;
  end: number;
  location?: string;
}): Promise<string | null> {
  const data = (await authorizedFetch(
    staffEmail,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      staffEmail
    )}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: title,
        location: location || undefined,
        start: {
          dateTime: new Date(start).toISOString(),
          timeZone: OFFICE_TIMEZONE,
        },
        end: {
          dateTime: new Date(end).toISOString(),
          timeZone: OFFICE_TIMEZONE,
        },
      }),
    }
  )) as { id?: string };

  return data.id ?? null;
}

/**
 * Writes the approved visit into the staff member's calendar so the slot is
 * blocked and nobody double-books it.
 *
 * Returns the created event id, or null if the write failed — a calendar
 * problem must never invalidate an approval the visitor has already been told
 * about.
 */
export async function createVisitEvent({
  staffEmail,
  start,
  end,
  visitorName,
  company,
  purpose,
  note,
  visitorPhone,
}: {
  staffEmail: string;
  start: number;
  end: number;
  visitorName: string;
  company?: string;
  purpose?: string;
  note?: string;
  visitorPhone?: string;
}): Promise<string | null> {
  try {
    const description = [
      purpose ? `Purpose: ${purpose}` : "",
      company ? `Company: ${company}` : "",
      visitorPhone ? `Phone: ${visitorPhone}` : "",
      note ? `Note: ${note}` : "",
      "",
      "Booked at the front desk.",
    ]
      .filter(Boolean)
      .join("\n");

    const data = (await authorizedFetch(
      staffEmail,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        staffEmail
      )}/events`,
      {
        method: "POST",
        body: JSON.stringify({
          summary: `Visitor: ${visitorName}${company ? ` (${company})` : ""}`,
          description,
          start: {
            dateTime: new Date(start).toISOString(),
            timeZone: OFFICE_TIMEZONE,
          },
          end: {
            dateTime: new Date(end).toISOString(),
            timeZone: OFFICE_TIMEZONE,
          },
          // The visitor is not a Google account and must not be emailed an
          // invite — this is a block on the staff member's own calendar.
          attendees: [],
          reminders: { useDefault: true },
          // Lets the in-app calendar tell a front-desk booking apart from an
          // ordinary meeting the person scheduled themselves.
          extendedProperties: { private: { pcredVisit: "1" } },
        }),
      }
    )) as { id?: string };

    return data.id ?? null;
  } catch (error) {
    console.error("[visitor-app] Could not create calendar event:", error);
    return null;
  }
}
