import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { z } from "zod";
import type { Recipe } from "./schemas";
import { DEFAULT_PHOTO } from "./simple-presets";

export const MAX_MEDIA = 24;
export const MEDIA_FILE_TYPES = [
  "image/*",
  "video/*",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
  ".mp4",
  ".m4v",
  ".mov",
  ".webm",
  ".mkv",
] as const;
export const MAX_FILE_BYTES = 512 * 1024 * 1024;
const photoExtension = /\.(jpe?g|png|webp|avif|gif|bmp|heic|heif|tiff?)$/i;
const videoExtension = /\.(mp4|m4v|mov|webm|mkv)$/i;
export const FileMetadataSchema = z
  .object({
    name: z.string().min(1),
    type: z.string(),
    size: z.number().int().positive().max(MAX_FILE_BYTES),
    lastModified: z.number().finite().nonnegative(),
  })
  .refine(
    (f) =>
      f.type.startsWith("image/") ||
      f.type.startsWith("video/") ||
      photoExtension.test(f.name) ||
      videoExtension.test(f.name),
    { message: "Choose a supported photo or video." },
  );
export const PlaybackSchema = z.object({
  currentTime: z.number().nonnegative().default(0),
  duration: z.number().nonnegative().default(0),
  volume: z.number().min(0).max(1).default(1),
  muted: z.boolean().default(false),
  playing: z.boolean().default(false),
  view: z.enum(["filtered", "original"]).default("filtered"),
});
export type Playback = z.infer<typeof PlaybackSchema>;
export interface MediaEdit {
  lookId: string;
  recipe: Recipe | null;
  split: number;
  collection: "photo" | "video";
  photoLookId: string;
  videoLookId: string;
}
export interface MediaItem {
  id: string;
  fingerprint: string;
  importId: string | null;
  name: string;
  kind: "photo" | "video";
  source: File | string;
  sourceUrl: string;
  thumbnail: string | null;
  status: "queued" | "loading" | "ready" | "error";
  error: string | null;
  edit: MediaEdit;
  playback: Playback;
}
interface MediaState {
  items: MediaItem[];
  selectedId: string | null;
  addFiles: (files: { file: File; importId?: string }[]) => {
    added: string[];
    duplicates: string[];
    errors: string[];
  };
  addSample: (url: string, name: string) => string;
  select: (id: string) => void;
  remove: (id: string) => void;
  move: (id: string, offset: number) => void;
  updateEdit: (id: string, patch: Partial<MediaEdit>) => void;
  updatePlayback: (id: string, patch: Partial<Playback>) => void;
  updateStatus: (
    id: string,
    patch: Partial<Pick<MediaItem, "status" | "error" | "thumbnail">>,
  ) => void;
  clear: () => void;
}
export const fileFingerprint = (file: Pick<File, "name" | "size" | "lastModified" | "type">) =>
  JSON.stringify([file.name, file.size, file.lastModified, file.type]);
export const mediaKind = (file: Pick<File, "name" | "type">): MediaItem["kind"] =>
  file.type.startsWith("video/") || videoExtension.test(file.name) ? "video" : "photo";
