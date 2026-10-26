# OpenDazz web

Live app: **https://opendazz.vercel.app**. Vite, TypeScript and Tailwind serve a static frontend; the shared Rust engine runs in WebAssembly. Media processing stays on the device.

## Run locally

Use Node.js 24, matching CI. From `web/`:

```sh
npm ci
npm test
npm run build
npm run preview
```

Open the URL printed by Vite. `prebuild` synchronizes the repository's library and FFmpeg browser runtime into `public/`. The committed `src/pkg/` package lets the web app build without installing Rust tooling.

`npm run dev` also synchronizes those assets, then starts Vite. The current dev-server path has a known import-analysis issue with `/ffmpeg/classes.js`; use the production build and preview for the working photo/video workflow. This does not affect the production build.

After changing Rust engine code, rebuild the WASM package from the **repository root** with `wasm-pack` installed:

```sh
wasm-pack build crates/opendazz-wasm --target bundler \
  --out-dir ../../web/src/pkg
```

## Product and implementation

- **Simple:** nine curated Fuji-first photo recipes; separate CX405 and VHS effects. Recipe identity, artwork, labels and media grouping live in `src/simple-presets.ts`.
- **Pro:** full catalogue, search/brand/type filters, recipe provenance and adjustment sliders.
- **Preview/export:** compare original and processed pixels, export photos as PNG or develop clips into MP4. Both modes preserve the recipe's photo-processing profile; video uses the legacy processing override.
- **Assets:** `scripts/sync-library.mjs` copies `../library` before dev/build. Recipes and LUTs are fetched when needed. Original generated camera artwork and responsive derivatives are documented in `../design/camera-assets/manifest.json`.
- **Style:** Graphite Darkroom, Instrument Sans, shared graphite surfaces and restrained silver controls. Desktop uses a two-column camera shelf; mobile keeps a substantial preview and reachable export controls before the shelf.

## Browser limits

Photos are scaled to a maximum long edge of **1920px**. Format decoding depends on the browser; HEIC/HEIF conversion loads on demand. JPEG and PNG are useful fallbacks for unsupported images.

Video takes the WebCodecs route when supported (up to **120 seconds**) and otherwise uses the FFmpeg compatibility route (up to **45 seconds**). Both scale processing to at most **854px wide**. CX405 development always uses FFmpeg for its audio chain. Codec, container, memory and hardware support vary; trim longer clips first. CLI video processing requires a local FFmpeg installation.

## Validation and hosting

[UI/export verification](../docs/verification/simple-shelf/README.md) records actual desktop/mobile screenshots, all-nine sample renders, mode parity and a decoded short MP4. [Design QA](../design-qa.md) documents the selected visual target and accepted differences. These are bounded regression checks, not claims of exact camera matching.

Production frontend root: `web`; build command: `npm run build`. Existing hosting settings and Git integration are managed separately. Documentation changes do not rename hosting projects or modify infrastructure. See the root [license and credits](../README.md#license-and-credits) before reusing bundled looks.
