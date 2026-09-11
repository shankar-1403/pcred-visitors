/**
 * Two-note chime built with the Web Audio API — deliberately no audio file, so
 * there is no asset to ship, cache-bust or 404. Plays once, not on a repeating
 * loop — a single chime reads as a notification; a repeating one reads as an
 * alarm.
 *
 * Shared by the staff alert and the kiosk, so a visitor who has looked away
 * hears their answer land the same way the person they're visiting does.
 */
export function playChime() {
  if (typeof window === "undefined") return;

  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioCtor) return;

  try {
    const ctx = new AudioCtor();

    // Autoplay policy: if the user hasn't interacted with the page yet the
    // context stays suspended and the chime is simply skipped.
    void ctx.resume?.();

    [
      { frequency: 880, at: 0 },
      { frequency: 1174.66, at: 0.16 },
    ].forEach(({ frequency, at }) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + at + 0.42
      );

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime + at);
      oscillator.stop(ctx.currentTime + at + 0.45);
    });

    setTimeout(() => void ctx.close?.(), 1200);
  } catch {
    // A blocked or unavailable audio context must never break the alert.
  }
}
