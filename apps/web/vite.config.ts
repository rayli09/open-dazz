import { createHash } from "node:crypto";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), wasm(), ...(mode === "production" ? [{
    name: "remote-luts",
    async writeBundle(options) {
      if (!options.dir) throw new Error("Missing build output directory");
      const library = join(options.dir, "library");
      const manifest = readFileSync(join(library, "lut-manifest.json"));
      const hash = createHash("sha256").update(manifest).digest("hex");
      const url = `https://dazz-assets.openpromo.app/manifests/${hash}.json`;
      let verified = false, lastStatus = "unavailable";
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const response = await fetch(url, { cache: "no-store" });
          lastStatus = `HTTP ${response.status}`;
          if (response.ok && Buffer.from(await response.arrayBuffer()).equals(manifest)) {
            verified = true;
            break;
          }
        } catch (error) { lastStatus = String(error); }
        if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (!verified) throw new Error(`LUT assets are not published (${lastStatus}); run the bucket publisher before building`);
      function removeLuts(dir: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const file = join(dir, entry.name);
          if (entry.isDirectory()) removeLuts(file);
          else if (entry.name.endsWith(".cube.gz")) rmSync(file);
        }
      }
      removeLuts(library);
    },
  }] : []), ...(mode === "desktop" ? [{
    name: "desktop-local-only",
    transformIndexHtml(html: string) { return html.replace(/<link[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/g, ""); },
  }] : [])],
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        materials: fileURLToPath(new URL("./materials.html", import.meta.url)),
      },
    },
  },
  worker: { format: "es", plugins: () => [wasm()] },
}));
