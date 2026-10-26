import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), wasm(), ...(mode === "desktop" ? [{
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
