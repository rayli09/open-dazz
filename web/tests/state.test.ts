import { test } from "bun:test";
import assert from "node:assert/strict";
import { createUiStore, selectMode, persistMode, readMode } from "../src/state";

test("mode selectors notify once per change and cleanup stops notifications", () => {
  const store = createUiStore();
  const changes: string[] = [];
  const stop = store.subscribe(selectMode, (mode) => changes.push(mode), { fireImmediately: true });
  store.getState().setMode("simple");
  store.getState().setMode("pro");
  store.getState().setMode("pro");
  store.setState({ setMode: store.getState().setMode });
  assert.deepEqual(changes, ["simple", "pro"]);
  stop();
  store.getState().setMode("simple");
  assert.deepEqual(changes, ["simple", "pro"]);
});

test("existing raw of-mode preference survives recreation and persistence cleans up", () => {
  const values = new Map([["of-mode", "pro"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const store = createUiStore(readMode(storage));
  assert.equal(store.getState().mode, "pro");
  const stop = persistMode(store, storage);
  store.getState().setMode("simple");
  assert.equal(values.get("of-mode"), "simple");
  assert.equal(createUiStore(readMode(storage)).getState().mode, "simple");
  stop();
  store.getState().setMode("pro");
  assert.equal(values.get("of-mode"), "simple");
});

test("invalid or blocked persisted state falls back safely and writes cannot break the store", () => {
  for (const raw of [null, "", '"pro"', "PRO", "other", '{"mode":"pro"}']) {
    assert.equal(readMode({ getItem: () => raw, setItem() {} }), "simple");
  }
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
  };
  assert.equal(readMode(blocked), "simple");
  const store = createUiStore();
  const stop = persistMode(store, blocked);
  store.getState().setMode("pro");
  assert.equal(store.getState().mode, "pro");
  stop();
});
