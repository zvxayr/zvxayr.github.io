(function () {
    // ---- Floyd–Steinberg Dithering Core ----
    function makeDistanceFunction(palette, channelBalance = 0.75, gammaInput = 1.2, chromaWeight = 0.3) {
        const f = x => Math.pow(x / 255, gammaInput);

        const paletteMeta = palette.map(([r, g, b]) => {
            const pl = [f(r), f(g), f(b)];
            const pChroma = Math.max(...pl) - Math.min(...pl);
            const pLightness = (pl[0] + pl[1] + pl[2]) / 3;
            const isMidGrey = pChroma < 0.1 && pLightness > 0.15 && pLightness < 0.85;
            return { pl, pChroma, pLightness, isMidGrey };
        });

        const weights = [0.3, 0.59, 0.11].map(w => Math.pow(w, channelBalance));

        return function distanceFn(color) {
            const colorLin = color.slice(0, 3).map(f);
            const colorChroma = Math.max(...colorLin) - Math.min(...colorLin);

            let minDist = Infinity;
            let bestIdx = 0;

            for (let i = 0; i < paletteMeta.length; i++) {
                const p = paletteMeta[i].pl;
                const dist = weights[0] * (p[0] - colorLin[0]) ** 2 + weights[1] * (p[1] - colorLin[1]) ** 2 + weights[2] * (p[2] - colorLin[2]) ** 2;
                const greyPenalty = (paletteMeta[i].isMidGrey && colorChroma > 0.1) ? colorChroma * chromaWeight : 0;
                const adjusted = dist + greyPenalty;
                if (adjusted < minDist) {
                    minDist = adjusted;
                    bestIdx = i;
                }
            }
            return bestIdx;
        };
    }

    function floydSteinbergDither(
        data, w, h, prevDithered, palette, freezeMask = null,
        { ratio = 0.8, errorClip = 255, jitter = 8, channelBalance = 0.75,
            gammaInput = 1.2, seed = 42, chromaWeight = 0.3, edgeFalloff = 0.5 } = {}
    ) {
        const output = new Uint8ClampedArray(data.length);
        const errorBuf = new Float32Array(data.length);
        errorBuf.set(data);

        let rngState = seed >>> 0;
        const rand = () => ((rngState = (1664525 * rngState + 1013904223) >>> 0) / 0x100000000);

        const distanceFn = makeDistanceFunction(palette, channelBalance, gammaInput, chromaWeight);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const oldPixel = errorBuf.slice(i, i + 4);
                const alpha = oldPixel[3] / 255;

                if (alpha <= 0.001) {
                    output.set([0, 0, 0, 0], i);
                    continue;
                }

                const isFrozen = freezeMask && freezeMask[y * w + x] && prevDithered;
                let newPixel;

                if (isFrozen) {
                    newPixel = prevDithered.slice(i, i + 3);
                } else {
                    const noise = [
                        (rand() * 2 - 1 + rand() * 2 - 1) * (jitter / 2),
                        (rand() * 2 - 1 + rand() * 2 - 1) * (jitter / 2),
                        (rand() * 2 - 1 + rand() * 2 - 1) * (jitter / 2)
                    ];
                    const noisyPixel = oldPixel.map((v, idx) => idx < 3 ? Math.min(255, Math.max(0, v + noise[idx])) : v);
                    const idxPal = distanceFn(noisyPixel);
                    newPixel = palette[idxPal];
                }

                output.set([newPixel[0], newPixel[1], newPixel[2], oldPixel[3]], i);

                const quantError = [0, 1, 2].map(j => Math.max(-errorClip, Math.min(errorClip, oldPixel[j] - newPixel[j])));

                // --- Edge weight based on local gradient ---
                let gradSq = 0;
                if (x > 0) for (let j = 0; j < 3; j++) gradSq += (data[i + j] - data[i + j - 4]) ** 2;
                if (y > 0) for (let j = 0; j < 3; j++) gradSq += (data[i + j] - data[i + j - 4 * w]) ** 2;
                gradSq /= 6 * 255 * 255;
                const edgeWeight = Math.exp(-gradSq * edgeFalloff);

                const aRatio = ratio * alpha * edgeWeight * (isFrozen ? 0.5 : 1);

                if (x + 1 < w) for (let j = 0; j < 3; j++) errorBuf[i + 4 + j] += quantError[j] * (7 / 16) * aRatio;
                if (y + 1 < h) {
                    if (x > 0) for (let j = 0; j < 3; j++) errorBuf[i + 4 * (w - 1) + j] += quantError[j] * (3 / 16) * aRatio;
                    for (let j = 0; j < 3; j++) errorBuf[i + 4 * w + j] += quantError[j] * (5 / 16) * aRatio;
                    if (x + 1 < w) for (let j = 0; j < 3; j++) errorBuf[i + 4 * (w + 1) + j] += quantError[j] * (1 / 16) * aRatio;
                }
            }
        }

        return output;
    }

    window.floydSteinbergDither = floydSteinbergDither;
})();