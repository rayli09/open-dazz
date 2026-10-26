import { test, expect } from "bun:test";
import { createWorkspaceLayout } from "../src/workspace-layout";
test("desktop panels collapse independently and survive a narrow-window round trip", () => {
  const store = createWorkspaceLayout(true);
  store.getState().toggle("looks");
  expect(store.getState().desktopLooks).toBe(false);
  expect(store.getState().desktopAdjustments).toBe(true);
  store.getState().resize(false); store.getState().toggle("looks");
  expect(store.getState().drawer).toBe("looks");
  store.getState().resize(true);
  expect(store.getState().drawer).toBe(null);
  expect(store.getState().desktopLooks).toBe(false);
  expect(store.getState().desktopAdjustments).toBe(true);
});
test("narrow windows expose one panel at a time and explicit closing is stable", () => {
  const store = createWorkspaceLayout(false);
  store.getState().toggle("looks"); store.getState().toggle("adjustments");
  expect(store.getState().drawer).toBe("adjustments");
  store.getState().close("looks"); expect(store.getState().drawer).toBe("adjustments");
  store.getState().toggle("adjustments"); expect(store.getState().drawer).toBe(null);
});
