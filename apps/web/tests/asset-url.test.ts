import { test, expect } from "bun:test";
import { relativeAssetPath } from "../src/asset-url";
for (const documentUrl of ["https://opendazz.vercel.app/", "http://127.0.0.1:4173/index.html", "tauri://localhost/index.html"]) {
  test(`recipe assets resolve locally from ${documentUrl}`, () => {
    expect(relativeAssetPath("../luts/classic chrome_sRGB.cube", "library/fuji/official/recipes/chrome.json", documentUrl)).toBe("/library/fuji/official/luts/classic%20chrome_sRGB.cube");
    expect(relativeAssetPath("../luts/a.cube", "/library/brand/recipes/a.json", documentUrl)).toBe("/library/brand/luts/a.cube");
  });
}
