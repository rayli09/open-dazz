import { z } from "zod";
import { checkPhotoSize, type PhotoSnapshot, type PhotoExportRequest } from "./photo-export-contract";
export { checkPhotoSize, MAX_PHOTO_PIXELS, MAX_PHOTO_EDGE, type PhotoSnapshot } from "./photo-export-contract";
const ResponseSchema = z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), blob: z.instanceof(Blob) }),
    z.object({ ok: z.literal(false), error: z.string() }),
]);
/** One disposable worker per export: termination cancels synchronous WASM too. */
export function renderOriginalPhoto(bitmap: ImageBitmap, snapshot: PhotoSnapshot, signal: AbortSignal): Promise<Blob> {
    checkPhotoSize(bitmap.width, bitmap.height);
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            bitmap.close();
            reject(new DOMException("Cancelled", "AbortError"));
            return;
        }
        let worker: Worker;
        try {
            worker = new Worker(new URL("./photo-export-worker.ts", import.meta.url), { type: "module" });
        }
        catch (error) {
            bitmap.close();
            reject(error);
            return;
        }
        const finish = (error?: unknown, blob?: Blob) => {
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            worker.terminate();
            if (error)
                reject(error);
            else
                resolve(blob!);
        };
        const abort = () => finish(new DOMException("Cancelled", "AbortError"));
        const timer = setTimeout(() => finish(new Error("Photo export timed out. Try a smaller copy or another browser.")), 120000);
        signal.addEventListener("abort", abort, { once: true });
        worker.onerror = event => { event.preventDefault(); finish(new Error(event.message || "Photo worker failed. Try a smaller copy or another browser.")); };
        worker.onmessage = (event: MessageEvent<unknown>) => {
            const result = ResponseSchema.safeParse(event.data);
            if (!result.success) {
                finish(new Error("Invalid photo export response. Try again."));
                return;
            }
            if (result.data.ok)
                finish(undefined, result.data.blob);
            else
                finish(new Error(result.data.error));
        };
        try {
            worker.postMessage({ bitmap, snapshot } satisfies PhotoExportRequest, [bitmap]);
        }
        catch (error) {
            bitmap.close();
            finish(error);
        }
    });
}
