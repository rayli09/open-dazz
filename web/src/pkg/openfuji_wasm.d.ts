/* tslint:disable */
/* eslint-disable */

/**
 * Apply a recipe (JSON, same schema as the CLI) with an optional base
 * LUT (.cube text) to an RGBA pixel buffer. Alpha is passed through.
 */
export function apply(rgba: Uint8Array, width: number, height: number, recipe_json: string, cube_text?: string | null): Uint8Array;

/**
 * Engine version string, for the web app's "about" line.
 */
export function engine_version(): string;
