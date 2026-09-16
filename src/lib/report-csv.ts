import type { CalendarEvent } from "./data";

/** Anything with a comma, a quote or a line break has to be quoted, and a
    quote inside the value is doubled — otherwise one visitor's address with a
    comma in it silently shifts every later column along by one. */
function cell(value: string | undefined | null) {
  const text = String(value ?? "");

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A hard column width, in characters, for free text a staff member typed —
    the Notes column, which otherwise runs however long one sentence does and
    stretches the whole sheet sideways. Breaks on the nearest space where
    there is one; a run with no spaces at all (a pasted link, a typo with no
    gaps) is cut mid-word rather than left to keep going. A spreadsheet still
    needs "wrap text" turned on to show every line at once, but the cell
    itself no longer forces the column wider to fit it. */
const NOTES_WRAP_WIDTH = 60;

function wrapNotes(value: string | undefined) {
  const text = (value ?? "").trim();
  if (text.length <= NOTES_WRAP_WIDTH) return text;

  const lines: string[] = [];
  let rest = text;

  while (rest.length > NOTES_WRAP_WIDTH) {
    const breakAt = rest.lastIndexOf(" ", NOTES_WRAP_WIDTH);
    const cut = breakAt > 0 ? breakAt : NOTES_WRAP_WIDTH;

    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }

  lines.push(rest);
  return lines.join("\n");
}

const DATE_FMT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const TIME_FMT = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

/** Only a visit has an outcome. A meeting staff booked themselves leaves the
    column empty rather than repeating what Type already says. */
const OUTCOME: Record<string, string> = {
  approved: "Approved",
  postponed: "Postponed",
};

const HEADERS = [
  "Date",
  "Start",
  "End",
  "Meeting",
  "Type",
  "Outcome",
  "Name",
  "Company",
  "Phone",
  "Email",
  "Purpose",
  "Notes",
];

/**
 * A date range of meetings as a spreadsheet.
 *
 * Ordered oldest first, which is how a month gets read back at the end of it,
 * rather than newest first like the screen.
 */
export function buildEventsCsv(events: CalendarEvent[]): string {
  const rows = [...events]
    .sort((a, b) => a.start - b.start)
    .map((event) =>
      [
        DATE_FMT.format(event.start),
        event.allDay ? "All day" : TIME_FMT.format(event.start),
        event.allDay ? "All day" : TIME_FMT.format(event.end),
        event.title,
        event.isVisit ? "Visitor" : "Added by staff",
        OUTCOME[event.source ?? "manual"] ?? "",
        event.clientName,
        event.clientCompany,
        event.clientPhone,
        event.clientEmail,
        event.location,
        wrapNotes(event.notes),
      ]
        .map(cell)
        .join(",")
    );

  // CRLF: Excel is the likely destination, and it is the line ending the CSV
  // convention actually specifies.
  return [HEADERS.join(","), ...rows].join("\r\n");
}
