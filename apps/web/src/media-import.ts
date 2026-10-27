import Uppy from "@uppy/core";
import DropTarget from "@uppy/drop-target";
import {
  mediaStore,
  fileFingerprint,
  FileMetadataSchema,
  MEDIA_FILE_TYPES,
  MAX_FILE_BYTES,
  MAX_MEDIA,
} from "./media-store";

export function setupMediaImport(
  input: HTMLInputElement,
  target: HTMLElement,
  announce: (message: string) => void,
) {
  const uppy = new Uppy({
    autoProceed: false,
    restrictions: {
      maxNumberOfFiles: MAX_MEDIA,
      maxFileSize: MAX_FILE_BYTES,
      minFileSize: 1,
      allowedFileTypes: [...MEDIA_FILE_TYPES],
    },
  });
  const warnings: string[] = [];
  uppy.use(DropTarget, { target }); // Acquisition only: no uploader or remote provider is installed.
  uppy.on("files-added", (files) => {
    const local = files.flatMap((file) =>
      file.data instanceof File ? [{ file: file.data, importId: file.id }] : [],
    );
    const result = mediaStore.getState().addFiles(local);
    for (const file of files)
      if (!mediaStore.getState().items.some((item) => item.importId === file.id))
        uppy.removeFile(file.id);
    const message = result.added.length
      ? `Added ${result.added.length} ${result.added.length === 1 ? "item" : "items"}.`
      : "Already in your dock.";
    announce([message, ...new Set([...result.errors, ...warnings])].filter(Boolean).join(" "));
    warnings.length = 0;
  });
  uppy.on("restriction-failed", (file) => {
    const data = file?.data;
    const existing =
      data instanceof File
        ? mediaStore.getState().items.find((item) => item.fingerprint === fileFingerprint(data))
        : undefined;
    if (existing) {
      mediaStore.getState().select(existing.id);
      announce(`${existing.name} is already in your dock.`);
    } else {
      const valid =
        data instanceof File &&
        FileMetadataSchema.safeParse({
          name: data.name,
          type: data.type,
          size: data.size,
          lastModified: data.lastModified,
        }).success;
      const message =
        data instanceof File && data.size > MAX_FILE_BYTES
          ? "Files must be 512 MB or smaller."
          : !valid
            ? "Choose a supported, non-empty photo or video."
            : mediaStore.getState().items.length >= MAX_MEDIA
              ? `Keep up to ${MAX_MEDIA} items in the dock.`
              : "Skipped a duplicate file.";
      warnings.push(message);
      announce(message);
      queueMicrotask(() => {
        warnings.length = 0;
      });
    }
  });
  const onChange = () => {
    const files = Array.from(input.files ?? []);
    try {
      uppy.addFiles(
        files.map((data) => ({ data, name: data.name, type: data.type, source: "file-picker" })),
      );
    } catch (error) {
      console.warn("[opendazz] import failed", error);
      announce("Some files could not be added. Try fewer photos or clips.");
    }
    input.value = "";
  };
  input.addEventListener("change", onChange);
  const unsubscribe = mediaStore.subscribe(
    (state) => state.items.map((item) => item.importId).filter((id): id is string => !!id),
    (ids) => {
      const retained = new Set(ids);
      for (const file of uppy.getFiles()) if (!retained.has(file.id)) uppy.removeFile(file.id);
    },
    { equalityFn: (a, b) => a.length === b.length && a.every((id, index) => id === b[index]) },
  );
  return () => {
    input.removeEventListener("change", onChange);
    unsubscribe();
    uppy.destroy();
  };
}
