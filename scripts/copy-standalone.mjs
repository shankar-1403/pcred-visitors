import { cpSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");
const publicDest = join(standalone, "public");
const staticDest = join(standalone, ".next", "static");

if (!existsSync(standalone)) {
  console.warn("Standalone output not found; skipping copy.");
  process.exit(0);
}

mkdirSync(publicDest, { recursive: true });
mkdirSync(staticDest, { recursive: true });

cpSync(join(root, "public"), publicDest, { recursive: true });
cpSync(join(root, ".next", "static"), staticDest, { recursive: true });

console.log("Copied public/ and .next/static into standalone output.");
