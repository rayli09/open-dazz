import { test, expect } from "bun:test";
import { saveNative, type NativeSave } from "../src/save-media";
test("native save sends exact PNG/MP4 bytes only after a chosen destination", async () => {
  const calls: unknown[] = [], blob = new Blob([new Uint8Array([1, 2, 255])]);
  const native: NativeSave = { choose: async (n, e) => { calls.push([n, e]); return "/chosen/movie.mp4"; }, write: async (p, b) => { calls.push([p, [...b]]); } };
  expect(await saveNative(blob, "movie.mp4", () => true, native)).toBe(true);
  expect(calls).toEqual([["movie.mp4", "mp4"], ["/chosen/movie.mp4", [1, 2, 255]]]);
});
test("cancel and selection switch during dialog prevent stale native writes", async () => {
  let current = true, writes = 0;
  expect(await saveNative(new Blob(), "photo.png", () => true, { choose: async () => null, write: async () => { writes++; } })).toBe(false);
  expect(await saveNative(new Blob(), "photo.png", () => current, { choose: async () => { current = false; return "/chosen.png"; }, write: async () => { writes++; } })).toBe(false);
  expect(writes).toBe(0);
});
test("native write errors remain recoverable errors, never successful exports", async () => {
  await expect(saveNative(new Blob(), "photo.png", () => true, { choose: async () => "/chosen.png", write: async () => { throw new Error("disk full"); } })).rejects.toThrow("disk full");
});

test("selection switch while reading export bytes prevents a disk write", async () => {
  let current = true, writes = 0;
  class DelayedBlob extends Blob { override async arrayBuffer() { current = false; return new ArrayBuffer(4); } }
  expect(await saveNative(new DelayedBlob(), "photo.png", () => current, { choose: async () => "/chosen.png", write: async () => { writes++; } })).toBe(false);
  expect(writes).toBe(0);
});
