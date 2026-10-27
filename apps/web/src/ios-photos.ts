interface PhotosBridge {
  encode: (blob: Blob) => Promise<string>;
  save: (base64: string) => Promise<void>;
}

const nativePhotos: PhotosBridge = {
  encode: blob => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the exported photo."));
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject(new Error("Could not read the exported photo."));
      resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  }),
  save: async data => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("plugin:photos|save_photo", { data });
  },
};

/** Request add-only Photos access and save the exact rendered PNG. */
export async function saveToPhotos(blob: Blob, current: () => boolean, bridge: PhotosBridge = nativePhotos): Promise<boolean> {
  const data = await bridge.encode(blob);
  if (!current()) return false;
  try { await bridge.save(data); }
  catch (error) { throw new Error(typeof error === "string" ? error : "Could not save the photo to Photos."); }
  return true;
}
