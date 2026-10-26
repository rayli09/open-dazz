import { checkPhotoSize, type PhotoExportRequest } from "./photo-export-contract";
self.onmessage = async ({ data }: MessageEvent<PhotoExportRequest>) => {
    const { bitmap, snapshot } = data;
    try {
        const engine = await import("./pkg/opendazz_wasm.js");
        const w = bitmap.width, h = bitmap.height;
        checkPhotoSize(w, h);
        if (typeof OffscreenCanvas === "undefined")
            throw new Error("This browser does not support background photo export. Use a current browser.");
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx)
            throw new Error("Could not allocate the original-size canvas. Try a smaller copy.");
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const input = new Uint8Array(ctx.getImageData(0, 0, w, h).data);
        const output = snapshot.kind === "recipe" ? engine.apply(input, w, h, JSON.stringify(snapshot.recipe), snapshot.cube)
            : snapshot.kind === "phone" ? engine.apply_phone(input, w, h, snapshot.preset, 0)
                : snapshot.kind === "cx405" ? engine.apply_camcorder(input, w, h)
                    : engine.apply_vhs(input, w, h, "vhs", 0);
        ctx.putImageData(new ImageData(new Uint8ClampedArray(output), w, h), 0, 0);
        const blob = await canvas.convertToBlob({ type: "image/png" });
        self.postMessage({ ok: true, blob });
    }
    catch (error) {
        bitmap.close();
        self.postMessage({ ok: false, error: error instanceof Error ? error.message : "Photo export failed. Try a smaller copy." });
    }
};
