import type { LookEntry } from "./schemas";

// Names are the generated WASM ABI's validated preset strings. Device facts
// constrain the era; these authored looks are not calibrated camera profiles.
export type PhonePreset = "nokia-n95" | "iphone-4s";
export function phonePresetForLook(id: string): PhonePreset | undefined {
  if (id === "camcorder/nokia-n95") return "nokia-n95";
  if (id === "camcorder/iphone-4s") return "iphone-4s";
  return undefined;
}
export const PHONE_LOOKS: LookEntry[] = [
  { id: "camcorder/nokia-n95", name: "Nokia N95 · inspired", brand: "camcorder", tier: "video", recipe: "", baseLut: null, hasLut: false, baseFilm: "N95-era VGA", creator: "OpenDazz", license: null },
  { id: "camcorder/iphone-4s", name: "iPhone 4S · inspired", brand: "camcorder", tier: "video", recipe: "", baseLut: null, hasLut: false, baseFilm: "4S-era SDR", creator: "OpenDazz", license: null },
];
export const PHONE_META: Record<string, { meta: string; note: string }> = {
  "camcorder/nokia-n95": {
    meta: "phone · 2007 N95-inspired · OpenDazz",
    note: "VGA-era detail, soft chroma, coarse shadow noise and block compression texture. Inspired simulation, not a measured N95 profile. Preserves framing, timing and audio.",
  },
  "camcorder/iphone-4s": {
    meta: "phone · 2011 4S-inspired · OpenDazz",
    note: "Crisp early-smartphone edges, cleaner chroma, subtle shadow noise and SDR highlights. Inspired simulation, not a measured 4S profile or native 1080p capture. Preserves framing, timing and audio.",
  },
};
export const PHONE_OUTPUT_NOTE = "Inspired phone simulation · preview detail is reduced. MP4 export keeps the full clip and supported audio, up to 854px wide; not native device capture or HDR.";
