# open-fuji

An open app for quickly applying **film simulations and style filters** — recipes and LUTs, camera-agnostic.

Pick a look (Kodak Portra, Classic Chrome, CineStill 800T, a VHS/camcorder vibe, your own recipe), preview it on your photo or video, tweak, export. No camera vendor lock-in: a "recipe" here is data, not a camera menu.

## Status

M1 scaffold is live (2026-10-25): Rust workspace with a working core + CLI,
an end-to-end example, and a Vite web shell. Tests + clippy + a WASM build
check run in CI.

## Architecture

One Rust core, three surfaces:

- **`crates/openfuji-core`** — the engine: recipe parsing, `.cube` 3D LUT
  (trilinear), white balance, tone, halation, grain. No file IO; operates on
  image buffers, and is kept WASM-clean (CI builds it for
  `wasm32-unknown-unknown` on every push).
- **`crates/openfuji-cli`** — `openfuji apply in.png out.png --recipe r.json`
  (batch work, pipeline testing, golden-image diffs).
- **`web/`** — Vite + TypeScript app; the same core compiled to WASM runs
  in-browser (M2). Static hosting only (GitHub Pages / Cloudflare Pages) —
  free, and images never leave the user's machine.

Later surfaces (Tauri desktop, mobile via FFI) reuse the same core instead of
reimplementing the look in another language.

Try the CLI:

```sh
cargo run -p openfuji-cli -- apply examples/test-scene.png /tmp/out.png \
  --recipe recipes/example-faded-warm.json
```

## Design principles

- **Data-first.** Looks are portable data: a recipe = a base look (LUT) + engine parameters (grain, halation, tone, white balance shifts) in JSON. Anyone can author, share, and fork a recipe without touching app code.
- **Engine-agnostic core.** The rendering core consumes standard formats — `.cube` and HaldCLUT — so existing open LUT packs drop in unchanged (ffmpeg `lut3d`/`haldclut` compatible).
- **Open data, credited.** Seed material comes from open sources (see below); every imported pack keeps its license and attribution.

## Seed sources

- [open-fuji-recipes](https://github.com/matthieurobin/open-fuji-recipes) — Fujifilm film simulation recipes as data
- [EmulsionPresets](https://github.com/peva3/EmulsionPresets) — 451 open-source film emulation presets (Kodak, Fuji, Ilford, CineStill, ...)
- [hald-clut](https://github.com/cedeber/hald-clut) — HaldCLUT collection
- G'MIC film emulation CLUTs (Pat David's film sets; Stuart Sowerby's Fuji X-Trans III set)
- [Fuji X Weekly](https://fujixweekly.com) — the recipe source of truth upstream (350+ recipes)

## Layout

- `recipes/` — recipe JSON files + schema notes
- `luts/` — bundled LUT packs (each with its own LICENSE/attribution)

## Roadmap

1. ✅ Recipe schema v0 + reference engine + CLI (M1)
2. Recipe collection: importers for community-curated packs (Fuji X Weekly
   recipes via open-fuji-recipes, EmulsionPresets / Lightroom packs,
   HaldCLUT packs), usable from the CLI (M2, in progress)
3. WASM build of the core wired into the web app: drag-drop, recipe picker,
   before/after slider, export (M3, deferred by decision 2026-10-25 — the
   Vite starter in web/ stands until then)
4. Video: frame pipeline via the CLI + ffmpeg (M4, exploratory)

## Name

Not affiliated with or endorsed by FUJIFILM Corporation. "Fuji" here is shorthand for the film-simulation tradition this project celebrates; the app is camera- and vendor-agnostic.

## License

MIT (code). Bundled data packs keep their own licenses — see each pack's folder.
