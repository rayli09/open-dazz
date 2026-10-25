# open-fuji roadmap — closing the gap to Dazz Cam

_Written 2026-10-25, after the Dazz-style simple mode shipped. Dazz Cam is
the benchmark for feel; this doc is the honest gap list and the order we
close it in. Principle: borrow Dazz's **system** (curation, ritual,
camera chrome), not its **skin** (photoreal camera bodies clash with our
squared paper-workshop identity — we keep our own face)._

## Why Dazz feels expensive and we don't (yet)

Dazz's 质感 comes from five things, none of which is "more filters":

1. **Every filter is a camera.** Each model (D Classic, FXN R, CT2F…)
   has a name, a drawn body, a personality, and defaults tuned per
   camera. Choosing a filter feels like picking up a different machine.
2. **Curation.** ~20 cameras, all opinionated. Nothing scrolls forever;
   every option earned its place on the shelf.
3. **Camera chrome.** The viewfinder is dressed: shutter button, film
   counter, flash/date/aspect toggles sitting _on_ the camera, not in a
   settings panel.
4. **The output ritual.** Photos "develop" — a beat, a reveal — and come
   out as prints: film border, optional orange date imprint burned in.
   Export is a moment, not a download link.
5. **One asset language.** Their camera illustrations, LCD numerals,
   engraved labels, and textures all come from one drawn world.

Our state today: 626 undifferentiated looks behind thumbnails, generic
Lucide line icons, one pixel logo, instant silent PNG export, and a
workshop UI that (in simple mode) now borrows the camera _layout_ but
none of the _identity_.

## The gaps, concretely

### G1 — Looks have no identity (asset library)
- We have no camera icon set at all. Lucide's `camera` is the same glyph
  every SaaS uses; Dazz draws a distinct body per camera.
- Brands have icons but no _marks_: no drawn sigils, no per-brand color
  or texture, nothing ownable.
- Needed asset library v1 (all hand-drawn SVG, squared, our ink/paper
  palette + lemon accent):
  - **Camera glyphs ×6**: rangefinder, SLR, compact point-and-shoot,
    instant, video/cine, half-frame — used to tag every look by body
    type in the strip and cabinet.
  - **Brand sigils ×15**: a small drawn mark per brand (keep the Lucide
    set as fallback only).
  - **Control icons ×~14**: shutter, flash, date-stamp, frame/border,
    aspect, timer, develop, print — replacing Lucide in the bench chrome.
  - **Texture pack ×4**: paper grain (have), leatherette, brushed metal,
    film-leader — as reusable SVG/CSS assets for camera-chrome surfaces.
  - **Logo family**: the pixel Fuji lockup + wordmark spacing rules +
    app icon set (have the mark; lockups/app icons missing).

### G2 — No curation layer
- Simple mode shows all 626 in one strip. Dazz shows a shelf.
- Needed: a **curated camera shelf** — ~16 signature looks promoted to
  "cameras" with short names (e.g. "Chrome", "Portra", "Tri-X") shown
  first in simple mode; the full library lives one tap deeper ("All
  films") and in Pro. Data: a `featured` list in the catalog build.

### G3 — The bench has no camera chrome
- Export is a plain button. No shutter moment, no film counter, no
  on-camera toggles.
- Needed: a **shutter button** (large, round-cornered-square in our
  language, press animation) as the primary capture/export in simple
  mode; a **film counter** readout (look 011 / 626, LCD-style numerals);
  chrome toggles for the P1 output options below.

### G4 — Export has no ritual and no print options
- Needed (engine + UI):
  - **Developing reveal**: on export (and optionally on look change in
    simple mode), a ~600ms develop-in animation — the image resolves
    from a blurred/warm cast to final. Cheap: CSS/canvas on the existing
    render; the metaphor is the product.
  - **Film-frame borders**: white print border / black cinema frame as
    an export option (canvas post-process; core not required).
  - **Date imprint**: the orange `'25 10 25` burn-in, toggleable —
    Dazz's signature detail. Canvas text pass with a dot-matrix/LCD
    face, or core-side later.
  - **Aspect crops**: 3:2 native, 1:1, 4:5 print — export-time crop.

### G5 — Motion/sound details
- Look change currently swaps instantly. Dazz advances film: a quick
  strip slide + viewfinder blink. Needed: 120–180ms blink/slide on look
  change (springs per the apple-design skill), press states everywhere,
  optional shutter click (WebAudio, off by default, one toggle).

### G6 — Typography moments
- Mono everywhere is close to camera engraving but flat. Needed: one
  display treatment for numerals (counter/readouts — a segmented/LCD-
  style face via font or SVG digits) and engraved-label styling
  (letterspaced, ink2, slight inset shadow) for chrome labels.

## Status (2026-10-25)

- **P0 shelf + identity — shipped** (4416f39): FEATURED shelf of 16
  cameras, camera glyphs, film counter, develop-in, shutter button;
  simple mode later gained the left/right rail layout (eb546fe).
- **P1 print ritual — shipped, then CUT the same day at Ray's
  direction** ("just simple export"): frame / date burn-in / ratio
  are gone; export is the plain developed PNG in both modes. The
  develop-in animation and the shelf stay — the ritual that did not
  survive contact was the decorated print itself.
- **P2 asset library — shipped**: hand-drawn sigils ×15 + controls,
  texture pack, app icons + manifest, this design doc; Lucide retired
  from the chrome.
- **Dazz black reskin — shipped** (Ray's full-copy call): black
  stage, grotesque type, rounded surfaces, zero shadows; the cream
  vintage palette and the palette switcher both retired.
- **Next: GPU preview spike (vgpu/WebGPU)** — Ray sequenced it after
  P2 on 2026-10-25: GPU LUT pass + grain + true halation bloom as the
  interactive preview, CPU/WASM engine stays as fallback and as the
  print path. Then P3 camera behaviors.

## Phases

**P0 — Shelf + identity basics** (the 80/20 of the Dazz feel)
- Curated shelf of ~16 cameras in simple mode; "All films" expands.
- Camera glyph set ×6 drawn; looks tagged by body type; glyphs in
  strip + cabinet.
- Shutter button + film counter in simple mode.
- Develop-in animation on look change in simple mode.

**P1 — Print ritual**
- Film-frame borders, date imprint, aspect crops at export; chrome
  toggles for them in simple mode; export becomes "Print".

**P2 — Asset library completion**
- Brand sigils ×15, control icon set, texture pack, logo lockups and
  app icons; `design/` folder documents the system; Lucide retired
  from all user-facing chrome (kept for pro-mode utility icons if
  needed).

**P3 — Camera behaviors** (only if P0–P2 land well)
- Flash fill light, double exposure (two-photo blend in core), per-
  camera strength/framing defaults, shutter sound toggle.

## Explicitly not doing
- Photoreal skeuomorphic camera bodies (their skin, not ours).
- A social feed, accounts, or cloud processing — local-first is our
  difference, keep it.
- More looks. 626 is plenty; the work is identity and ritual, not
  inventory.
