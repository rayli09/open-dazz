// Copy the ffmpeg.wasm runtime into apps/web/public/ffmpeg so the web
// app can load it from its own origin. Why not import it through
// the bundle: @ffmpeg/ffmpeg's worker.js imports its sibling ESM
// files by relative path, which breaks once Vite flattens them
// into dist/assets. A verbatim copy keeps every relative import
// working (worker.js, classes.js, ffmpeg-core.js, ffmpeg-core.wasm).
// The copy is build-time only — public/ffmpeg/ is gitignored —
// and the ~31MB core is fetched by the browser only when a user
// actually develops a video, never on a normal photo visit.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ffmpeg = dirname(fileURLToPath(import.meta.resolve("@ffmpeg/ffmpeg")));
const core = dirname(fileURLToPath(import.meta.resolve("@ffmpeg/core")));
const out = join(here, "..", "public", "ffmpeg");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(ffmpeg, out, {
  recursive: true,
  filter: (src) => !src.endsWith(".d.ts") && !src.endsWith(".mts") && !src.endsWith(".mjs"),
});
cpSync(join(core, "ffmpeg-core.js"), join(out, "ffmpeg-core.js"));
cpSync(join(core, "ffmpeg-core.wasm"), join(out, "ffmpeg-core.wasm"));
console.log("ffmpeg runtime synced to public/ffmpeg/");
