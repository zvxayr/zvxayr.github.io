// ======== Canvas Tool System ========
const wrapper = document.getElementById('canvasWrapper');
const maskCanvas = document.getElementById('maskCanvas');
const maskCtx = maskCanvas.getContext('2d');

let freezeMask = null;
let brushSize = 6;

// --- Pan & Zoom state ---
let zoom = 1;
let offsetX = 0, offsetY = 0;
let lastX = 0, lastY = 0;

// --- Tool Registry ---
const tools = {};

// =======================
// --- Mask Edit Tool ---
// =======================
tools.maskEdit = {
    name: 'maskEdit',
    isPainting: false,

    onMouseDown(e) {
        this.isPainting = true;
        paintAt(e.offsetX, e.offsetY);
    },
    onMouseMove(e) {
        if (this.isPainting) paintAt(e.offsetX, e.offsetY);
    },
    onMouseUp() {
        this.isPainting = false;
    },
    onWheel() { /* ignore zoom while editing */ }
};

// Paint helper
function paintAt(x, y) {
    const w = maskCanvas.width, h = maskCanvas.height;
    const imgData = maskCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const r = brushSize;
    for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
            const px = Math.floor(x + i);
            const py = Math.floor(y + j);
            if (px < 0 || px >= w || py < 0 || py >= h) continue;
            if (i * i + j * j > r * r) continue;
            const idx = py * w + px;
            freezeMask[idx] = 1;
            const di = idx * 4;
            data[di] = 255;
            data[di + 1] = 0;
            data[di + 2] = 0;
            data[di + 3] = 128;
        }
    }
    maskCtx.putImageData(imgData, 0, 0);
}

// ========================
// --- Pan & Zoom Tool ----
// ========================
tools.panZoom = {
    name: 'panZoom',
    isDragging: false,

    onMouseDown(e) {
        this.isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        wrapper.style.cursor = 'grabbing';
    },
    onMouseMove(e) {
        if (!this.isDragging) return;
        offsetX += e.clientX - lastX;
        offsetY += e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        updateCanvasTransform();
    },
    onMouseUp() {
        this.isDragging = false;
        wrapper.style.cursor = 'grab';
    },
    onWheel(e) {
        e.preventDefault();
        const rect = wrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - offsetX) / zoom;
        const worldY = (mouseY - offsetY) / zoom;

        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.2), 10);

        offsetX = mouseX - worldX * newZoom;
        offsetY = mouseY - worldY * newZoom;
        zoom = newZoom;

        updateCanvasTransform();
    }
};

// ====================
// --- Active Tool ---
// ====================
let activeTool = tools.panZoom; // default mode

// --- Generic Event Delegation ---
wrapper.addEventListener('mousedown', e => activeTool?.onMouseDown?.(e));
wrapper.addEventListener('mousemove', e => activeTool?.onMouseMove?.(e));
window.addEventListener('mouseup', e => activeTool?.onMouseUp?.(e));
wrapper.addEventListener('wheel', e => activeTool?.onWheel?.(e));

// --- Mask Edit Controls ---
const editMaskBtn = document.getElementById('editMaskBtn');
const clearMaskBtn = document.getElementById('clearMaskBtn');

editMaskBtn.addEventListener('click', () => {
    const editing = activeTool !== tools.maskEdit;
    activeTool = editing ? tools.maskEdit : tools.panZoom;
    maskCanvas.style.pointerEvents = editing ? 'auto' : 'none';
    maskCanvas.style.opacity = editing ? '0.5' : '0';
    editMaskBtn.textContent = editing ? 'Exit Mask Edit' : 'Edit Mask';
});

clearMaskBtn.addEventListener('click', () => {
    if (!freezeMask) return;
    freezeMask.fill(0);
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
});

// ====================
// --- Transform Logic ---
// ====================
function updateCanvasTransform() {
    const canvases = wrapper.querySelectorAll('canvas');
    const shouldPixelate = zoom > 1.01;
    canvases.forEach(c => {
        c.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
        c.classList.toggle('pixelated', shouldPixelate);
    });
}

function centerCanvas() {
    const canvases = wrapper.querySelectorAll('canvas');
    if (!canvases.length) return;
    const rect = wrapper.getBoundingClientRect();
    const mainCanvas = canvases[0];
    const w = mainCanvas.width * zoom;
    const h = mainCanvas.height * zoom;
    offsetX = (rect.width - w) / 2;
    offsetY = (rect.height - h) / 2;
    updateCanvasTransform();
}

function resetTransform() {
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    centerCanvas();
}

resetTransform();
