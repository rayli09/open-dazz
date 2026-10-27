import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  createMediaStore,
  selectedMedia,
  FileMetadataSchema,
  MAX_FILE_BYTES,
  MAX_MEDIA,
} from "../src/media-store";
import { RecipeSchema } from "../src/schemas";
function fixture() {
  let count = 0;
  const created: string[] = [],
    revoked: string[] = [];
  const store = createMediaStore({
    id: () => `media-${++count}`,
    createUrl: (file) => {
      const url = `blob:${file.name}:${count}`;
      created.push(url);
      return url;
    },
    revokeUrl: (url) => {
      revoked.push(url);
    },
  });
  const photo = (name = "a.jpg") =>
    new File(["image"], name, { type: "image/jpeg", lastModified: 1 });
  const video = new File(["video"], "clip.mp4", { type: "video/mp4", lastModified: 2 });
  return { store, created, revoked, photo, video };
}

test("multi-import has stable independent IDs, deduplicates and owns each URL once", () => {
  const { store, created, revoked, photo, video } = fixture();
  const result = store.getState().addFiles([{ file: photo() }, { file: video }]);
  assert.deepEqual(result.added, ["media-1", "media-2"]);
  assert.equal(store.getState().selectedId, "media-1");
  const duplicate = store.getState().addFiles([{ file: photo() }]);
  assert.deepEqual(duplicate.duplicates, ["media-1"]);
  assert.equal(created.length, 2);
  assert.equal(store.getState().items[1].kind, "video");
  store.getState().remove("media-1");
  assert.deepEqual(revoked, [created[0]]);
  assert.equal(store.getState().selectedId, "media-2");
  store.getState().clear();
  assert.deepEqual(revoked, created);
  assert.equal(store.getState().selectedId, null);
  store.getState().clear();
  assert.equal(revoked.length, 2);
});

test("edits and playback restore by identity, with immutable recipe snapshots", () => {
  const { store, photo, video } = fixture();
  const [a, b] = store.getState().addFiles([{ file: photo() }, { file: video }]).added;
  const recipe = RecipeSchema.parse({ name: "A", strength: 0.4 });
  store.getState().updateEdit(a, { lookId: "ricoh/look", recipe });
  recipe.strength = 0.9;
  assert.equal(selectedMedia(store.getState())!.edit.recipe!.strength, 0.4);
  store.getState().select(b);
  store
    .getState()
    .updatePlayback(b, { currentTime: 1.7, volume: 0.3, playing: true, view: "original" });
  store.getState().select(a);
  assert.equal(selectedMedia(store.getState())!.edit.lookId, "ricoh/look");
  store.getState().select(b);
  const selected = selectedMedia(store.getState())!;
  assert.equal(selected.playback.currentTime, 1.7);
  assert.equal(selected.playback.volume, 0.3);
  assert.equal(selected.playback.view, "original");
  assert.equal(selected.playback.playing, false);
  assert.equal(selected.edit.recipe, null);
  assert.notEqual(selected.edit.lookId, "ricoh/look");
});

test("reorder preserves identity and removal ignores late asynchronous updates", () => {
  const { store, photo } = fixture();
  const [a, b, c] = store
    .getState()
    .addFiles(["a.jpg", "b.jpg", "c.jpg"].map((name) => ({ file: photo(name) }))).added;
  store.getState().select(b);
  store.getState().move(b, 1);
  assert.deepEqual(
    store.getState().items.map((item) => item.id),
    [a, c, b],
  );
  assert.equal(store.getState().selectedId, b);
  store.getState().remove(a);
  assert.equal(store.getState().selectedId, b);
  store.getState().remove(b);
  assert.equal(store.getState().selectedId, c);
  store.getState().updateEdit(b, { lookId: "late" });
  store.getState().updateStatus(b, { status: "ready" });
  store.getState().updatePlayback(b, { currentTime: 1 });
  assert.equal(store.getState().items.length, 1);
  assert.equal(store.getState().items[0].id, c);
  let changes = 0;
  const stop = store.subscribe(
    (s) => s.selectedId,
    () => changes++,
  );
  store.getState().select(c);
  store.getState().select("missing");
  assert.equal(changes, 0);
  stop();
});

test("unsupported, empty and oversized media are bounded without allocating URLs", () => {
  const { store, created, photo } = fixture();
  const result = store
    .getState()
    .addFiles([
      { file: new File(["text"], "notes.txt", { type: "text/plain" }) },
      { file: new File([], "empty.jpg", { type: "image/jpeg" }) },
    ]);
  assert.equal(result.errors.length, 2);
  assert.equal(created.length, 0);
  assert.equal(
    FileMetadataSchema.safeParse({
      name: "large.mp4",
      type: "video/mp4",
      size: MAX_FILE_BYTES + 1,
      lastModified: 1,
    }).success,
    false,
  );
  const many = store
    .getState()
    .addFiles(Array.from({ length: MAX_MEDIA + 1 }, (_, i) => ({ file: photo(`${i}.jpg`) })));
  assert.equal(many.added.length, MAX_MEDIA);
  assert.equal(many.errors.length, 1);
  assert.equal(created.length, MAX_MEDIA);
});

test("samples deduplicate without revoking static assets and new selections stop playback", () => {
  const { store, revoked, photo } = fixture();
  const sample = store.getState().addSample("/sample.jpg", "Sample");
  assert.equal(store.getState().addSample("/sample.jpg", "Sample"), sample);
  store.getState().updatePlayback(sample, { playing: true });
  store.getState().addFiles([{ file: photo() }]);
  assert.equal(store.getState().items.find((item) => item.id === sample)!.playback.playing, false);
  store.getState().remove(sample);
  assert.equal(revoked.length, 0);
});

test("a supported video extension works when the browser does not provide a media MIME", () => {
  const { store } = fixture();
  const file = new File(["video"], "CLIP.MP4", {
    type: "application/octet-stream",
    lastModified: 3,
  });
  const result = store.getState().addFiles([{ file }]);
  assert.equal(result.added.length, 1);
  assert.equal(selectedMedia(store.getState())!.kind, "video");
});
