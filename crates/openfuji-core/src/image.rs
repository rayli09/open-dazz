//! Pixel/buffer conversions between the `image` crate's u8 world
//! and the pipeline's f32 world.
//!
//! The conversion semantics here are part of the output contract:
//! f32 -> u8 TRUNCATES after clamping (it has never rounded), so
//! every stage's output bytes match what the engine has always
//! produced.

use crate::math::clamp01;

/// One u8 pixel -> [r, g, b] in 0..=1.
#[inline]
pub fn px_to_f32(px: &image::Rgb<u8>) -> [f32; 3] {
    [
        px[0] as f32 / 255.0,
        px[1] as f32 / 255.0,
        px[2] as f32 / 255.0,
    ]
}

/// [r, g, b] in 0..=1 -> one u8 pixel (clamp, scale, truncate).
#[inline]
pub fn f32_to_px(rgb: [f32; 3]) -> image::Rgb<u8> {
    image::Rgb([
        (clamp01(rgb[0]) * 255.0) as u8,
        (clamp01(rgb[1]) * 255.0) as u8,
        (clamp01(rgb[2]) * 255.0) as u8,
    ])
}

// ---------- spatial ops on single-channel f32 planes ----------
//
// These mirror the OpenCV operations the camcorder pipeline was
// built on (area downscale, bilinear resample, separable gaussian,
// affine/remap sampling), closely enough that ports verify against
// the Python reference within a small tolerance. Planes are
// row-major, `w * h` long.

/// cv2 BORDER_REFLECT_101 index mapping (edge pixel NOT repeated) —
/// OpenCV's default border for filters.
#[inline]
fn reflect101(mut i: isize, n: usize) -> usize {
    if n == 1 {
        return 0;
    }
    let n = n as isize;
    while i < 0 || i >= n {
        if i < 0 {
            i = -i;
        }
        if i >= n {
            i = 2 * n - 2 - i;
        }
    }
    i as usize
}

/// cv2 BORDER_REFLECT index mapping (edge pixel repeated).
#[inline]
fn reflect_edge(mut i: isize, n: usize) -> usize {
    if n == 1 {
        return 0;
    }
    let n = n as isize;
    while i < 0 || i >= n {
        if i < 0 {
            i = -i - 1;
        }
        if i >= n {
            i = 2 * n - 1 - i;
        }
    }
    i as usize
}

/// Bilinear sample at fractional coords, BORDER_REFLECT (edge repeated).
#[inline]
pub fn sample_bilinear_reflect(src: &[f32], w: usize, h: usize, x: f32, y: f32) -> f32 {
    let x0 = x.floor() as isize;
    let y0 = y.floor() as isize;
    let fx = x - x0 as f32;
    let fy = y - y0 as f32;
    let (xa, xb) = (reflect_edge(x0, w), reflect_edge(x0 + 1, w));
    let (ya, yb) = (reflect_edge(y0, h), reflect_edge(y0 + 1, h));
    let top = src[ya * w + xa] * (1.0 - fx) + src[ya * w + xb] * fx;
    let bot = src[yb * w + xa] * (1.0 - fx) + src[yb * w + xb] * fx;
    top * (1.0 - fy) + bot * fy
}

/// Area-weighted resample (cv2 INTER_AREA semantics; also a correct
/// upscale, though bilinear is preferred there).
pub fn resize_area(src: &[f32], w: usize, h: usize, nw: usize, nh: usize) -> Vec<f32> {
    if nw == w && nh == h {
        return src.to_vec();
    }
    let sx = w as f64 / nw as f64;
    let sy = h as f64 / nh as f64;
    let mut out = vec![0.0f32; nw * nh];
    for dy in 0..nh {
        let y0 = dy as f64 * sy;
        let y1 = y0 + sy;
        let iy0 = y0.floor() as usize;
        let iy1 = (y1.ceil() as usize).min(h);
        for dx in 0..nw {
            let x0 = dx as f64 * sx;
            let x1 = x0 + sx;
            let ix0 = x0.floor() as usize;
            let ix1 = (x1.ceil() as usize).min(w);
            let mut acc = 0.0f64;
            for iy in iy0..iy1.max(iy0 + 1) {
                let wy = (y1.min((iy + 1) as f64) - y0.max(iy as f64)).max(0.0);
                if wy == 0.0 {
                    continue;
                }
                for ix in ix0..ix1.max(ix0 + 1) {
                    let wx = (x1.min((ix + 1) as f64) - x0.max(ix as f64)).max(0.0);
                    acc += src[iy.min(h - 1) * w + ix.min(w - 1)] as f64 * wx * wy;
                }
            }
            out[dy * nw + dx] = (acc / (sx * sy)) as f32;
        }
    }
    out
}

