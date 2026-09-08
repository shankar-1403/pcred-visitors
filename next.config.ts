import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Firebase App Hosting runs the standalone server output. Next.js doesn't
  // copy public/ or .next/static into that output on its own — the
  // `postbuild` script (scripts/copy-standalone.mjs) does that, the same
  // fix already used on the PCRED website project for this exact problem.
  output: "standalone",
};

export default nextConfig;
