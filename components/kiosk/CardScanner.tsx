"use client";

import { useEffect, useRef, useState } from "react";
import type { Worker } from "tesseract.js";
import { IconCamera, IconCheck, IconX } from "@tabler/icons-react";
import { parseCardText, type ScannedContact } from "@/src/lib/card-ocr";

type ScanState =
  | "idle"
  | "starting"
  | "live"
  | "reading"
  | "denied"
  | "unsupported"
  | "failed";

export default function CardScanner({
  onScanned,
}: {
  onScanned: (contact: ScannedContact) => void;
}) {
  const [state, setState] = useState<ScanState>("idle");
  const [scannedOnce, setScannedOnce] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerPromiseRef = useRef<Promise<Worker> | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopCamera();
      workerRef.current?.terminate();
    };
  }, []);

  // The <video> only exists in the DOM once state is "live", so the stream
  // can only be attached to it after that render — not in the same tick
  // getUserMedia resolves in, when the ref is still null.
  useEffect(() => {
    if (state !== "live" || !streamRef.current || !videoRef.current) return;

    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {
      // Autoplay can be blocked on some platforms; the visitor can still tap
      // Capture once the preview appears on its own.
    });
  }, [state]);

  const getWorker = async () => {
    if (workerRef.current) return workerRef.current;

    if (!workerPromiseRef.current) {
      const { createWorker } = await import("tesseract.js");
      workerPromiseRef.current = createWorker("eng");
    }

    const worker = await workerPromiseRef.current;
    workerRef.current = worker;
    return worker;
  };

  const startScan = async () => {
    setState("starting");

    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;
      setState("live");
    } catch {
      setState("denied");
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCamera();
    setState("reading");

    try {
      const worker = await getWorker();
      const {
        data: { text },
      } = await worker.recognize(canvas);

      const contact = parseCardText(text);

      if (Object.keys(contact).length === 0) {
        setState("failed");
        return;
      }

      setScannedOnce(true);
      onScanned(contact);
      setState("idle");
    } catch {
      setState("failed");
    }
  };

  const cancelScan = () => {
    stopCamera();
    setState("idle");
  };

  return (
    <div className="flex h-full flex-col rounded-3xl border border-white/12 bg-white/[0.04] p-6">
      <h3 className="text-lg font-semibold text-white">Scan your visiting card</h3>
      <p className="mt-1 text-sm text-white/50">
        Hold your card up to the camera and capture it. Your details are read
        automatically.
      </p>

      <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/30">
        {state === "live" ? (
          <div className="relative w-full overflow-hidden rounded-2xl">
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-4/3 w-full object-cover"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-gold-300/70"
            />
          </div>
        ) : state === "reading" ? (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <span
              aria-hidden
              className="size-10 animate-spin rounded-full border-2 border-gold-300/30 border-t-gold-300"
            />
            <p className="text-sm text-white/60">Reading your card&hellip;</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-gold-300/15">
              {scannedOnce ? (
                <IconCheck className="size-7 text-gold-300" />
              ) : (
                <IconCamera className="size-7 text-gold-300" />
              )}
            </span>

            {state === "denied" ? (
              <p className="text-sm text-white/60">
                Camera access wasn&rsquo;t granted. You can still enter your
                details on the left.
              </p>
            ) : state === "unsupported" ? (
              <p className="text-sm text-white/60">
                This device can&rsquo;t open the camera here. Please enter
                your details on the left.
              </p>
            ) : state === "failed" ? (
              <p className="text-sm text-white/60">
                We couldn&rsquo;t read that card clearly. Please try again
                with better light, or enter your details on the left.
              </p>
            ) : scannedOnce ? (
              <p className="text-sm text-white/60">
                Details filled in. Capture again if you&rsquo;d like to redo
                it.
              </p>
            ) : (
              <p className="text-sm text-white/60">
                Optional. You can also just fill in the form yourself.
              </p>
            )}
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="mt-5">
        {state === "live" ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={cancelScan}
              className="flex min-h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/15 text-base font-medium text-white/70 transition-colors duration-200 hover:border-white/35 hover:text-white"
            >
              <IconX className="size-5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={capture}
              className="flex min-h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gold-300 text-base font-semibold text-brand-deep transition-all duration-200 hover:bg-gold-200"
            >
              <IconCamera className="size-5" />
              Capture
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startScan}
            disabled={state === "starting" || state === "reading"}
            className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gold-300 text-base font-semibold text-brand-deep transition-all duration-200 hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <IconCamera className="size-5" />
            {state === "starting"
              ? "Opening camera…"
              : state === "reading"
                ? "Reading card…"
                : scannedOnce || state === "failed"
                  ? "Scan again"
                  : "Open camera"}
          </button>
        )}
      </div>
    </div>
  );
}
