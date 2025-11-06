const urlInput = document.getElementById('urlInput');
const loadUrlBtn = document.getElementById('loadUrlBtn');

function loadImageFromURL(url) {
    if (!url) {
        alert("Please enter a valid image URL.");
        return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
        lastImage = img;
        window.initialImageSrc = url; // update global source
        processImage();
        resetTransform();
    };
    img.onerror = () => alert("⚠️ Could not load image from that URL.");
    img.src = url;
}

loadUrlBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    const proxiedUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
    if (url) loadImageFromURL(proxiedUrl);
});

// Auto-load if src=... query parameter present
if (window.initialImageSrc) {
    urlInput.value = window.initialImageSrc;
    loadImageFromURL(window.initialImageSrc);
}