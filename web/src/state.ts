// Global UI state (Jotai vanilla atoms — no framework, just the store).
import { atom, createStore } from "jotai/vanilla";

export type Mode = "simple" | "pro";
export const store = createStore();
export const modeAtom = atom<Mode>("simple");
