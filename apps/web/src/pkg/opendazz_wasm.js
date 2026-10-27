/* @ts-self-types="./opendazz_wasm.d.ts" */
import * as wasm from "./opendazz_wasm_bg.wasm";
import { __wbg_set_wasm } from "./opendazz_wasm_bg.js";

__wbg_set_wasm(wasm);

export {
    CamcorderSim, apply, apply_camcorder, apply_phone, apply_vhs, engine_version
} from "./opendazz_wasm_bg.js";
