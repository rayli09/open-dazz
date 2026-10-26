// Compile against wasm-bindgen's generated public declarations. These failures
// must remain errors: an accidental `any` or stale handwritten shim fails CI.
import type * as Wasm from "../src/pkg/opendazz_wasm.js";
declare const engine: typeof Wasm;
const rgba = new Uint8Array(4);
const photo: Uint8Array = engine.apply(rgba, 1, 1, '{"name":"test"}');
const camera: Wasm.CamcorderSim = new engine.CamcorderSim(7n);
const frame: Uint8Array = camera.process(photo, 1, 1, 0);
camera.free();
// @ts-expect-error generated ABI requires bytes, not a string
engine.apply("pixels", 1, 1, "{}");
// @ts-expect-error recipes cross the generated ABI as JSON strings
engine.apply(frame, 1, 1, { name: "test" });
// @ts-expect-error generated u64 constructor takes a bigint
new engine.CamcorderSim(7);
// @ts-expect-error generated return type is bytes, not a number
const wrong: number = engine.apply_vhs(rgba, 1, 1, "vhs", 0);
void wrong;

const phone: Uint8Array = engine.apply_phone(rgba, 1, 1, "nokia-n95", 2);
// @ts-expect-error frame number must cross the generated ABI as a number
engine.apply_phone(phone, 1, 1, "iphone-4s", "2");
