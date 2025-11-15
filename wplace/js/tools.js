// ======== Canvas Tool System ========
const wrapper = document.getElementById('canvasWrapper');
const brushSizeInput = document.getElementById('brushSize');
const maskCanvas = document.getElementById('maskCanvas');
const maskCtx = maskCanvas.getContext('2d');

const toolPanBtn = document.getElementById('toolPanBtn');
const toolBrushBtn = document.getElementById('toolBrushBtn');

let previousTool = null;
let spaceHeld = false;

window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !spaceHeld) {
        spaceHeld = true;

        // Save current tool and switch to pan
        previousTool = activeTool;
        activeTool = tools.panZoom;

        // Make mask overlay non-interactive while space is held
        maskCanvas.style.pointerEvents = 'none';
        wrapper.style.cursor = 'grab';
    }
});

window.addEventListener('keyup', e => {
    if (e.code === 'Space' && spaceHeld) {
        spaceHeld = false;

        // Restore previous tool
        if (previousTool) {
            activeTool = previousTool;
            previousTool = null;
        }

        // Restore brush/pan UI state
        if (activeTool === tools.maskEdit) {
            maskCanvas.style.pointerEvents = 'auto';
            wrapper.style.cursor = 'crosshair';
        } else {
            wrapper.style.cursor = 'grab';
        }
    }
});


function activateTool(toolName) {
    // Switch active tool
    activeTool = tools[toolName];

    // Update UI button states
    toolPanBtn.classList.toggle('active', toolName === 'panZoom');
    toolBrushBtn.classList.toggle('active', toolName === 'maskEdit');

    // Brush visibility
    const isBrush = toolName === 'maskEdit';
    maskCanvas.style.pointerEvents = isBrush ? 'auto' : 'none';
    maskCanvas.style.opacity = isBrush ? '0.5' : '0';

    brushPreviewCanvas.style.opacity = isBrush ? '1' : '0';

    // Fix cursor
    wrapper.style.cursor = toolName === 'panZoom' ? 'grab' : 'crosshair';
}

// Button events
toolPanBtn.addEventListener('click', () => activateTool('panZoom'));
toolBrushBtn.addEventListener('click', () => activateTool('maskEdit'));

let freezeMask = null;
let paintMode = 'add'; // 'add' or 'subtract'

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

const toggleMaskModeBtn = document.getElementById('toggleMaskModeBtn');
let brushSize = parseFloat(brushSizeInput.value);

// --- Brush Size Control ---
brushSizeInput.addEventListener('input', e => {
    brushSize = parseInt(e.target.value);
});

// --- Toggle Add/Subtract ---
toggleMaskModeBtn.addEventListener('click', () => {
    paintMode = paintMode === 'add' ? 'subtract' : 'add';
    toggleMaskModeBtn.textContent = `Mode: ${paintMode === 'add' ? 'Add' : 'Subtract'}`;
});

// Paint helper
function paintAt(x, y) {
    const w = maskCanvas.width, h = maskCanvas.height;
    const imgData = maskCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const r = brushSize;
    const addMode = paintMode === 'add';

    for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
            const px = Math.floor(x + i);
            const py = Math.floor(y + j);
            if (px < 0 || px >= w || py < 0 || py >= h) continue;
            if (i * i + j * j > r * r) continue;

            const idx = py * w + px;
            freezeMask[idx] = addMode ? 1 : 0;

            const di = idx * 4;
            if (addMode) {
                // Paint red overlay
                data[di] = 255;
                data[di + 1] = 0;
                data[di + 2] = 0;
                data[di + 3] = 128;
            } else {
                // Erase overlay (clear pixel)
                data[di] = 0;
                data[di + 1] = 0;
                data[di + 2] = 0;
                data[di + 3] = 0;
            }
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

function drawBrushPreview(e) {
    if (!brushPreviewCanvas.width) return;

    const w = brushPreviewCanvas.width;
    const h = brushPreviewCanvas.height;
    const x = e.offsetX;
    const y = e.offsetY;
    const r = brushSize;

    const imgData = brushPreviewCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Clear previous frame efficiently
    for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = 0; // just clear alpha
    }

    // Draw every pixel the brush would hit
    for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {

            // Circle test (same as paintAt)
            if (i * i + j * j > r * r) continue;

            const px = Math.floor(x + i);
            const py = Math.floor(y + j);

            if (px < 0 || px >= w || py < 0 || py >= h) continue;

            const idx = (py * w + px) * 4;

            // preview color matches mode
            if (paintMode === 'add') {
                data[idx] = 255;     // red
                data[idx + 1] = 0;
                data[idx + 2] = 0;
                data[idx + 3] = 160; // visible alpha
            } else {
                data[idx] = 0;
                data[idx + 1] = 255; // green for subtract
                data[idx + 2] = 0;
                data[idx + 3] = 160;
            }
        }
    }

    brushPreviewCtx.putImageData(imgData, 0, 0);
}



// --- Generic Event Delegation ---
wrapper.addEventListener('mousedown', e => activeTool?.onMouseDown?.(e));
wrapper.addEventListener('mousemove', e => activeTool?.onMouseMove?.(e));
window.addEventListener('mouseup', e => activeTool?.onMouseUp?.(e));
wrapper.addEventListener('wheel', e => activeTool?.onWheel?.(e));
wrapper.addEventListener('mousemove', e => {
    if (activeTool === tools.maskEdit) drawBrushPreview(e);
});

// --- Mask Edit Controls ---
const editMaskBtn = document.getElementById('editMaskBtn');
const clearMaskBtn = document.getElementById('clearMaskBtn');

editMaskBtn.addEventListener('click', () => {
    const editing = activeTool !== tools.maskEdit;
    activeTool = editing ? tools.maskEdit : tools.panZoom;
    maskCanvas.style.pointerEvents = editing ? 'auto' : 'none';
    maskCanvas.style.opacity = editing ? '0.5' : '0';
    editMaskBtn.textContent = editing ? 'Exit Mask Edit' : 'Edit Mask';
    brushPreviewCanvas.style.opacity = editing ? '1' : '0';
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
