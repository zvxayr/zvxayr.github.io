// ---- Query Parameter Support ----
function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const obj = {};
    for (const [k, v] of params.entries()) {
        obj[k.toLowerCase()] = v;
    }
    return obj;
}

const query = getQueryParams();

// Automatically populate controls if present in query string
function setIfExists(id, value) {
    const el = document.getElementById(id);
    if (el && value !== undefined) {
        if (el.type === "number" || el.tagName === "SELECT" || el.type === "range" || el.type === "text") {
            el.value = value;
        }
    }
}

// Set query-based control values
setIfExists("scaleInput", query.scale);
setIfExists("interpolation", query.interpolation);
setIfExists("ratioInput", query.ratio);
setIfExists("jitterInput", query.jitter);
setIfExists("gammaInput", query.gamma);
setIfExists("balanceInput", query.balance);
setIfExists("seedInput", query.seed);
setIfExists("greyPenaltyInput", query.greypenalty);
setIfExists("edgeFalloffInput", query.edgefalloff);
setIfExists("errorClipInput", query.errorclip);

// Handle color palette disabling via query param, e.g. ?disable=0,5,12
let disabledIndices = [];
if (query.disable) {
    disabledIndices = query.disable.split(",").map(x => parseInt(x.trim())).filter(x => !isNaN(x));
}

// Optional: specify which colors to enable (overrides disable)
let enabledIndices = null;
if (query.enable) {
    enabledIndices = query.enable.split(",").map(x => parseInt(x.trim())).filter(x => !isNaN(x));
}

// Load image if src param is present
window.initialImageSrc = query.src || null;