import type { Recipe } from "./schemas";
import type { PhonePreset } from "./video-phones";
export const MAX_PHOTO_PIXELS = 16777216;
export const MAX_PHOTO_EDGE = 8192;
export function checkPhotoSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > MAX_PHOTO_EDGE || height > MAX_PHOTO_EDGE || width * height > MAX_PHOTO_PIXELS)
        throw new Error("Original-size export supports photos up to 16.7 MP and 8192px per edge. Resize a copy first; this photo was not downscaled or exported.");
}
export type PhotoSnapshot = {
    kind: "recipe";
    recipe: Recipe;
    cube: string | undefined;
} | {
    kind: "phone";
    preset: PhonePreset;
} | {
    kind: "cx405" | "vhs";
};
export interface PhotoExportRequest {
    bitmap: ImageBitmap;
    snapshot: PhotoSnapshot;
}
