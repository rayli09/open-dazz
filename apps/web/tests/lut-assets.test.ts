import { test, expect } from "bun:test";
import { resolveRemoteLut } from "../src/lut-assets";

test("resolves encoded recipe paths to immutable LUT objects and rejects absent or malformed hashes", () => {
  const hash = "ab".repeat(32);
  const path = "/library/fuji/luts/classic%20chrome.cube.gz";
  expect(resolveRemoteLut(path, { "library/fuji/luts/classic chrome.cube.gz": hash }))
    .toBe(`https://dazz-assets.openpromo.app/${hash}.cube.gz`);
  expect(() => resolveRemoteLut(path, {})).toThrow("Missing LUT asset");
  expect(() => resolveRemoteLut(path, { "library/fuji/luts/classic chrome.cube.gz": "../bad" })).toThrow("Missing LUT asset");
});
