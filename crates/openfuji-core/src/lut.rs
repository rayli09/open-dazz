/// A 3D LUT parsed from a .cube file. Data layout follows the .cube spec:
/// red varies fastest, then green, then blue.
#[derive(Debug, Clone)]
pub struct Lut3d {
    pub size: usize,
    pub data: Vec<[f32; 3]>,
}

impl Lut3d {
    pub fn parse_cube(text: &str) -> Result<Self, String> {
        let mut size: Option<usize> = None;
        let mut data: Vec<[f32; 3]> = Vec::new();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let mut parts = line.split_whitespace();
            let head = parts.next().unwrap_or("");
            match head {
                "TITLE" | "DOMAIN_MIN" | "DOMAIN_MAX" | "LUT_1D_SIZE" => continue,
                "LUT_3D_SIZE" => {
                    size = parts
                        .next()
                        .and_then(|v| v.parse::<usize>().ok())
                        .filter(|&n| n >= 2);
                }
                _ => {
                    let vals: Vec<f32> = line
                        .split_whitespace()
                        .filter_map(|v| v.parse::<f32>().ok())
                        .collect();
                    if vals.len() == 3 {
                        data.push([vals[0], vals[1], vals[2]]);
                    }
                }
            }
        }
        let size = size.ok_or("missing LUT_3D_SIZE")?;
        if data.len() != size * size * size {
            return Err(format!(
                "expected {} entries for size {}, got {}",
                size * size * size,
                size,
                data.len()
            ));
        }
        Ok(Lut3d { size, data })
    }

    #[inline]
    fn at(&self, r: usize, g: usize, b: usize) -> [f32; 3] {
        self.data[(b * self.size + g) * self.size + r]
    }

    /// Trilinear sample. Input channels in 0.0..=1.0.
    pub fn sample(&self, r: f32, g: f32, b: f32) -> [f32; 3] {
        let n = (self.size - 1) as f32;
        let (x, y, z) = (r.clamp(0.0, 1.0) * n, g.clamp(0.0, 1.0) * n, b.clamp(0.0, 1.0) * n);
        let (x0, y0, z0) = (x.floor() as usize, y.floor() as usize, z.floor() as usize);
        let (x1, y1, z1) = (
            (x0 + 1).min(self.size - 1),
            (y0 + 1).min(self.size - 1),
            (z0 + 1).min(self.size - 1),
        );
        let (fx, fy, fz) = (x - x0 as f32, y - y0 as f32, z - z0 as f32);
        let corners = [
            self.at(x0, y0, z0),
            self.at(x1, y0, z0),
            self.at(x0, y1, z0),
            self.at(x1, y1, z0),
            self.at(x0, y0, z1),
            self.at(x1, y0, z1),
            self.at(x0, y1, z1),
            self.at(x1, y1, z1),
        ];
        let mut out = [0.0f32; 3];
        for (c, o) in out.iter_mut().enumerate() {
            let v00 = lerp(corners[0][c], corners[1][c], fx);
            let v10 = lerp(corners[2][c], corners[3][c], fx);
            let v01 = lerp(corners[4][c], corners[5][c], fx);
            let v11 = lerp(corners[6][c], corners[7][c], fx);
            *o = lerp(lerp(v00, v10, fy), lerp(v01, v11, fy), fz);
        }
        out
    }
}

#[inline]
fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity_cube(size: usize) -> String {
        let mut s = format!("LUT_3D_SIZE {}\n", size);
        for b in 0..size {
            for g in 0..size {
                for r in 0..size {
                    s.push_str(&format!(
                        "{} {} {}\n",
                        r as f32 / (size - 1) as f32,
                        g as f32 / (size - 1) as f32,
                        b as f32 / (size - 1) as f32
                    ));
                }
            }
        }
        s
    }

    #[test]
    fn parses_and_identity_samples() {
        let lut = Lut3d::parse_cube(&identity_cube(4)).unwrap();
        let out = lut.sample(0.2, 0.5, 0.9);
        assert!((out[0] - 0.2).abs() < 1e-6);
        assert!((out[1] - 0.5).abs() < 1e-6);
        assert!((out[2] - 0.9).abs() < 1e-6);
    }

    #[test]
    fn rejects_wrong_entry_count() {
        assert!(Lut3d::parse_cube("LUT_3D_SIZE 2\n0 0 0\n").is_err());
    }
}
