import importlib.util, sys
import numpy as np, cv2
spec = importlib.util.spec_from_file_location("camcorder", "/home/hatch/workspace/camcorder-pipeline/src/camcorder.py")
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

class NeutralDrift:
    def at(self, i): return (1.0, 0.0, 0.0, 0.0, 0.0)
class ZeroRng:
    def standard_normal(self, shape, dtype=np.float32): return np.zeros(shape, dtype=dtype)

for name in ["park_day", "rain_night"]:
    inp = cv2.imread(f"/home/hatch/workspace/camcorder-pipeline/ios/GoldenFrames/{name}_input.png")
    assert inp is not None and inp.shape[1] == 960 and inp.shape[0] == 540, (name, None if inp is None else inp.shape)
    cam = mod.Camcorder(1, seed=7)
    cam.drift = NeutralDrift(); cam.rng = ZeroRng()
    out_bgr = cam.process(inp, 0)
    out_rgb = cv2.cvtColor(out_bgr, cv2.COLOR_BGR2RGB)
    out_rgb.tofile(f"crates/opendazz-core/tests/fixtures/cx405_{name}_ref.rgb")
    inp_rgb = cv2.cvtColor(inp, cv2.COLOR_BGR2RGB)
    inp_rgb.tofile(f"crates/opendazz-core/tests/fixtures/cx405_{name}_in.rgb")
    print(name, "ref mean", out_rgb.mean(axis=(0,1)).round(2))
print("fixtures written")
