// Instantiate wasm-bindgen's bundler output explicitly. Bun imports .wasm
// as a module rather than the export namespace expected by the browser glue.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export async function loadWasm(pkg) {
  const bindings = await import(pathToFileURL(resolve(pkg, "opendazz_wasm_bg.js")).href);
  const { instance } = await WebAssembly.instantiate(
    readFileSync(resolve(pkg, "opendazz_wasm_bg.wasm")),
    { "./opendazz_wasm_bg.js": bindings },
  );
  bindings.__wbg_set_wasm(instance.exports);
  return bindings;
}
