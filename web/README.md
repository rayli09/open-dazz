# web — the Photo Workshop (Vite + Tailwind v4 + WASM)

Live: https://opendazz.vercel.app — a film-development bench in the
browser. Design language: **paper workshop, squared** — cream paper,
ink, hairline rules, serif display type (Fraunces), mono ledger labels
(IBM Plex Mono), hard offset shadows, and a strict no-rounded-corners
rule (`border-radius: 0`, enforced globally in `src/style.css`).

## How it works

- `src/pkg/` is `opendazz-core` compiled to WebAssembly
  (`crates/opendazz-wasm`, built with wasm-pack, target `bundler`).
  The app hands it RGBA pixels + a recipe JSON + the base LUT's `.cube`
  text; it hands back developed pixels. No uploads — everything is
  developed locally in the visitor's browser.
- `scripts/sync-library.mjs` copies `../library` into `public/library`
  before dev/build, so `catalog.json`, recipe JSONs and `.cube` files
  are served as static files and fetched lazily (only the selected
  look's recipe + LUT are downloaded).
- Layout: the Cabinet (looks grouped by brand, official first) · the
  Bench (photo on a paper mat, before/after split by dragging) · the
  Ledger (provenance + strength/grain/halation/temp/tint sliders,
  PNG export at up to 1920px).

## Develop

```sh
npm install
npm run dev        # syncs ../library, then Vite dev server
npm run build      # tsc + vite build
```

Rebuild the WASM package after changing the Rust core:

```sh
wasm-pack build crates/opendazz-wasm --target bundler \
  --out-dir ../../web/src/pkg     # run from the repository root
```

## Deployment

The verified production URL is https://opendazz.vercel.app. The source
repository is `rayli09/open-dazz`; the frontend root is `web` and the build
command is `npm run build`. Existing hosting settings and Git integration
are managed separately. Renaming the CLI/crates/WASM package does not rename
hosting projects or change infrastructure settings.