const initialEdit = (): MediaEdit => ({
  lookId: DEFAULT_PHOTO.recipeId,
  recipe: null,
  split: 50,
  collection: "photo",
  photoLookId: DEFAULT_PHOTO.recipeId,
  videoLookId: "camcorder/cx405",
});
interface Resources {
  createUrl: (file: File) => string;
  revokeUrl: (url: string) => void;
  id: () => string;
}
export function createMediaStore(
  resources: Resources = {
    createUrl: (file) => URL.createObjectURL(file),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    id: () => crypto.randomUUID(),
  },
) {
  return createStore<MediaState>()(
    subscribeWithSelector((set, get) => {
      const update = (id: string, change: (item: MediaItem) => MediaItem) => {
        if (!get().items.some((item) => item.id === id)) return; // Async work cannot resurrect removed media.
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? change(item) : item)),
        }));
      };
      const release = (item: MediaItem) => {
        if (item.source instanceof File) resources.revokeUrl(item.sourceUrl);
      };
      return {
        items: [],
        selectedId: null,
        addFiles: (files) => {
          const items = [...get().items];
          const added: string[] = [],
            duplicates: string[] = [],
            errors: string[] = [];
          for (const { file, importId } of files) {
            const parsed = FileMetadataSchema.safeParse({
              name: file.name,
              type: file.type,
              size: file.size,
              lastModified: file.lastModified,
            });
            if (!parsed.success) {
              errors.push(
                `${file.name}: ${file.size > MAX_FILE_BYTES ? "maximum file size is 512 MB" : "choose a non-empty photo or video"}`,
              );
              continue;
            }
            const fingerprint = fileFingerprint(file);
            const existing = items.find((item) => item.fingerprint === fingerprint);
            if (existing) {
              duplicates.push(existing.id);
              continue;
            }
            if (items.length >= MAX_MEDIA) {
              errors.push(`Keep up to ${MAX_MEDIA} items in the dock.`);
              continue;
            }
            const id = resources.id(),
              sourceUrl = resources.createUrl(file);
            items.push({
              id,
              fingerprint,
              importId: importId ?? null,
              name: file.name,
              kind: mediaKind(file),
              source: file,
              sourceUrl,
              thumbnail: mediaKind(file) === "photo" ? sourceUrl : null,
              status: "queued",
              error: null,
              edit: initialEdit(),
              playback: PlaybackSchema.parse({}),
            });
            added.push(id);
          }
          if (added.length)
            set({
              items: items.map((item) =>
                item.playback.playing
                  ? { ...item, playback: { ...item.playback, playing: false } }
                  : item,
              ),
              selectedId: added[0],
            });
          else if (duplicates.length) get().select(duplicates[0]);
          return { added, duplicates, errors };
        },
        addSample: (url, name) => {
          const existing = get().items.find((item) => item.fingerprint === `sample:${url}`);
          if (existing) {
            get().select(existing.id);
            return existing.id;
          }
          if (get().items.length >= MAX_MEDIA)
            throw new Error(`Keep up to ${MAX_MEDIA} items in the dock.`);
          const id = resources.id();
          set((state) => ({
            items: [
              ...state.items.map((item) =>
                item.playback.playing
                  ? { ...item, playback: { ...item.playback, playing: false } }
                  : item,
              ),
              {
                id,
                fingerprint: `sample:${url}`,
                importId: null,
                name,
                kind: "photo",
                source: url,
                sourceUrl: url,
                thumbnail: url,
                status: "queued",
                error: null,
                edit: initialEdit(),
                playback: PlaybackSchema.parse({}),
              },
            ],
            selectedId: id,
          }));
          return id;
        },
        select: (id) => {
          if (get().selectedId === id || !get().items.some((item) => item.id === id)) return;
          set((state) => ({
            selectedId: id,
            items: state.items.map((item) =>
              item.playback.playing
                ? { ...item, playback: { ...item.playback, playing: false } }
                : item,
            ),
          }));
        },
        remove: (id) => {
          const state = get();
          const index = state.items.findIndex((item) => item.id === id);
          if (index < 0) return;
          const removed = state.items[index],
            items = state.items.filter((item) => item.id !== id);
          set({
            items,
            selectedId:
              state.selectedId === id
                ? (items[Math.min(index, items.length - 1)]?.id ?? null)
                : state.selectedId,
          });
          release(removed);
        },
        move: (id, offset) => {
          const items = [...get().items],
            index = items.findIndex((item) => item.id === id);
          if (index < 0) return;
          const next = Math.min(items.length - 1, Math.max(0, index + offset));
          if (next === index) return;
          items.splice(next, 0, items.splice(index, 1)[0]);
          set({ items });
        },
        updateEdit: (id, patch) =>
          update(id, (item) => ({ ...item, edit: { ...item.edit, ...structuredClone(patch) } })),
        updatePlayback: (id, patch) =>
          update(id, (item) => ({ ...item, playback: { ...item.playback, ...patch } })),
        updateStatus: (id, patch) => update(id, (item) => ({ ...item, ...patch })),
        clear: () => {
          const items = get().items;
          set({ items: [], selectedId: null });
          items.forEach(release);
        },
      };
    }),
  );
}
export const mediaStore = createMediaStore();
export const selectedMedia = (state: MediaState) =>
  state.items.find((item) => item.id === state.selectedId);
