// Validate the actual committed bundler WASM against native CLI pixels.
// node --experimental-wasm-modules tools/check_wasm_photo.mjs cases.json
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apply } from "../web/src/pkg/opendazz_wasm.js";

const cases = JSON.parse(readFileSync(process.argv[2], "utf8"));
const results = [];
for (const c of cases) {
  const input = new Uint8Array(Buffer.from(c.input, "base64"));
  const expected = Buffer.from(c.expected, "base64");
  const output = apply(input, c.width, c.height, JSON.stringify(c.recipe), readFileSync(c.cube, "utf8"));
  let sum = 0, max = 0;
  assert.equal(output.length, input.length);
  for (let i = 0; i < output.length; i++) {
    if (i % 4 === 3) { assert.equal(output[i], input[i], "alpha changed"); continue; }
    const d = Math.abs(output[i] - expected[i]);
    sum += d; max = Math.max(max, d);
  }
  const mean = sum / (c.width * c.height * 3);
  assert.ok(max <= 1 && mean <= 0.1, `${c.name}: native/WASM differ mean=${mean}, max=${max}`);
  results.push({ name: c.name, mean, max });
}
console.log(JSON.stringify(results, null, 2));
