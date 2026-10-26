import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recipeForMedia } from "../src/recipe-for-media.ts";

test("Fuji photo rendering is retained for stills and disabled for video posters/exports", () => {
  const source = { processing: "fujiPhotoV1", strength: 0.7, tone: { highlight: 1 } };
  assert.equal(recipeForMedia(source, false, false).processing, "fujiPhotoV1");
  assert.equal(recipeForMedia(source, false, false).strength, 0.7);
  assert.equal(recipeForMedia(source, false, true).processing, "legacy");
  assert.equal(recipeForMedia(source, false, true).strength, 0.7);
  assert.equal(recipeForMedia(source, true, false).strength, 1);
  assert.equal(recipeForMedia(source, true, true).processing, "legacy");
  assert.equal(source.processing, "fujiPhotoV1");
});

test("fetched recipe survives cloning and JSON serialization in both modes", () => {
  const source = JSON.parse(readFileSync(new URL("../../library/fuji/community/recipes/005-docu-classic-chrome-john-peltier.json", import.meta.url), "utf8"));
  for (const simple of [true, false]) {
    const still = JSON.parse(JSON.stringify(recipeForMedia(source, simple, false)));
    const video = JSON.parse(JSON.stringify(recipeForMedia(source, simple, true)));
    assert.equal(still.processing, "fujiPhotoV1");
    assert.equal(video.processing, "legacy");
    assert.deepEqual(still.tone, source.tone);
    assert.deepEqual(video.whiteBalance, source.whiteBalance);
    assert.equal(source.processing, "fujiPhotoV1");
  }
});
