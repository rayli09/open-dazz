# Design sources

The main editor uses quiet matte Graphite surfaces with restrained satin controls, consistent top-left light and Instrument Sans/system fallback typography. `apps/web/src/camera-controls.css` owns shared mode, dial and shutter materials; `apps/web/src/workshop-material.css` integrates them into the editor. `apps/web/materials.html` remains a working control reference with its own regression harness.

- [Camera source manifest](camera-assets/manifest.json): eight original generated 1536×1024 transparent PNGs, source/Library identifiers, hashes and responsive derivative paths. Keep these originals; the 384/768px WebP assets under `apps/web/public/cameras/` are delivery derivatives. Phone artwork is original illustration, not scraped product photography or a calibration reference.
- [Graphite reference](reference/graphite-darkroom.png): approved visual source, retained for design continuity.
- [Aperture logo concept](reference/aperture-logo.webp): original selected generated concept (generation ID `599bc582-89a3-433b-b963-03b419a22fb3`). The maintained production vector is `apps/web/public/logo.svg`; public favicon/app icons are production assets. Unselected alternatives are recoverable through Git history.
- `apps/web/src/icons.ts`: shared 24-unit icon grid, 1.6-unit strokes, brand sigils and camera glyphs. Interactive controls use CSS/SVG rather than rasterized faces.

Generated QA screenshots, contact sheets and delivery reports belong in ignored `tools/verify-out/` or `/tmp`, not alongside source artwork. See [Testing](../docs/TESTING.md).
