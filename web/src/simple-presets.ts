export type PresetMedia = "photo" | "video";
export type ArtKey = "fuji-silver" | "street-compact" | "instant-ivory" | "cx405" | "vhs" | "cx405-camcorder" | "leica-rangefinder" | "hasselblad-medium-format";

export interface SimplePreset {
  id: string;
  recipeId: string;
  artKey: ArtKey;
  label: string;
  description: string;
  media: PresetMedia;
}

// A small selection by photographic intent, not a popularity ranking or
// a claim to reproduce another app's cameras. Pro retains the whole library.
export const SIMPLE_PRESETS: readonly SimplePreset[] = [
  { id: "chrome", recipeId: "fuji/community/005-docu-classic-chrome-john-peltier", artKey: "fuji-silver", label: "Chrome", description: "Muted color · crisp contrast", media: "photo" },
  { id: "negative", recipeId: "fuji/community/006-docu-classic-neg-john-peltier", artKey: "fuji-silver", label: "Negative", description: "Warm contrast · candid scenes", media: "photo" },
  { id: "portrait", recipeId: "fuji/community/080-soft-portrait-john-peltier", artKey: "fuji-silver", label: "Portrait", description: "Gentle skin · soft color", media: "photo" },
  { id: "vivid", recipeId: "fuji/community/201-velvia-veijo-matikainen", artKey: "fuji-silver", label: "Vivid", description: "Bold color · open skies", media: "photo" },
  { id: "acros", recipeId: "fuji/community/075-acros-john-peltier", artKey: "fuji-silver", label: "Acros", description: "Rich monochrome · street", media: "photo" },
  { id: "portra", recipeId: "kodak/community/kodak-portra-400", artKey: "street-compact", label: "Portra", description: "Soft warmth · people", media: "photo" },
  { id: "gold", recipeId: "kodak/community/kodak-gold-200", artKey: "street-compact", label: "Gold", description: "Golden color · daylight", media: "photo" },
  { id: "superia", recipeId: "fuji/community/fuji-superia-x-minus-tra-400", artKey: "street-compact", label: "Superia", description: "Fresh greens · everyday color", media: "photo" },
  { id: "instant", recipeId: "polaroid/community/polaroid-sx-minus-70", artKey: "instant-ivory", label: "Instant", description: "Creamy color · instant mood", media: "photo" },
  { id: "cx405", recipeId: "camcorder/cx405", artKey: "cx405-camcorder", label: "CX405", description: "Soft digital video · camcorder", media: "video" },
  { id: "vhs", recipeId: "camcorder/vhs", artKey: "vhs", label: "VHS-C", description: "Tape color · analog video", media: "video" },
];

export const DEFAULT_PHOTO = SIMPLE_PRESETS[0];
export const presetsForMedia = (media: PresetMedia) => SIMPLE_PRESETS.filter(p => p.media === media);
export const presetForRecipe = (recipeId: string | undefined) => SIMPLE_PRESETS.find(p => p.recipeId === recipeId);

export function selectionForMedia(media: PresetMedia, currentRecipeId?: string): SimplePreset {
  const current = presetForRecipe(currentRecipeId);
  return current?.media === media ? current : presetsForMedia(media)[0];
}

export function selectionForMode(mode: "simple" | "pro", currentRecipeId?: string): string {
  if (mode === "pro") return currentRecipeId ?? DEFAULT_PHOTO.recipeId;
  return (presetForRecipe(currentRecipeId) ?? DEFAULT_PHOTO).recipeId;
}
