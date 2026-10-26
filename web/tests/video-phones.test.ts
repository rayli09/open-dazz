import { test, expect } from "bun:test";
import { PHONE_LOOKS, PHONE_META, PHONE_OUTPUT_NOTE, phonePresetForLook } from "../src/video-phones";
import { presetsForMedia, selectionForMedia } from "../src/simple-presets";

test("phone shelf entries route to their own video engine and disclose simulation limits", () => {
  for (const key of ["nokia-n95", "iphone-4s"] as const) {
    const id = `camcorder/${key}`;
    expect(phonePresetForLook(id)).toBe(key);
    expect(PHONE_LOOKS.find(l => l.id === id)?.name).toContain("inspired");
    expect(PHONE_META[id].note).toContain("Inspired simulation");
    expect(presetsForMedia("video").find(p => p.recipeId === id)?.artKey).toBe(key);
    expect(selectionForMedia("video", id).recipeId).toBe(id);
  }
  expect(phonePresetForLook("camcorder/cx405")).toBeUndefined();
  expect(phonePresetForLook("ricoh/community/ricoh-superior-100-negative-film")).toBeUndefined();
  expect(selectionForMedia("video").recipeId).toBe("camcorder/cx405");
  expect(PHONE_OUTPUT_NOTE).toContain("854px");
});
