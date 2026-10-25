# open-fuji

An open app for quickly applying **film simulations and style filters** — recipes and LUTs, camera-agnostic.

Pick a look (Kodak Portra, Classic Chrome, CineStill 800T, a VHS/camcorder vibe, your own recipe), preview it on your photo or video, tweak, export. No camera vendor lock-in: a "recipe" here is data, not a camera menu.

## Status

Scaffolding — repo created 2026-10-25. Design and a v0 recipe schema are being sketched; no app code yet.

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

## Roadmap (draft)

1. Recipe schema v0 (see `recipes/README.md`)
2. Reference engine prototype: apply recipe + LUT to a still image, CLI first
3. App shell (platform TBD)
4. Importers: Fuji X Weekly recipes, Lightroom preset packs, HaldCLUT packs

## Name

Not affiliated with or endorsed by FUJIFILM Corporation. "Fuji" here is shorthand for the film-simulation tradition this project celebrates; the app is camera- and vendor-agnostic.

## License

MIT (code). Bundled data packs keep their own licenses — see each pack's folder.
