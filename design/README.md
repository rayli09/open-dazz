# open-fuji design assets

One drawing system for everything user-facing. If an icon ships in the
chrome, it is drawn here — no third-party icon fonts (Lucide was retired
in P2; it remains only as an internal reference for proportions).

## The system

- **Grid**: 24 × 24, stroke 1.6, squared line terminals, `currentColor`.
- **Corners**: squared everywhere. The only circles are lenses, dials,
  and the shutter ring — things that are round on a real camera.
- **Type**: IBM Plex Mono is the only voice. Engraved labels are
  uppercase, letter-spaced, 10–11px.
- **Palette**: the tokens in `web/src/style.css` (paper / ink / rule /
  stamp / accent #e3edb2). Dark mode is the same paper at night —
  warm charcoal, never blue-black.

## Inventory (`web/src/icons.ts`)

- **Brand sigils × 15** — one mark per brand: Fuji peaks, Kodak
  canister-K, Ilford half-tone square, CineStill sprocket frame with
  glow, Agfa rhombus, Lomo fisheye, Rollei twin-lens, Foma stacked
  sheets, Adox flask, Polaroid instant frame, Bergger crescent,
  Kentmere battlement, Orwo globe, Ricoh finder corners, Emulsion drop.
  Brands arriving later get a sigil drawn to the same system before
  they ship, never a stock glyph.
- **Camera glyphs × 6** — rangefinder, SLR, compact, instant, cine,
  half-frame. Chosen per look by `glyphFor` (brand + name rules).
- **Control icons × 19** — search, chevron, check, sun, moon, upload,
  print, user, mountain, sliders, external, compare, layers, palette,
  contrast, video, official seal, users, swatch fallback.

## Textures (`web/src/style.css`)

- `body::after` — paper grain (multiply light / overlay dark).
- `.tex-filmleader` — punched sprocket row; used on the shelf rail.
- `.tex-metal` — brushed streaks; used on the shutter/print control.
- `.tex-leather` — cross piqué for quiet header bands.

## Logo & app icons

The mark is a 56 × 56 pixel grid (Fuji peak, lemon snowcap, film strip)
in `web/public/logo.png` (+ `logo-dark.png`, `logo-64.png` favicon).
App icons (`icon-192/512`, `apple-touch-icon`) are the same mark on
paper with an 8% pad — regenerate from `logo.png`, never redraw.