/// Bilinear resample (cv2 INTER_LINEAR coordinate mapping,
/// coordinates clamped to the frame edge).
pub fn resize_bilinear(src: &[f32], w: usize, h: usize, nw: usize, nh: usize) -> Vec<f32> {
    if nw == w && nh == h {
        return src.to_vec();
    }
    let sx = w as f32 / nw as f32;
    let sy = h as f32 / nh as f32;
    let mut out = vec![0.0f32; nw * nh];
    for dy in 0..nh {
        let fy = ((dy as f32 + 0.5) * sy - 0.5).clamp(0.0, (h - 1) as f32);
        let y0 = fy.floor() as usize;
        let y1 = (y0 + 1).min(h - 1);
        let ty = fy - y0 as f32;
        for dx in 0..nw {
            let fx = ((dx as f32 + 0.5) * sx - 0.5).clamp(0.0, (w - 1) as f32);
            let x0 = fx.floor() as usize;
            let x1 = (x0 + 1).min(w - 1);
            let tx = fx - x0 as f32;
            let top = src[y0 * w + x0] * (1.0 - tx) + src[y0 * w + x1] * tx;
            let bot = src[y1 * w + x0] * (1.0 - tx) + src[y1 * w + x1] * tx;
            out[dy * nw + dx] = top * (1.0 - ty) + bot * ty;
        }
    }
    out
}

fn gaussian_kernel(sigma: f32) -> Vec<f32> {
    if sigma <= 0.0 {
        return vec![1.0];
    }
    let radius = (sigma * 3.0).ceil() as usize;
    let mut k = Vec::with_capacity(2 * radius + 1);
    let mut sum = 0.0f32;
    for i in 0..=(2 * radius) {
        let x = i as f32 - radius as f32;
        let v = (-x * x / (2.0 * sigma * sigma)).exp();
        k.push(v);
        sum += v;
    }
    for v in &mut k {
        *v /= sum;
    }
    k
}

/// Separable gaussian blur (cv2 GaussianBlur, default border).
pub fn gaussian_blur(src: &[f32], w: usize, h: usize, sigma_x: f32, sigma_y: f32) -> Vec<f32> {
    let kx = gaussian_kernel(sigma_x);
    let ky = gaussian_kernel(sigma_y);
    let rx = (kx.len() - 1) as isize / 2;
    let ry = (ky.len() - 1) as isize / 2;
    let mut tmp = vec![0.0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let mut acc = 0.0;
            for (ki, kv) in kx.iter().enumerate() {
                let sx = reflect101(x as isize + ki as isize - rx, w);
                acc += src[y * w + sx] * kv;
            }
            tmp[y * w + x] = acc;
        }
    }
    let mut out = vec![0.0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let mut acc = 0.0;
            for (ki, kv) in ky.iter().enumerate() {
                let sy = reflect101(y as isize + ki as isize - ry, h);
                acc += tmp[sy * w + x] * kv;
            }
            out[y * w + x] = acc;
        }
    }
    out
}

/// Affine warp (cv2 warpAffine): `m` is the forward content
/// transform `[a b tx; c d ty]`; sampling uses its inverse, with
/// BORDER_REFLECT at the edges.
pub fn warp_affine(src: &[f32], w: usize, h: usize, m: [f32; 6]) -> Vec<f32> {
    let [a, b, tx, c, d, ty] = m;
    let det = a * d - b * c;
    if det.abs() < 1e-9 {
        return src.to_vec();
    }
    let ia = d / det;
    let ib = -b / det;
    let ic = -c / det;
    let id = a / det;
    let itx = -(ia * tx + ib * ty);
    let ity = -(ic * tx + id * ty);
    let mut out = vec![0.0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let sx = ia * x as f32 + ib * y as f32 + itx;
            let sy = ic * x as f32 + id * y as f32 + ity;
            out[y * w + x] = sample_bilinear_reflect(src, w, h, sx, sy);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversions_roundtrip_bytes() {
        for v in [0u8, 1, 63, 128, 200, 254, 255] {
            let px = image::Rgb([v, v, v]);
            assert_eq!(f32_to_px(px_to_f32(&px)), px);
        }
    }

    #[test]
    fn f32_to_px_clamps() {
        assert_eq!(f32_to_px([1.4, -0.2, 0.5]), image::Rgb([255, 0, 127]));
    }
}
