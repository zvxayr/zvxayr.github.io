const urlInput = document.getElementById('urlInput');
const loadUrlBtn = document.getElementById('loadUrlBtn');

function loadImageFromURL(url, triedProxy = false) {
    if (!url) return alert("Please enter a valid image URL.");

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
        lastImage = img;
        window.initialImageSrc = url;
        processImage();
        resetTransform();
    };
    img.onerror = () => {
        alert("⚠️ Could not load image. The source server may block CORS.");
    };
    img.src = url;
}


loadUrlBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (url) loadImageFromURL(url);
});

// Auto-load if src=... query parameter present
if (window.initialImageSrc) {
    urlInput.value = window.initialImageSrc;
    loadImageFromURL(window.initialImageSrc);
}