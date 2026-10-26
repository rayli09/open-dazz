// Video.js supplies the controls, seek/volume semantics, keyboard behavior and
// announcements. Our canvas is a filtered rendering surface, never a fake <video>.
import "@videojs/html/video/player";
import "@videojs/html/ui/container";
import "@videojs/html/ui/play-button";
import "@videojs/html/ui/time-slider";
import "@videojs/html/ui/volume-slider";
import "@videojs/html/ui/slider-track";
import "@videojs/html/ui/slider-buffer";
import "@videojs/html/ui/slider-fill";
import "@videojs/html/ui/slider-thumb";
import "@videojs/html/ui/time";
import "@videojs/html/ui/mute-button";
import "@videojs/html/ui/fullscreen-button";
import "@videojs/html/ui/hotkey";
import "@videojs/html/ui/status-announcer";
import { icon } from "./icons";
import { mediaStore, type MediaItem } from "./media-store";

export type FrameProcessor = ((
  px: Uint8Array,
  w: number,
  h: number,
  frame: number,
) => Uint8Array) & { dispose?: () => void };
export class FilteredVideoPlayer {
  readonly video: HTMLVideoElement;
  readonly canvas: HTMLCanvasElement;
  private id: string | null = null;
  private processor: FrameProcessor | null = null;
  private callback: number | null = null;
  private renderedAt = -Infinity;
  private work = document.createElement("canvas");
  private events = new AbortController();
  private restoreTime = 0;
  private compare: HTMLButtonElement;
  private badge: HTMLElement;
  private hint: HTMLElement;
  readonly host: HTMLElement;
  private resetProcessor: () => void;
  constructor(host: HTMLElement, resetProcessor: () => void) {
    this.host = host;
    this.resetProcessor = resetProcessor;
    host.innerHTML = `<div class="player-heading"><span id="player-badge" role="status">Preparing filtered preview…</span><button id="player-compare" type="button" aria-pressed="false">Show original</button></div>
    <video-player><media-container class="workshop-player" aria-label="Video preview">
      <div class="player-picture"><video id="source-video" playsinline preload="metadata" disablepictureinpicture disableremoteplayback></video><canvas id="video-filter" aria-label="Live filtered video preview"></canvas><span class="player-overlay-badge" aria-hidden="true"></span></div>
      <div class="player-controls">
        <media-time-slider aria-label="Seek video" class="player-timeline"><media-slider-track><media-slider-buffer></media-slider-buffer><media-slider-fill></media-slider-fill></media-slider-track><media-slider-thumb></media-slider-thumb></media-time-slider>
        <div class="player-buttons"><media-play-button><span class="when-paused">${icon("play", "player-icon")}</span><span class="when-playing">${icon("pause", "player-icon")}</span><span class="when-ended">${icon("replay", "player-icon")}</span></media-play-button><media-time type="current"></media-time><span class="player-time-separator">/</span><media-time type="duration"></media-time><span class="player-spacer"></span><media-mute-button><span class="when-muted">Unmute</span><span class="when-unmuted">Mute</span></media-mute-button><media-volume-slider aria-label="Volume"><media-slider-track><media-slider-fill></media-slider-fill></media-slider-track><media-slider-thumb></media-slider-thumb></media-volume-slider><media-fullscreen-button><span class="when-not-fullscreen">${icon("fullscreen", "player-icon")}</span><span class="when-fullscreen">${icon("exit-fullscreen", "player-icon")}</span></media-fullscreen-button></div>
      </div>
      <media-hotkey keys="Space" action="togglePaused"></media-hotkey><media-hotkey keys="ArrowLeft" action="seekStep" value="-5"></media-hotkey><media-hotkey keys="ArrowRight" action="seekStep" value="5"></media-hotkey><media-hotkey keys="m" action="toggleMuted"></media-hotkey><media-hotkey keys="f" action="toggleFullscreen"></media-hotkey><media-status-announcer></media-status-announcer>
    </media-container></video-player><p id="player-hint">Preview quality · original audio. Export saves the full filtered clip.</p>`;
    this.video = host.querySelector("video")!;
    this.canvas = host.querySelector("canvas")!;
    this.compare = host.querySelector("#player-compare")!;
    this.badge = host.querySelector("#player-badge")!;
    this.hint = host.querySelector("#player-hint")!;
    const options = { signal: this.events.signal };
    this.compare.addEventListener(
      "click",
      () => {
        const item = mediaStore.getState().items.find((item) => item.id === this.id);
        if (!item) return;
        mediaStore.getState().updatePlayback(item.id, {
          view: item.playback.view === "filtered" ? "original" : "filtered",
        });
        this.updateView();
        this.render();
      },
      options,
    );
    this.video.addEventListener(
      "loadedmetadata",
      () => {
        if (!this.id) return;
        if (Number.isFinite(this.video.duration)) {
          const time = Math.min(this.restoreTime, Math.max(0, this.video.duration));
          if (Math.abs(this.video.currentTime - time) > 0.01) this.video.currentTime = time;
        }
        this.sync();
      },
      options,
    );
    for (const event of ["timeupdate", "volumechange", "play", "pause", "ended", "durationchange"])
      this.video.addEventListener(
        event,
        () => {
          this.sync();
          if (event === "play") this.schedule();
        },
        options,
      );
    this.video.addEventListener("loadeddata", () => this.render(), options);
    this.video.addEventListener(
      "seeked",
      () => {
        this.renderedAt = -Infinity;
        this.resetProcessor();
        this.render();
        this.sync();
      },
      options,
    );
    this.video.addEventListener(
      "error",
      () => {
        if (!this.id) return;
        this.video.pause();
        this.badge.textContent = "Playback unavailable";
        this.hint.textContent =
          "This browser cannot play this codec. You can still export the filtered clip as MP4.";
        this.sync();
      },
      options,
    );
  }
  load(item: MediaItem) {
    this.detach();
    this.id = item.id;
    this.restoreTime = item.playback.currentTime;
    this.video.volume = item.playback.volume;
    this.video.muted = item.playback.muted;
    this.video.src = item.sourceUrl;
    this.video.load();
    this.hint.textContent =
      "Preview quality · original audio. Export saves the full filtered clip.";
    this.updateView();
  }
  setProcessor(processor: FrameProcessor) {
    this.processor?.dispose?.();
    this.processor = processor;
    this.renderedAt = -Infinity;
    this.render();
    this.schedule();
  }
  preparing() {
    this.processor?.dispose?.();
    this.processor = null;
    this.canvas.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.updateView();
  }
  fit(width: number, height: number, ratio: number) {
    this.host.style.width = `${width}px`;
    const overhead =
      (this.host.querySelector<HTMLElement>(".player-heading")?.offsetHeight ?? 36) +
      (this.host.querySelector<HTMLElement>(".player-controls")?.offsetHeight ?? 90) +
      (this.host.querySelector<HTMLElement>("#player-hint")?.offsetHeight ?? 32) +
      (this.host.parentElement?.querySelector<HTMLElement>("figcaption")?.offsetHeight ?? 30) +
      32;
    const playerWidth = Math.max(180, Math.min(width, Math.max(100, height - overhead) * ratio));
    this.host.style.width = `${Math.min(width, playerWidth)}px`;
    this.host.querySelector<HTMLElement>(".player-picture")!.style.aspectRatio = String(ratio);
  }
  private updateView() {
    const original =
      mediaStore.getState().items.find((item) => item.id === this.id)?.playback.view === "original";
    this.canvas.hidden = original;
    this.compare.setAttribute("aria-pressed", String(original));
    this.compare.textContent = original ? "Show filtered" : "Show original";
    const label = original
      ? "Original video · unfiltered"
      : this.processor
        ? "Filtered video · live preview"
        : "Preparing filtered preview…";
    if (this.badge.textContent !== label) this.badge.textContent = label;
    const overlay = this.host.querySelector(".player-overlay-badge")!;
    if (overlay.textContent !== label) overlay.textContent = label;
  }
  private sync(force = false) {
    if (!this.id || (!force && mediaStore.getState().selectedId !== this.id)) return;
    mediaStore.getState().updatePlayback(this.id, {
      currentTime: Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0,
      duration: Number.isFinite(this.video.duration) ? this.video.duration : 0,
      volume: this.video.volume,
      muted: this.video.muted,
      playing: !this.video.paused && !this.video.ended,
    });
  }
  private render() {
    if (
      !this.id ||
      !this.processor ||
      this.video.readyState < 2 ||
      mediaStore.getState().selectedId !== this.id
    )
      return;
    if (!this.video.paused && performance.now() - this.renderedAt < 80) return;
    this.renderedAt = performance.now();
    const width = this.video.videoWidth,
      height = this.video.videoHeight;
    if (!width || !height) return;
    const scale = Math.min(1, 480 / Math.max(width, height));
    const w = Math.max(2, Math.round(width * scale)),
      h = Math.max(2, Math.round(height * scale));
    if (this.work.width !== w || this.work.height !== h) {
      this.work.width = w;
      this.work.height = h;
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.work.getContext("2d", { willReadFrequently: true })!;
    try {
      ctx.drawImage(this.video, 0, 0, w, h);
      const pixels = new Uint8Array(ctx.getImageData(0, 0, w, h).data);
      const result = this.processor(pixels, w, h, Math.round(this.video.currentTime * 30));
      this.canvas
        .getContext("2d")!
        .putImageData(new ImageData(new Uint8ClampedArray(result), w, h), 0, 0);
      this.updateView();
    } catch (error) {
      this.video.pause();
      this.preparing();
      this.badge.textContent = "Filtered preview unavailable";
      this.hint.textContent = `Preview failed: ${error instanceof Error ? error.message : String(error)}. Try another look.`;
    }
  }
  private schedule() {
    if (this.callback !== null || !this.id || this.video.paused) return;
    this.callback = this.video.requestVideoFrameCallback(() => {
      this.callback = null;
      this.render();
      this.schedule();
    });
  }
  detach() {
    if (document.fullscreenElement && this.host.contains(document.fullscreenElement))
      void document.exitFullscreen().catch(() => {});
    this.video.pause();
    this.sync(true);
    this.id = null;
    if (this.callback !== null) this.video.cancelVideoFrameCallback(this.callback);
    this.callback = null;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.processor?.dispose?.();
    this.processor = null;
    this.canvas.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  destroy() {
    this.detach();
    this.events.abort();
    this.host.replaceChildren();
  }
}
