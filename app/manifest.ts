import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PCRED",
    short_name: "PCRED",
    description:
      "Front-desk visitor check-in for the PCRED office. Approve, decline or postpone a visitor from your phone.",
    // Staff are who install this, so it opens on their side of the app. The
    // door tablet is a fixed device — run it in the browser's kiosk mode at
    // "/" rather than installing it.
    start_url: "/staff",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf9",
    theme_color: "#045178",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        // Padded so Android can crop it to any shape without clipping the mark.
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "My calendar",
        url: "/staff/calendar",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Front desk kiosk",
        url: "/",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
