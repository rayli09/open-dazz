import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadWasm } from "../../tools/load-wasm.mjs";
import { RecipeSchema } from "../src/schemas.ts";
import { recipeForMedia } from "../src/recipe-for-media.ts";
const root = new URL("../../", import.meta.url);
const engine = await loadWasm(new URL("../src/pkg/", import.meta.url).pathname);

test("Bun executes the committed browser WASM and preserves display-sRGB LUT input", () => {
  const input = new Uint8Array([32, 64, 128, 19, 180, 128, 64, 230]);
  const cube = `LUT_3D_SIZE 2\n0 0 0\n0.5 0 0\n0 1 0\n0.5 1 0\n0 0 1\n0.5 0 1\n0 1 1\n0.5 1 1\n`;
  const output = engine.apply(
    input,
    2,
    1,
    JSON.stringify({ name: "half-red display LUT", strength: 1 }),
    cube,
  );
  const expected = [16, 64, 128, 19, 90, 128, 64, 230];
  output.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) <= (i % 4 === 3 ? 0 : 1)));
});

test("actual Ricoh recipes filter pixels and retain alpha through browser WASM", () => {
  const input = new Uint8Array([200, 100, 60, 37, 55, 170, 200, 255]);
  for (const file of ["ricoh-superior-100-negative-film", "ricoh-high-minus-contrast-monochrome"]) {
    const path = new URL(`library/ricoh/community/recipes/${file}.json`, root);
    const recipe = RecipeSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    const cube = readFileSync(new URL(recipe.baseLut, path), "utf8");
    const output = engine.apply(
      input,
      2,
      1,
      JSON.stringify(recipeForMedia(recipe, true, false)),
      cube,
    );
    assert.notDeepEqual([...output], [...input]);
    assert.equal(output[3], 37);
    assert.equal(output[7], 255);
    if (file.includes("monochrome")) {
      for (const i of [0, 4])
        assert.ok(Math.max(...output.slice(i, i + 3)) - Math.min(...output.slice(i, i + 3)) <= 1);
    }
  }
});
