/**
 * Runs once when the server process starts. This app is self-hosted as a
 * long-running Node process (not deployed serverless), so a plain interval
 * here is what actually keeps running between requests — a Vercel-style
 * cron endpoint would have nothing to trigger it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.NODE_ENV !== "production") return;

  const { sendDueMeetingReminders } = await import("@/src/lib/meeting-reminders");

  const CHECK_INTERVAL_MS = 60_000;

  setInterval(() => {
    sendDueMeetingReminders().catch((error) => {
      console.error("[meeting-reminders] Check failed:", error);
    });
  }, CHECK_INTERVAL_MS);
}
