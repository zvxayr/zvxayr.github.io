// ---- Floyd–Steinberg Dithering Core ----
function makeDistanceFunction(palette, channelBalance = 0.75, gammaInput = 1.2, chromaWeight = 0.3) {
    const f = x => Math.pow(x / 255, gammaInput);

    // Precompute linearized palette and per-entry metadata
    const paletteMeta = palette.map(([r, g, b]) => {
        const pl = [f(r), f(g), f(b)];
        const pChroma = Math.max(pl[0], pl[1], pl[2]) - Math.min(pl[0], pl[1], pl[2]);
        const pLightness = (pl[0] + pl[1] + pl[2]) / 3;
        const isMidGrey = pChroma < 0.1 && pLightness > 0.15 && pLightness < 0.85;
        return { pl, pChroma, pLightness, isMidGrey };
    });

    const weights = [0.3, 0.59, 0.11].map(w => Math.pow(w, channelBalance));

    // The returned function only needs the source color (0..255)
    return function distanceFn(color) {
        // color is expected as [r,g,b,...]
        const colorLin = [f(color[0]), f(color[1]), f(color[2])];
        const colorChroma = Math.max(colorLin[0], colorLin[1], colorLin[2]) - Math.min(colorLin[0], colorLin[1], colorLin[2]);

        let minDist = Infinity;
        let bestIdx = 0;

        for (let i = 0; i < paletteMeta.length; i++) {
            const p = paletteMeta[i].pl;

            const d0 = p[0] - colorLin[0];
            const d1 = p[1] - colorLin[1];
            const d2 = p[2] - colorLin[2];

            const dist = weights[0] * d0 * d0 + weights[1] * d1 * d1 + weights[2] * d2 * d2;

            const greyPenalty = (paletteMeta[i].isMidGrey && colorChroma > 0.1)
                ? colorChroma * chromaWeight
                : 0;

            const adjusted = dist + greyPenalty;

            if (adjusted < minDist) {
                minDist = adjusted;
                bestIdx = i;
            }
        }

        return bestIdx;
    };
}


// Dithering function uses the prebuilt distance function for speed.
function floydSteinbergDither(originalImg, prevDithered, palette,
    freezeMask = null, ratio = 0.8, errorClip = 255.0, jitter = 8,
    channelBalance = 0.75, gammaInput = 1.2, seed = 42, chromaWeight = 0.3,
    edgeFalloff = 0.5) {

    const h = originalImg.length, w = originalImg[0].length;
    const output = Array.from({ length: h }, () => Array.from({ length: w }, () => [0, 0, 0, 255]));
    const errorImg = originalImg.map(row => row.map(px => [...px]));

    let rngState = seed >>> 0;
    const rand = () => ((rngState = (1664525 * rngState + 1013904223) >>> 0) / 0x100000000);

    const distanceFn = makeDistanceFunction(palette, channelBalance, gammaInput, chromaWeight);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const oldPixel = errorImg[y][x];
            const alpha = (oldPixel[3] ?? 255) / 255;
            if (alpha <= 0.001) {
                output[y][x] = [0, 0, 0, 0];
                continue;
            }

            let newPixel;

            // --- Frozen pixel: use previous dithered color but still diffuse error ---
            if (freezeMask && freezeMask[y * w + x] && prevDithered && prevDithered[y] && prevDithered[y][x]) {
                newPixel = prevDithered[y][x].slice(0, 3);
            } else {
                // Add noise for dithering
                const noise = [
                    (rand() * 2 - 1 + rand() * 2 - 1) * (jitter / 2),
                    (rand() * 2 - 1 + rand() * 2 - 1) * (jitter / 2),
                    (rand() * 2 - 1 + rand() * 2 - 1) * (jitter / 2)
                ];
                const noisyPixel = oldPixel.map((v, i) => i < 3
                    ? Math.min(255, Math.max(0, v + noise[i]))
                    : v);

                const idx = distanceFn(noisyPixel);
                newPixel = palette[idx];
            }

            output[y][x] = [...newPixel, oldPixel[3]];

            const quantError = oldPixel.slice(0, 3).map((v, i) =>
                Math.max(-errorClip, Math.min(errorClip, v - newPixel[i]))
            );

            // === Compute local gradient magnitude from the original (pre-error) image ===
            let gradSq = 0;
            const base = originalImg[y][x];
            if (x > 0) {
                const prev = originalImg[y][x - 1];
                gradSq +=
                    Math.pow(base[0] - prev[0], 2) +
                    Math.pow(base[1] - prev[1], 2) +
                    Math.pow(base[2] - prev[2], 2);
            }
            if (y > 0) {
                const prev = originalImg[y - 1][x];
                gradSq +=
                    Math.pow(base[0] - prev[0], 2) +
                    Math.pow(base[1] - prev[1], 2) +
                    Math.pow(base[2] - prev[2], 2);
            }

            // Normalize gradient (optional)
            gradSq /= 6 * 255 * 255; // average over channels and neighbors

            const edgeWeight = Math.exp(-gradSq * edgeFalloff);

            // Scale the diffusion by both alpha and edge smoothness
            const aRatio = ratio * alpha * edgeWeight;

            // Diffuse quantization error
            if (x + 1 < w)
                for (let i = 0; i < 3; i++) errorImg[y][x + 1][i] += quantError[i] * (7 / 16) * aRatio;
            if (y + 1 < h) {
                if (x > 0)
                    for (let i = 0; i < 3; i++) errorImg[y + 1][x - 1][i] += quantError[i] * (3 / 16) * aRatio;
                for (let i = 0; i < 3; i++) errorImg[y + 1][x][i] += quantError[i] * (5 / 16) * aRatio;
                if (x + 1 < w)
                    for (let i = 0; i < 3; i++) errorImg[y + 1][x + 1][i] += quantError[i] * (1 / 16) * aRatio;
            }
        }
    }

    return output;
}