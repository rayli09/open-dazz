# Pack: fuji-recipes (204 community recipes)

Camera-setting recipes compiled by the community (Fuji X Weekly ecosystem),
imported from [matthieurobin/open-fuji-recipes](https://github.com/matthieurobin/open-fuji-recipes)
(**Apache-2.0** per its package.json; upstream data compiled from a community
Google Sheet). Regenerate with `tools/import-fuji-recipes.py <clone-path>`.

Each recipe JSON carries the translated engine parameters plus a
`provenance` block with the original camera settings.

- **148 recipes** join to a base-sim LUT from the `fuji-simulations` pack
  (CC BY-NC-SA — note the combined result inherits that pack's terms).
- **56 recipes** are params-only for now: their base sims are Acros /
  Monochrome / Sepia, which have no bundled LUT yet.

Mapping (see the importer for the exact code): highlight/shadow/color tones
map 1:1; WB Blue-Amber shift maps to tempShift (sign-flipped, /9);
WB Red-Cyan shift is approximated as tintShift (lossy — different axis);
grain weak/strong → 0.25/0.55 with size from the ` l`/` s` suffix;
Color Chrome Effect, DR, EV, sharpness, clarity and NR have no schema-v0
counterpart and survive only in `provenance`.
