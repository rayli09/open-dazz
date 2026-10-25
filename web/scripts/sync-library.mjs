// Copy the repo library into public/ so the dev server and the build can
// serve catalog.json, recipes and LUTs as static files. Runs before
// `npm run dev` and `npm run build` (also on Vercel, where the build
// runs inside the repo checkout, so ../library exists).
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(webRoot, "..", "library");
const dst = join(webRoot, "public", "library");
if (existsSync(src)) {
  cpSync(src, dst, { recursive: true });
  console.log("synced library -> public/library");
} else {
  console.warn("library/ not found next to web/ — catalog will 404");
}
