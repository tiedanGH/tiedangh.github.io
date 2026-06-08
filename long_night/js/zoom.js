
// 地图缩放等级（相对基准尺寸的倍率），默认 1.0
const ZOOM_LEVELS = [0.6, 0.8, 1.0, 1.25, 1.5, 1.8];
let zoomIndex = ZOOM_LEVELS.indexOf(1.0);

// 获取当前缩放下的格子/墙壁/标记尺寸（整数像素，保证对齐）
function getCellMetrics() {
    const big = window.innerWidth > 600;
    const scale = ZOOM_LEVELS[zoomIndex];
    return {
        size: Math.round((big ? 40 : 30) * scale),
        wall: Math.round((big ? 11 : 9) * scale),
        marker: Math.round((big ? 14 : 12) * scale),
    };
}

// 将当前尺寸写入 CSS 变量，使所有格子元素同步缩放，返回当前 {size, wall}
function applyCellMetricsVars() {
    const { size, wall, marker } = getCellMetrics();
    const root = document.documentElement;
    root.style.setProperty('--cell-size', size + 'px');
    root.style.setProperty('--wall-size', wall + 'px');
    root.style.setProperty('--marker-font', marker + 'px');
    return { size, wall };
}

// 初始化缩放按钮
function initZoomControls(map) {
    const zoomInBtn = document.getElementById('zoom-in-button');
    const zoomOutBtn = document.getElementById('zoom-out-button');
    if (!zoomInBtn || !zoomOutBtn) return;

    // 达到上下限时禁用对应按钮
    function updateButtons() {
        zoomInBtn.disabled = zoomIndex >= ZOOM_LEVELS.length - 1;
        zoomOutBtn.disabled = zoomIndex <= 0;
    }

    function setZoom(newIndex) {
        newIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, newIndex));
        if (newIndex === zoomIndex) return;

        const before = getCellMetrics();
        zoomIndex = newIndex;
        const { size, wall } = applyCellMetricsVars();

        // 以视口中心为锚点，缩放后保持地图位置不跳动
        const oldBase = before.size + before.wall;
        const newBase = size + wall;
        const ratio = newBase / oldBase;
        const cx = map.container.scrollLeft + map.container.clientWidth / 2;
        const cy = map.container.scrollTop + map.container.clientHeight / 2;

        map.updateCellPositions(size, wall);
        map.container.scrollLeft = Math.max(0, cx * ratio - map.container.clientWidth / 2);
        map.container.scrollTop = Math.max(0, cy * ratio - map.container.clientHeight / 2);
        map.renderViewport();

        updateButtons();
    }

    zoomInBtn.addEventListener('click', () => setZoom(zoomIndex + 1));
    zoomOutBtn.addEventListener('click', () => setZoom(zoomIndex - 1));

    applyCellMetricsVars();
    updateButtons();
}
