import type { ArtKey } from "./simple-presets.ts";
import { presetForRecipe } from "./simple-presets.ts";

const IMAGE_KEYS = ["fuji-silver", "street-compact", "instant-ivory", "cx405-camcorder", "leica-rangefinder", "hasselblad-medium-format"] as const;

export function artKeyForRecipe(recipeId: string): ArtKey | undefined {
  const preset = presetForRecipe(recipeId);
  if (preset) return preset.artKey;
  const brand = recipeId.split("/")[0];
  if (brand === "fuji") return "fuji-silver";
  if (brand === "kodak") return "street-compact";
  if (brand === "polaroid") return "instant-ivory";
  if (brand === "hasselblad") return "hasselblad-medium-format";
  if (brand === "leica") return "leica-rangefinder";
  return undefined;
}

export function cameraAsset(artKey: ArtKey | string | undefined) {
  if (!IMAGE_KEYS.some(key => key === artKey)) return null;
  return {
    src: `/cameras/${artKey}-384.webp`,
    srcset: `/cameras/${artKey}-384.webp 384w, /cameras/${artKey}-768.webp 768w`,
    sizes: "(min-width: 1024px) 145px, 45vw",
  };
}

/** One-way recovery: remove srcset so the failed candidate cannot win
 * again, then show the look's actual photo thumbnail. */
export function useArtworkFallback(image: Pick<HTMLImageElement, "src" | "removeAttribute">, fallback: string) {
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.src = fallback;
}
