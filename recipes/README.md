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
