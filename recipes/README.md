# Recipe schema v0 (draft)

A recipe is a JSON object. Camera-agnostic: parameters are engine-relative, not camera menu settings.

```json
{
  "name": "Portra 400",
  "baseLut": "luts/kodak/portra-400.cube",
  "grain":   { "amount": 0.30, "size": "large" },
  "halation": 0.15,
  "tone":    { "highlight": 0, "shadow": 0, "color": 0 },
  "whiteBalance": { "tempShift": 0, "tintShift": 0 },
  "source": "hand-authored example",
  "license": "MIT"
}
```

Open questions: how to represent camera-style recipes (Fuji X Weekly format) — translate into engine params at import time, keep the original alongside for provenance.

Path resolution: `baseLut` is resolved relative to the recipe file's own
directory. The CLI implements this; the web app maps it to a bundled pack.

Imported Fuji camera-setting recipes now opt into `"processing": "fujiPhotoV1"`
for still photos: highlight-safe display-referred WB, endpoint-preserving tone,
soft saturation roll-off, and signal/headroom-aware grain. Positive shadow
deepens shadows; negative shadow opens them. This corrects the old additive
shadow lift's direction. The existing imported WB axis approximation remains.

Omitting `processing` selects `legacy` and preserves existing/custom recipe
bytes. Official base LUTs and their strength=1 defaults are unchanged. Video
callers explicitly select legacy processing, including the poster frame.
`fujiPhotoV1` is a JPEG rendering approximation, not a Fuji RAW engine or a
claim of camera-matched color. See `docs/verification/fuji-photo-v1-2026-10-26.md`.
