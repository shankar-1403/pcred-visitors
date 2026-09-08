import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Firebase App Hosting's Cloud Run container has no `sharp` and a
  // read-only filesystem, so next/image's built-in optimizer (which needs
  // both) silently fails there even though it works in local dev. These are
  // all small, already-compressed local files (logo, icons) — nothing is
  // lost by serving them as-is instead of through the broken optimizer.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
