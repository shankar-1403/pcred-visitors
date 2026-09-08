import { sendMail } from "./mailer";

/**
 * The recipient rule shared by every meeting email this app sends: a client
 * on file gets it directly, with the staff member Cc'd; with no client email
 * to send it to, it falls back to the staff member alone.
 */

function formatWhen(ms: number) {
  return new Date(ms).toLocaleString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export async function sendMeetingEmail(options: {
  /** "created" fires once, right when the event is saved. "reminder" fires
      once, shortly before it starts. Only the wording differs. */
  kind: "created" | "reminder";
  staffName: string;
  staffEmail: string;
  clientName?: string;
  clientEmail?: string;
  clientCompany?: string;
  title: string;
  start: number;
  location?: string;
}) {
  const {
    kind,
    staffName,
    staffEmail,
    clientName,
    clientEmail,
    clientCompany,
    title,
    start,
    location,
  } = options;

  const when = formatWhen(start);
  const to = clientEmail || staffEmail;
  const cc = clientEmail ? `"${staffName}" <${staffEmail}>` : undefined;

  const greetingName = clientEmail
    ? clientName?.split(" ")[0] ?? "there"
    : staffName.split(" ")[0] || "there";

  const intro = kind === "created" ? "This confirms that" : "This is a reminder that";
  const verb = kind === "created" ? "has been scheduled for" : "is scheduled for";

  const body = clientEmail
    ? `${intro} "${title}" with ${staffName || "PCRED"} ${verb} ${when}` +
      (location ? ` at ${location}.` : ".")
    : `${intro} "${title}" ${verb} ${when}` +
      (location ? ` at ${location}.` : ".") +
      (clientName
        ? `\nWith: ${[clientName, clientCompany].filter(Boolean).join(", ")}`
        : "");

  const subjectPrefix = kind === "created" ? "Scheduled" : "Reminder";

  await sendMail({
    to,
    ...(cc ? { cc } : {}),
    subject: `${subjectPrefix}: ${title}`,
    text: [`Hi ${greetingName},`, "", body, "", "PCRED Venture Pvt. Ltd."].join("\n"),
  });
}
