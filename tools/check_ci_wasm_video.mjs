// Before/after regression probe for CI-only loop and RGBA conversion repairs.
// bun tools/check_ci_wasm_video.mjs PKG_DIR OUTPUT_DIR
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadWasm } from './load-wasm.mjs';
const [pkg, output] = process.argv.slice(2);
if (!pkg || !output) throw new Error('Expected package and output directories');
const engine = await loadWasm(resolve(pkg));
mkdirSync(output, { recursive: true });
for (const [w, h] of [[64, 48], [65, 49], [128, 96]]) {
  const input = new Uint8Array(w * h * 4);
  for (let pixel = 0; pixel < w * h; pixel++) {
    for (let c = 0; c < 3; c++) {
      const i = pixel * 3 + c;
      input[pixel * 4 + c] = (i * 37 + Math.floor(i / (w * 3)) * 19) % 256;
    }
    input[pixel * 4 + 3] = (pixel * 17) % 256;
  }
  const save = (name, frame, bytes) => {
    if (bytes.length !== input.length) throw new Error('Unexpected RGBA length');
    for (let i = 3; i < bytes.length; i += 4) {
      if (bytes[i] !== input[i]) throw new Error(`${name}: alpha changed`);
    }
    writeFileSync(join(output, `${name}-${w}x${h}-f${frame}.rgba`), bytes);
  };
  for (const name of ['broadcast', 'vhs', 'vhs-heavy']) {
    for (const frame of [0, 1, 17]) save(name, frame, engine.apply_vhs(input, w, h, name, frame));
  }
  const camera = new engine.CamcorderSim(7n);
  for (const frame of [0, 1, 17]) save('cx405', frame, camera.process(input, w, h, frame));
  camera.free();
}
