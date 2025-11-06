// ---- Pan & Zoom Controls (Pixel-anchored zoom + centered start) ----
const wrapper = document.getElementById('canvasWrapper');

let zoom = 1;
let offsetX = 0, offsetY = 0;
let isDragging = false;
let lastX = 0, lastY = 0;

function updateCanvasTransform() {
    canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
    beforeCanvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;

    // Apply pixelated rendering only if zoomed in
    if (zoom > 1.01) {
        canvas.classList.add('pixelated');
        beforeCanvas.classList.add('pixelated');
    } else {
        canvas.classList.remove('pixelated');
        beforeCanvas.classList.remove('pixelated');
    }
}


// Center canvas in wrapper
function centerCanvas() {
    const rect = wrapper.getBoundingClientRect();
    const w = canvas.width * zoom;
    const h = canvas.height * zoom;
    offsetX = (rect.width - w) / 2;
    offsetY = (rect.height - h) / 2;
    updateCanvasTransform();
}

// Wheel zoom (keep pixel at cursor fixed)
wrapper.addEventListener('wheel', e => {
    e.preventDefault();

    const rect = wrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert screen coordinates to "world" coordinates
    const worldX = (mouseX - offsetX) / zoom;
    const worldY = (mouseY - offsetY) / zoom;

    // Apply zoom delta
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.2), 10);

    // Adjust pan to keep world point fixed
    offsetX = mouseX - worldX * newZoom;
    offsetY = mouseY - worldY * newZoom;
    zoom = newZoom;

    updateCanvasTransform();
});

// Drag panning
wrapper.addEventListener('mousedown', e => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    wrapper.style.cursor = 'grabbing';
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    wrapper.style.cursor = 'grab';
});

window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    offsetX += e.clientX - lastX;
    offsetY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    updateCanvasTransform();
});

// Reset & center after each new image render
function resetTransform() {
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    centerCanvas();
}

resetTransform();