// floyd_steinberg_dither.rs
// Rust + wasm_bindgen port of the supplied JS Floyd–Steinberg dithering core.
// Builds as WebAssembly and exposes a single function `floyd_steinberg_dither_wasm`
// that accepts Uint8Array inputs (RGBA) and returns a Uint8Array (RGBA) output.

use wasm_bindgen::prelude::*;
use js_sys::Uint8Array;

#[wasm_bindgen]
pub fn floyd_steinberg_dither_wasm(
    original: &Uint8Array,            // flat RGBA (u8)
    prev_dithered: Option<Uint8Array>,// optional previous dithered flat RGBA
    palette: &Uint8Array,             // flat RGB palette (triplets)
    width: usize,
    height: usize,
    freeze_mask: Option<Uint8Array>,  // optional length width*height bytes (0/1)
    ratio: f32,                       // default 0.8
    error_clip: f32,                  // default 255.0
    jitter: f32,                      // default 8.0
    channel_balance: f32,             // default 0.75
    gamma_input: f32,                 // default 1.2
    seed: u32,                        // default 42
    chroma_weight: f32,               // default 0.3
    edge_falloff: f32                 // default 0.5
) -> Result<Uint8Array, JsValue> {
    // Convert inputs to Rust Vec<u8>
    let orig_vec = original.to_vec();
    let prev_vec = prev_dithered.map(|v| v.to_vec());
    let palette_vec = palette.to_vec();
    let freeze_vec = freeze_mask.map(|v| v.to_vec());

    // Basic validation
    let expected_len = width.checked_mul(height)
        .ok_or_else(|| JsValue::from_str("width*height overflow"))?;
    if orig_vec.len() < expected_len * 4 {
        return Err(JsValue::from_str("original buffer too small"));
    }

    if let Some(ref pv) = prev_vec.as_ref() {
        if pv.len() < expected_len * 4 {
            return Err(JsValue::from_str("prev_dithered buffer too small"));
        }
    }
    if palette_vec.len() % 3 != 0 {
        return Err(JsValue::from_str("palette length must be multiple of 3"));
    }
    if let Some(ref fm) = freeze_vec.as_ref() {
        if fm.len() < expected_len {
            return Err(JsValue::from_str("freeze_mask buffer too small"));
        }
    }

    // Helpers
    let f = |x: f32| ((x / 255.0_f32).powf(gamma_input));

    // Precompute palette metadata (linearized palette and chroma/lightness)
    #[derive(Clone)]
    struct PalMeta {
        pl: [f32; 3],
        p_chroma: f32,
        p_lightness: f32,
        is_mid_grey: bool,
    }

    let palette_count = palette_vec.len() / 3;
    let mut palette_meta: Vec<PalMeta> = Vec::with_capacity(palette_count);
    for i in 0..palette_count {
        let r = palette_vec[i * 3] as f32;
        let g = palette_vec[i * 3 + 1] as f32;
        let b = palette_vec[i * 3 + 2] as f32;
        let pl = [f(r), f(g), f(b)];
        let mx = pl[0].max(pl[1]).max(pl[2]);
        let mn = pl[0].min(pl[1]).min(pl[2]);
        let p_chroma = mx - mn;
        let p_lightness = (pl[0] + pl[1] + pl[2]) / 3.0;
        let is_mid_grey = p_chroma < 0.1 && p_lightness > 0.15 && p_lightness < 0.85;
        palette_meta.push(PalMeta { pl, p_chroma, p_lightness, is_mid_grey });
    }

    // weights like [0.3,0.59,0.11] ^ channel_balance
    let base_weights = [0.3_f32, 0.59_f32, 0.11_f32];
    let weights: [f32; 3] = [
        base_weights[0].powf(channel_balance),
        base_weights[1].powf(channel_balance),
        base_weights[2].powf(channel_balance),
    ];

    // Prepare working buffers: error image as f32 RGBA (we will mutate RGB channels)
    let mut error_img: Vec<f32> = Vec::with_capacity(expected_len * 4);
    for i in 0..(expected_len * 4) {
        error_img.push(orig_vec[i] as f32);
    }

    // Output buffer
    let mut output: Vec<u8> = vec![0; expected_len * 4];

    // RNG: same LCG as JS example
    let mut rng_state = seed;
    let mut rand = || {
        rng_state = rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
        (rng_state as f32) / 4294967296.0_f32
    };

    // closure distance_fn that consumes a noisy pixel [r,g,b] in 0..255 as f32 and returns palette index
    let distance_fn = |pixel: [f32; 3]| -> usize {
        let color_lin = [f(pixel[0]), f(pixel[1]), f(pixel[2])];
        let color_chroma = color_lin.iter().cloned().fold(f32::NEG_INFINITY, f32::max)
            - color_lin.iter().cloned().fold(f32::INFINITY, f32::min);

        let mut min_dist = f32::INFINITY;
        let mut best_idx = 0usize;

        for (i, pm) in palette_meta.iter().enumerate() {
            let p = pm.pl;
            let d0 = p[0] - color_lin[0];
            let d1 = p[1] - color_lin[1];
            let d2 = p[2] - color_lin[2];
            let dist = weights[0] * d0 * d0 + weights[1] * d1 * d1 + weights[2] * d2 * d2;

            let grey_penalty = if pm.is_mid_grey && color_chroma > 0.1 {
                color_chroma * chroma_weight
            } else { 0.0 };

            let adjusted = dist + grey_penalty;
            if adjusted < min_dist {
                min_dist = adjusted;
                best_idx = i;
            }
        }
        best_idx
    };

    // Helper to read original per-pixel base (for gradient). We'll access orig_vec directly when needed.
    let orig = &orig_vec;

    // Main loop
    let w = width;
    let h = height;

    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) * 4;

            let old_r = error_img[idx];
            let old_g = error_img[idx + 1];
            let old_b = error_img[idx + 2];
            let alpha = if error_img[idx + 3] == 0.0 { 0.0 } else { error_img[idx + 3] / 255.0 };

            if alpha <= 0.001 {
                output[idx] = 0;
                output[idx + 1] = 0;
                output[idx + 2] = 0;
                output[idx + 3] = 0;
                continue;
            }

            // check frozen
            let is_frozen = if let Some(ref fm) = freeze_vec {
                fm[y * w + x] != 0 && prev_vec.is_some()
            } else { false };

            let new_pixel_rgb: [u8; 3];

            if is_frozen {
                // use prev dithered color
                let pv = prev_vec.as_ref().unwrap();
                new_pixel_rgb = [pv[idx], pv[idx + 1], pv[idx + 2]];
            } else {
                // produce noise (sum of two uniforms minus 1 twice like JS) scaled by jitter/2
                let noise = [
                    ((rand() * 2.0 - 1.0) + (rand() * 2.0 - 1.0)) * (jitter / 2.0),
                    ((rand() * 2.0 - 1.0) + (rand() * 2.0 - 1.0)) * (jitter / 2.0),
                    ((rand() * 2.0 - 1.0) + (rand() * 2.0 - 1.0)) * (jitter / 2.0),
                ];

                let noisy_pixel = [
                    (old_r + noise[0]).max(0.0).min(255.0),
                    (old_g + noise[1]).max(0.0).min(255.0),
                    (old_b + noise[2]).max(0.0).min(255.0),
                ];

                let idx_pal = distance_fn(noisy_pixel);
                // fetch palette entry
                let pr = palette_vec[idx_pal * 3];
                let pg = palette_vec[idx_pal * 3 + 1];
                let pb = palette_vec[idx_pal * 3 + 2];
                new_pixel_rgb = [pr, pg, pb];
            }

            output[idx] = new_pixel_rgb[0];
            output[idx + 1] = new_pixel_rgb[1];
            output[idx + 2] = new_pixel_rgb[2];
            output[idx + 3] = orig[idx + 3];

            // quantization error (clamped by error_clip)
            let quant_error = [
                (orig[idx] as f32 - new_pixel_rgb[0] as f32).max(-error_clip).min(error_clip),
                (orig[idx + 1] as f32 - new_pixel_rgb[1] as f32).max(-error_clip).min(error_clip),
                (orig[idx + 2] as f32 - new_pixel_rgb[2] as f32).max(-error_clip).min(error_clip),
            ];

            // compute local gradient magnitude from original (pre-error) image
            let mut grad_sq = 0.0_f32;
            let base_idx = idx;
            if x > 0 {
                let prev_idx = (y * w + (x - 1)) * 4;
                grad_sq += (orig[base_idx] as f32 - orig[prev_idx] as f32).powi(2)
                    + (orig[base_idx + 1] as f32 - orig[prev_idx + 1] as f32).powi(2)
                    + (orig[base_idx + 2] as f32 - orig[prev_idx + 2] as f32).powi(2);
            }
            if y > 0 {
                let prev_idx = ((y - 1) * w + x) * 4;
                grad_sq += (orig[base_idx] as f32 - orig[prev_idx] as f32).powi(2)
                    + (orig[base_idx + 1] as f32 - orig[prev_idx + 1] as f32).powi(2)
                    + (orig[base_idx + 2] as f32 - orig[prev_idx + 2] as f32).powi(2);
            }
            // normalize gradient
            grad_sq /= 6.0 * 255.0 * 255.0;
            let edge_weight = (-grad_sq * edge_falloff).exp();

            let a_ratio = ratio * alpha * edge_weight * if is_frozen { 0.5 } else { 1.0 };

            // diffuse quantization error using Floyd-Steinberg weights
            // (x+1, y) -> 7/16
            if x + 1 < w {
                let dst = idx + 4;
                error_img[dst] += quant_error[0] * (7.0 / 16.0) * a_ratio;
                error_img[dst + 1] += quant_error[1] * (7.0 / 16.0) * a_ratio;
                error_img[dst + 2] += quant_error[2] * (7.0 / 16.0) * a_ratio;
            }
            // (x-1, y+1) -> 3/16
            if y + 1 < h {
                if x > 0 {
                    let dst = ((y + 1) * w + (x - 1)) * 4;
                    error_img[dst] += quant_error[0] * (3.0 / 16.0) * a_ratio;
                    error_img[dst + 1] += quant_error[1] * (3.0 / 16.0) * a_ratio;
                    error_img[dst + 2] += quant_error[2] * (3.0 / 16.0) * a_ratio;
                }
                // (x, y+1) -> 5/16
                let dst = ((y + 1) * w + x) * 4;
                error_img[dst] += quant_error[0] * (5.0 / 16.0) * a_ratio;
                error_img[dst + 1] += quant_error[1] * (5.0 / 16.0) * a_ratio;
                error_img[dst + 2] += quant_error[2] * (5.0 / 16.0) * a_ratio;

                // (x+1, y+1) -> 1/16
                if x + 1 < w {
                    let dst = ((y + 1) * w + (x + 1)) * 4;
                    error_img[dst] += quant_error[0] * (1.0 / 16.0) * a_ratio;
                    error_img[dst + 1] += quant_error[1] * (1.0 / 16.0) * a_ratio;
                    error_img[dst + 2] += quant_error[2] * (1.0 / 16.0) * a_ratio;
                }
            }
        }
    }

    Ok(Uint8Array::from(output.as_slice()))
}
