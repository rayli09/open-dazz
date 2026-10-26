/* tslint:disable */
/* eslint-disable */

/**
 * Stateful CX405 camcorder for VIDEO: one instance per clip, so
 * the drift/noise streams evolve across frames exactly like the
 * core pipeline (and the CLI) instead of restarting every frame.
 */
export class CamcorderSim {
    free(): void;
    [Symbol.dispose](): void;
    constructor(seed: bigint);
    /**
     * Process one RGBA frame; `frame` is the frame index in the
     * clip (drives the temporal stages).
     */
    process(rgba: Uint8Array, width: number, height: number, frame: number): Uint8Array;
}

/**
 * Apply a recipe (JSON, same schema as the CLI) with an optional base
 * LUT (.cube text) to an RGBA pixel buffer. Alpha is passed through.
 */
export function apply(rgba: Uint8Array, width: number, height: number, recipe_json: string, cube_text?: string | null): Uint8Array;

/**
 * Run the CX405 camcorder simulation on an RGBA buffer (a still
 * is frame 0 of the stream: full pipeline, no temporal smear).
 */
export function apply_camcorder(rgba: Uint8Array, width: number, height: number): Uint8Array;

/**
 * Run the NTSC/VHS composite simulation (vendored ntsc-rs) on an
 * RGBA buffer. `preset`: broadcast | vhs | vhs-heavy. Stills use
 * frame 0; the tape artifacts are deterministic per frame index.
 */
export function apply_vhs(rgba: Uint8Array, width: number, height: number, preset: string, frame: number): Uint8Array;

/**
 * Engine version string, for the web app's "about" line.
 */
export function engine_version(): string;
