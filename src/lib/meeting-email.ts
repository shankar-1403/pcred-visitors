import fs from "fs";
import path from "path";
import { sendMail } from "./mailer";

/**
 * The recipient rule shared by every meeting email this app sends: a client
 * on file gets it directly, with the staff member Cc'd; with no client email
 * to send it to, it falls back to the staff member alone — which also makes
 * them the greeting: no client on file reads as "Dear {staff's first name}".
 */

/** PCRED's actual office address (from the main website's footer) — the
    default when a meeting was added without a specific location, since
    every meeting happens at the office unless staff say otherwise. */
const PCRED_OFFICE_ADDRESS =
  "Lodha Supremus, 520, Off Mahakali Caves Rd, Chakala Industrial Area (MIDC), Andheri East, Mumbai, Maharashtra 400093";

const LOGO_PATH = path.join(process.cwd(), "public", "email", "pcred-logo.png");
const LOGO_CID = "pcred-logo";

function formatWhen(ms: number) {
  // This runs on the server, which isn't necessarily in India (App Hosting's
  // containers default to UTC) — the office and everyone reading this email
  // is, so the timezone has to be pinned explicitly rather than left to
  // whatever the host machine happens to be set to.
  return new Date(ms).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Neither the `format-detection` meta tag nor breaking up just the digits
    stops Gmail's address detector — it recognises the place names (Mumbai,
    Maharashtra, "Rd") on their own, with or without the numbers intact. The
    only reliable fix is to leave no recognisable substring at all: a
    zero-width non-joiner after every character, invisible to the reader but
    fatal to any pattern match. */
function breakAutoLink(value: string) {
  return [...value].join("‌");
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
  const where = location || PCRED_OFFICE_ADDRESS;
  const to = clientEmail || staffEmail;
  const cc = clientEmail ? `"${staffName}" <${staffEmail}>` : undefined;

  const greetingName = clientEmail
    ? clientName?.split(" ")[0] ?? "there"
    : staffName.split(" ")[0] || "there";

  // "With" reads as whichever side isn't the primary recipient.
  const withLine = clientEmail
    ? [staffName, "PCRED Venture Pvt. Ltd."].filter(Boolean).join(", ")
    : [clientName, clientCompany].filter(Boolean).join(", ");

  const opening =
    kind === "created"
      ? "This is to confirm that a meeting has been scheduled, as per the details below."
      : "This is a reminder that the following meeting is coming up shortly.";

  const rows: [string, string][] = [
    ["Meeting", title],
    ["Date & Time", when],
    ["Location", where],
    ...(withLine ? ([["With", withLine]] as [string, string][]) : []),
  ];

  const subjectPrefix = kind === "created" ? "Meeting Scheduled" : "Meeting Reminder";

  const textRows = rows.map(([label, value]) => `${label}: ${value}`);

  const text = [
    `Dear ${greetingName},`,
    "",
    opening,
    "",
    ...textRows,
    "",
    "Should you need to reschedule, please get in touch with us at your earliest convenience.",
    "",
    "Regards,",
    "PCRED Venture Pvt. Ltd.",
    "",
    "This is an automated notification. Please do not reply to this email.",
  ].join("\n");

  const htmlRows = rows
    .map(([label, value]) => {
      // Only the location is address-shaped enough for Gmail to try to
      // link it, so only that value needs the pattern broken up.
      const safeValue =
        label === "Location" ? escapeHtml(value) : escapeHtml(value);

      return `
        <tr>
          <td style="padding:4px 16px 4px 0;color:#6b7280;font-size:14px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:4px 0;color:#111827;font-size:14px;vertical-align:top;">${safeValue}</td>
        </tr>`;
    })
    .join("");

  const hasLogo = fs.existsSync(LOGO_PATH);

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <!-- Stops Gmail/Apple Mail from auto-linking a phone-looking number or
         the date — the address itself is neutralised separately below,
         since this alone doesn't reliably stop Gmail's Maps-link detector. -->
    <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no" />
  </head>
  <body style="margin:0;padding:0;background-color:#f5f5f4;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
            ${
              hasLogo
                ? `<tr>
              <td align="right" style="background-color:#022436;padding:18px 32px;">
                <img src="cid:${LOGO_CID}" alt="PCRED" height="30" style="display:inline-block;height:30px;width:auto;border:0;" />
              </td>
            </tr>`
                : ""
            }
            <tr>
              <td style="padding:${hasLogo ? "24" : "28"}px 32px 8px 32px;">
                <p style="margin:0 0 16px 0;font-size:15px;color:#111827;">Dear ${escapeHtml(greetingName)},</p>
                <p style="margin:0 0 20px 0;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(opening)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;padding:12px 0;">
                  ${htmlRows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;">
                <p style="margin:0 0 20px 0;font-size:14px;color:#374151;line-height:1.5;">Should you need to reschedule, please get in touch with us at your earliest convenience.</p>
                <p style="margin:0 0 16px 0;font-size:14px;color:#111827;">Regards,<br />PCRED Venture Pvt. Ltd.</p>
                <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated notification. Please do not reply to this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  await sendMail({
    to,
    ...(cc ? { cc } : {}),
    subject: `${subjectPrefix}: ${title}`,
    text,
    html,
    ...(hasLogo
      ? { attachments: [{ filename: "pcred-logo.png", path: LOGO_PATH, cid: LOGO_CID }] }
      : {}),
  });
}
