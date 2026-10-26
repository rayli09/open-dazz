import { mediaStore, type MediaItem } from "./media-store";
// One temporary decoder at a time. These small source thumbnails never retain
// full-resolution pixels or take over the selected item's playback element.
export function setupMediaThumbnails() {
  const attempted = new Set<string>();
  let current: { id: string; cancel: () => void } | null = null;
  let stopped = false;
  const make = (item: MediaItem) =>
    new Promise<void>((resolve) => {
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      const events = new AbortController();
      let complete = false;
      const finish = () => {
        if (complete) return;
        complete = true;
        clearTimeout(timer);
        events.abort();
        video.removeAttribute("src");
        video.load();
        resolve();
      };
      const timer = setTimeout(finish, 8000);
      current = { id: item.id, cancel: finish };
      video.addEventListener("error", finish, { signal: events.signal });
      video.addEventListener(
        "loadeddata",
        () => {
          if (
            !stopped &&
            mediaStore.getState().items.some((media) => media.id === item.id) &&
            video.videoWidth &&
            video.videoHeight
          ) {
            const scale = Math.min(1, 160 / Math.max(video.videoWidth, video.videoHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
            try {
              canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
              mediaStore
                .getState()
                .updateStatus(item.id, { thumbnail: canvas.toDataURL("image/jpeg", 0.7) });
            } catch {
              /* Selected decoder can still provide its poster. */
            }
          }
          finish();
        },
        { signal: events.signal },
      );
      video.src = item.sourceUrl;
      video.load();
    });
  const pump = async () => {
    if (current || stopped) return;
    const item = mediaStore
      .getState()
      .items.find((item) => item.kind === "video" && !item.thumbnail && !attempted.has(item.id));
    if (!item) return;
    attempted.add(item.id);
    await make(item);
    current = null;
    if (!stopped) void pump();
  };
  const stop = mediaStore.subscribe(
    (s) => s.items,
    (items) => {
      if (current && !items.some((item) => item.id === current!.id)) current.cancel();
      void pump();
    },
  );
  return () => {
    stopped = true;
    stop();
    current?.cancel();
    attempted.clear();
  };
}
