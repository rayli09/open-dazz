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
  if (import.meta.env.MODE === "ios") {
    const file = new File([blob], name, { type: blob.type });
    if (!navigator.canShare?.({ files: [file] })) throw new Error("Sharing this photo is unavailable on this device.");
    // Rendering runs in a worker, so the original tap's user activation has
    // expired. A second tap opens the iOS share sheet with fresh activation.
    return new Promise<boolean>((resolve, reject) => {
      const dialog = document.createElement("dialog");
      dialog.className = "ios-share-dialog";
      dialog.innerHTML = '<p>Your photo is ready.</p><p>Tap Share, then choose Save Image.</p><div><button type="button" data-cancel>Cancel</button><button type="button" data-share>Share photo</button></div>';
      const finish = (saved: boolean) => { dialog.close(); dialog.remove(); resolve(saved); };
      dialog.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = () => finish(false);
      dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
      dialog.querySelector<HTMLButtonElement>("[data-share]")!.onclick = () => {
        if (!current()) { finish(false); return; }
        void navigator.share({ files: [file], title: "OpenDazz photo" }).then(
          () => finish(current()),
          error => { if (error instanceof DOMException && error.name === "AbortError") finish(false); else { dialog.close(); dialog.remove(); reject(error); } },
        );
      };
      document.body.append(dialog);
      dialog.showModal();
    });
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
