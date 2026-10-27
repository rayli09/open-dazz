# The library — how looks are organized

Filters ("looks") are grouped **by brand**, and inside each brand
**official looks come first**:

```
library/
  catalog.json            generated index (tools/build_catalog.py)
  <brand>/
    official/             the brand's own simulations / first-party looks
      luts/               gzip-compressed `.cube.gz` files (with the tier's LICENSE/README)
      recipes/            bare recipes, one per look
    community/            third-party recipes built on those looks
      luts/               gzip-compressed `.cube.gz` files (baked packs; recipe-only packs omit)
      recipes/
```

Brands today: `fuji` (official + community) and, from the EmulsionPresets
bake (community tier, MIT), `kodak`, `ilford`, `agfa`, `cinestill`,
`rollei`, `foma`, `lomography`, `adox`, `polaroid`, `ricoh`, `bergger`,
`kentmere`, `orwo`, plus `emulsion` for creative styles with no single
manufacturer. Current count: see `catalog.json` (626 looks).

Rules:
- A brand directory is added when its first look lands.
- `official/` is only for looks that represent the manufacturer/first
  party's own definitions — never for community creations, however good.
- Every tier directory carries its license terms in its README; licenses
  never silently mix across tiers (e.g. fuji/official is CC BY-NC-SA,
  fuji/community data is Apache-2.0 — a community recipe that joins an
  official LUT inherits the stricter terms at render time, which its
  README states).
- Ungrouped house examples live in the repo-root `recipes/` and list
  last, under "examples".

LUTs are losslessly gzip-compressed; recipes refer to `.cube.gz` paths. The CLI and browser decompress them when loading a look. Maintainer bake/import tools write the same format.

The CLI reads this layout directly (`opendazz list`, `opendazz apply
--look <name|id>`); `catalog.json` is the same data as one file for the
future web app.
