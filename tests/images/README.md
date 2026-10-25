# Test corpus

Unedited RAW files, **CC0** (raw.pixls.us), kept out of git (see .gitignore);
fetch with `tools/fetch_test_images.sh`, render with
`tools/render_test_images.py`.

| file | camera | scene | why it's here |
|---|---|---|---|
| AFXT2720.RAF | Fujifilm X-T3 | indoor product shot, saturated primaries (blue/red packaging, plush toys) | saturation + color-shift checks |
| DSCF0733.RAF | Fujifilm X100V | backlit landscape, big smooth sky, deep-shadow foreground | banding, shadow crush, contrast checks |

Wanted next: a portrait (skin tones) and a RAF + SOOC-JPEG pair of the same
frame for ground-truth ΔE.
