import nodemailer from "nodemailer";

/**
 * Sends mail from info@pcred.in, over the same GoDaddy Workspace Email SMTP
 * server the main PCRED website's contact form already uses.
 */

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

export const HAS_SMTP_CONFIG = Boolean(SMTP_USER && SMTP_PASS);

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!HAS_SMTP_CONFIG) {
    throw new Error("SMTP is not configured — set SMTP_USER and SMTP_PASS.");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtpout.secureserver.net",
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }

  return transporter;
}

export async function sendMail(options: {
  to: string;
  cc?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; path: string; cid: string }[];
  /** Defaults to a no-reply address — these are automated notifications, not
      an inbox anyone reads, so a reply should bounce rather than land
      somewhere unmonitored. Pass a real address to override this. */
  replyTo?: string;
}) {
  const { replyTo = "no-reply@pcred.in", ...rest } = options;

  await getTransporter().sendMail({
    from: `"PCRED" <${SMTP_USER}>`,
    replyTo,
    ...rest,
  });
}
