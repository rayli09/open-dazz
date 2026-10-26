import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { SIMPLE_PRESETS, DEFAULT_PHOTO, presetForRecipe, presetsForMedia, selectionForMedia, selectionForMode } from "../src/simple-presets.ts";
import { artKeyForRecipe, cameraAsset, useArtworkFallback } from "../src/camera-art.ts";
import { CatalogSchema, RecipeSchema } from "../src/schemas.ts";
import { recipeForMedia } from "../src/recipe-for-media.ts";

const root = new URL("../../", import.meta.url);
const catalog = CatalogSchema.parse(JSON.parse(readFileSync(new URL("library/catalog.json",root),"utf8")));
const looks = new Map(Object.values(catalog.brands).flatMap(b=>Object.values(b.tiers).flat()).map(l=>[l.id,l]));

test("eleven unique photo looks have real recipes and five Fuji photo-v1 profiles lead the shelf", () => {
  const photos=presetsForMedia("photo");
  assert.equal(photos.length,11);
  assert.equal(new Set(SIMPLE_PRESETS.map(p=>p.id)).size,SIMPLE_PRESETS.length);
  assert.equal(new Set(SIMPLE_PRESETS.map(p=>p.recipeId)).size,SIMPLE_PRESETS.length);
  assert.equal(DEFAULT_PHOTO.id,"chrome");
  for (const [i,p] of photos.entries()) {
    const look=looks.get(p.recipeId);assert.ok(look,`Missing ${p.recipeId}`);
    const recipe=RecipeSchema.parse(JSON.parse(readFileSync(new URL(look.recipe,root),"utf8")));
    assert.ok(p.label && p.description);
    assert.ok(cameraAsset(p.artKey),`Missing approved art for ${p.id}`);
    if(i<5) { assert.equal(recipe.processing,"fujiPhotoV1");assert.equal(p.artKey,"fuji-silver"); }
    for(const simple of [true,false]) {
      const effective=JSON.parse(JSON.stringify(recipeForMedia(recipe,simple,false)));
      assert.equal(effective.processing,recipe.processing);
      assert.deepEqual(effective.tone,recipe.tone);
      assert.deepEqual(effective.grain,recipe.grain);
      assert.equal(recipeForMedia(recipe,simple,true).processing,"legacy");
    }
  }
  assert.equal(photos.filter(p=>p.artKey==="street-compact").length,5);
  assert.equal(photos.filter(p=>p.artKey==="instant-ivory").length,1);
});

test("video cameras are separate and mode/media selection recovers to a real default", () => {
  assert.deepEqual(presetsForMedia("video").map(p=>p.recipeId),["camcorder/cx405","camcorder/vhs"]);
  const photo=presetsForMedia("photo")[6];
  assert.equal(selectionForMode("pro",photo.recipeId),photo.recipeId);
  assert.equal(selectionForMode("simple",photo.recipeId),photo.recipeId);
  assert.equal(selectionForMode("pro","custom/pro-look"),"custom/pro-look");
  assert.equal(selectionForMode("simple","custom/pro-look"),DEFAULT_PHOTO.recipeId);
  assert.equal(selectionForMedia("photo",photo.recipeId),photo);
  assert.equal(selectionForMedia("video",photo.recipeId).recipeId,"camcorder/cx405");
  // The UI retains one selection per collection and restores it on return.
  const remembered={photo:photo.recipeId,video:"camcorder/vhs"};
  assert.equal(selectionForMedia("video",remembered.video).id,"vhs");
  assert.equal(selectionForMedia("photo",remembered.photo).id,photo.id);
  assert.equal(presetForRecipe("missing"),undefined);
});

test("approved art has optimized alpha WebP candidates; unknown and video art use existing fallbacks", () => {
  assert.equal(artKeyForRecipe("fuji/official/classic-chrome"),"fuji-silver");
  assert.equal(artKeyForRecipe("kodak/community/other"),"street-compact");
  assert.equal(artKeyForRecipe("polaroid/community/other"),"instant-ivory");
  assert.equal(artKeyForRecipe("ilford/community/other"),undefined);
  assert.equal(artKeyForRecipe("hasselblad/official/standard"),"hasselblad-medium-format");
  assert.equal(artKeyForRecipe("leica/official/standard"),"leica-rangefinder");
  assert.equal(artKeyForRecipe("camcorder/cx405"),"cx405-camcorder");
  for(const key of ["fuji-silver","street-compact","instant-ivory","cx405-camcorder","leica-rangefinder","hasselblad-medium-format"]) {
    const asset=cameraAsset(key)!;assert.ok(asset);
    assert.ok(asset.srcset.includes("384w") && asset.srcset.includes("768w"));
    for(const width of [384,768]) {
      const path=new URL(`web/public/cameras/${key}-${width}.webp`,root);assert.ok(existsSync(path));
      const bytes=readFileSync(path);assert.equal(bytes.toString("ascii",0,4),"RIFF");assert.equal(bytes.toString("ascii",8,12),"WEBP");
      assert.ok(bytes.includes(Buffer.from("ALPH")),`${key} lost alpha`);
    }
  }
  assert.equal(cameraAsset("unknown"),null);assert.equal(cameraAsset("cx405"),null);
  const removed:string[]=[];const image={src:"/missing.webp",removeAttribute:(s:string)=>removed.push(s)};
  useArtworkFallback(image,"/thumbs/fallback.webp");
  assert.equal(image.src,"/thumbs/fallback.webp");assert.deepEqual(removed,["srcset","sizes"]);
});
