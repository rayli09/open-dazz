// Copy the repo library into public/ so the dev server and the build can
// serve catalog.json, recipes and LUTs as static files. Runs before
// `bun run dev` and `bun run build` (also on Vercel, where the build
// runs inside the repo checkout, so ../../library exists).
import { cpSync, existsSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(webRoot, "..", "..", "library");
const dst = join(webRoot, "public", "library");
if (existsSync(src)) {
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });
  const manifest = {};
  function collect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) collect(file);
      else if (entry.name.endsWith(".cube.gz")) {
        const key = `library/${relative(src, file).split("\\").join("/")}`;
        manifest[key] = createHash("sha256").update(readFileSync(file)).digest("hex");
      }
    }
  }
  collect(src);
  writeFileSync(join(dst, "lut-manifest.json"), JSON.stringify(manifest));
  console.log("synced library -> public/library");
  if (process.env.VERCEL_ENV === "production") await import("./publish-luts.mjs");
} else {
  throw new Error("library/ not found at the repository root");
}
