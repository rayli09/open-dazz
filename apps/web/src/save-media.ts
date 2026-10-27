import { platform } from "./platform";
import { isTauri } from "@tauri-apps/api/core";
export interface NativeSave {
  choose: (name: string, extension: string) => Promise<string | null>;
  write: (path: string, bytes: Uint8Array) => Promise<void>;
}
// Recheck identity after each asynchronous boundary; choosing Cancel is not an export.
export async function saveNative(blob: Blob, name: string, current: () => boolean, native: NativeSave): Promise<boolean> {
  if (!current()) return false;
  const path = await native.choose(name, name.endsWith(".mp4") ? "mp4" : "png");
  if (!path || !current()) return false;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!current()) return false;
  await native.write(path, bytes);
  return true;
}
export async function saveMedia(blob: Blob, name: string, current: () => boolean): Promise<boolean> {
  if (!current()) return false;
  if (platform.photoDestination === "photos") {
    const { saveToPhotos } = await import("./ios-photos");
    return saveToPhotos(blob, current);
  }
  if (isTauri()) {
    if (import.meta.env.VITE_DESKTOP_SMOKE === "1") {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_smoke_export", { name: name.endsWith(".mp4") ? "video.mp4" : "photo.png", bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
      return current();
    }
    const [{ save }, { writeFile }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/plugin-fs")]);
    return saveNative(blob, name, current, {
      choose: (defaultPath, extension) => save({ defaultPath, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] }),
      write: writeFile,
    });
  }
  const link = document.createElement("a"), url = URL.createObjectURL(blob);
  link.href = url; link.download = name;
  try { link.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return true;
}
