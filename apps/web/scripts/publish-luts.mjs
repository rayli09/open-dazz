// Publish immutable content-addressed LUTs before a Vercel production build.
import { S3Client } from "bun";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const account = "095f96ce70e75bbf88dea585b6a320a5";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const accessKeyId = process.env.DAZZ_R2_ACCESS_KEY;
const token = process.env.DAZZ_R2_API_TOKEN;
if (!accessKeyId || !token) throw new Error("Missing bucket-scoped DAZZ_R2 credentials");
const client = new S3Client({
  accessKeyId, secretAccessKey: createHash("sha256").update(token).digest("hex"),
  endpoint: `https://${account}.r2.cloudflarestorage.com`, bucket: "opendazz-luts", region: "auto",
});
const manifestBytes = readFileSync(join(root, "apps/web/public/library/lut-manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const entries = Object.entries(manifest);
let next = 0, uploaded = 0;
async function worker() {
  while (next < entries.length) {
    const [path, hash] = entries[next++];
    const key = `${hash}.cube.gz`;
    const file = client.file(key);
    if (await file.exists()) continue;
    const data = readFileSync(join(root, path));
    if (createHash("sha256").update(data).digest("hex") !== hash) throw new Error(`LUT changed during publishing: ${path}`);
    const response = await fetch(file.presign({ method: "PUT" }), {
      method: "PUT", body: data,
      headers: { "content-type": "application/gzip", "cache-control": "public, max-age=31536000, immutable" },
    });
    if (!response.ok) throw new Error(`Failed publishing LUT ${path}: HTTP ${response.status}`);
    uploaded++;
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
const marker = client.file(`manifests/${manifestHash}.json`);
if (!(await marker.exists())) {
  const response = await fetch(marker.presign({ method: "PUT" }), {
    method: "PUT", body: manifestBytes,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=31536000, immutable" },
  });
  if (!response.ok) throw new Error(`Failed publishing LUT manifest: HTTP ${response.status}`);
}
console.log(`LUT assets: ${entries.length} verified, ${uploaded} uploaded; manifest ${manifestHash}`);
