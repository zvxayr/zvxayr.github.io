// ---- Share Settings Button ----
const shareBtn = document.getElementById('shareBtn');

function getCurrentSettings() {
    return {
        scale: scaleInput.value,
        interpolation: interpolation.value,
        ratio: ratioInput.value,
        jitter: jitterInput.value,
        gamma: gammaInput.value,
        balance: balanceInput.value,
        seed: seedInput.value,
        greyPenalty: greyPenaltyInput.value,
        edgeFalloff: edgeFalloffInput.value,
        errorClip: errorClipInput.value,
        src: window.initialImageSrc || '',
        disable: enabledColors
            .map((enabled, i) => (!enabled ? i : null))
            .filter(i => i !== null)
            .join(',')
    };
}

function makeShareURL() {
    const params = new URLSearchParams();
    const settings = getCurrentSettings();

    for (const [key, value] of Object.entries(settings)) {
        if (value !== '' && value !== undefined && value !== null) {
            params.set(key.toLowerCase(), value);
        }
    }

    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

shareBtn.addEventListener('click', () => {
    const shareURL = makeShareURL();
    // Try native share API first (on mobile)
    if (navigator.share) {
        navigator.share({
            title: "Floyd–Steinberg Dithering",
            text: "Check out my dithering settings!",
            url: shareURL
        }).catch(() => {
            // fallback
            prompt("Copy this link to share your settings:", shareURL);
        });
    } else {
        // fallback to prompt on desktop
        prompt("Copy this link to share your settings:", shareURL);
    }
});