/* @ts-self-types="./openfuji_wasm.d.ts" */
import * as wasm from "./openfuji_wasm_bg.wasm";
import { __wbg_set_wasm } from "./openfuji_wasm_bg.js";

__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    apply, engine_version
} from "./openfuji_wasm_bg.js";
