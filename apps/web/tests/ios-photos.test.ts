import { expect, test } from "bun:test";
import { saveToPhotos } from "../src/ios-photos";

test("saves only the still-current rendered photo and propagates Photos denial", async () => {
  let current = true, writes = 0;
  const bridge = { encode: async () => { current = false; return "encoded"; }, save: async () => { writes++; } };
  expect(await saveToPhotos(new Blob(), () => current, bridge)).toBe(false);
  expect(writes).toBe(0);
  await expect(saveToPhotos(new Blob(), () => true, { encode: async () => "encoded", save: async () => { throw "Photos access was denied"; } })).rejects.toThrow("Photos access was denied");
  let saved = "";
  expect(await saveToPhotos(new Blob(), () => true, { encode: async () => "encoded", save: async data => { saved = data; } })).toBe(true);
  expect(saved).toBe("encoded");
});
