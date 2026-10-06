
// 新建墙壁的背景图，按样式读回后的写法缓存，用于判断墙壁是否仍为初始状态
const initialWallImages = {};
function getInitialWallImage(orientation) {
    if (!initialWallImages[orientation]) {
        const probe = document.createElement('div');
        probe.style.backgroundImage = `url('${getWallImage('未知', orientation)}')`;
        initialWallImages[orientation] = probe.style.backgroundImage;
    }
    return initialWallImages[orientation];
}

// 视野外仍留在页面中的缓冲格数（逻辑坐标），来回小幅拖动时不必反复移出移入
const VIEW_KEEP_MARGIN = 6;

// 拖动结束后紧随的一次 click 不当作点击格子，不弹出选择器
function suppressNextClick() {
    const block = e => e.stopPropagation();
    window.addEventListener('click', block, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', block, { capture: true }), 0);
}

class InfiniteMap {
    constructor(container) {
        this.container = container;
        // 全部已创建的格子：只有视野附近的放在页面中，其余移出页面，状态保留在元素上
        this.cells = new Map();
        this.attached = new Set();   // 当前在页面中的格子
        this.view = null;            // 当前视野的格子范围
        this.pinnedCell = null;      // 触摸拖动的起点格子，移出页面会收不到后续触摸事件，拖动结束前保留
        ({ size: this.cellSize, wall: this.wallSize } = getCellMetrics());   // 格子当前所用的尺寸
        this.renderedRange = null;   // 上次渲染的可视范围

        // 视野外的格子不在页面中，由占位元素把滚动范围撑到已创建格子的最远处
        this.maxI = -1;
        this.maxJ = -1;
        this.extent = document.createElement('div');
        this.extent.className = 'map-extent';
        container.appendChild(this.extent);

        this.initDrag();
        // 浏览器窗口大小变化时重新渲染可视区域
        window.addEventListener('resize', () => {
            const { size, wall } = applyCellMetricsVars();
            this.updateCellPositions(size, wall);
            this.renderViewport();
        });
        this.renderViewport();
    }

    initDrag() {
        let isDragging = false;
        let moved = false;   // 本次按下后地图已被拖动
        let start = { x: 0, y: 0 };

        // 地图开始移动：已打开的选择器位置一并关闭
        const startMoving = () => {
            moved = true;
            removeAllSelectors();
        };

        this.container.addEventListener('mousedown', e => {
            if (window.editModeManager?.blocksMapDrag?.()) return;
            if (e.button === 0) {
                isDragging = true;
                moved = false;
                start = { x: e.clientX, y: e.clientY };
            }
        });

        window.addEventListener('mousemove', e => {
            if (isDragging) {
                const dx = e.clientX - start.x;
                const dy = e.clientY - start.y;
                start = { x: e.clientX, y: e.clientY };
                // 切换光标会重算全部格子的样式，只在地图真正被拖动时切换，单纯点击不切换
                if (!moved && (dx || dy)) {
                    startMoving();
                    this.container.style.cursor = 'grabbing';
                }
                this.container.scrollLeft -= dx;
                this.container.scrollTop -= dy;
                this.renderViewport();
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            if (moved) {
                moved = false;
                this.container.style.cursor = 'grab';
                suppressNextClick();
            }
        });

        // 移动端支持（触摸没有光标，不切换）
        this.container.addEventListener('touchstart', e => {
            if (window.editModeManager?.blocksMapDrag?.()) return;
            isDragging = true;
            moved = false;
            const touch = e.touches[0];
            start = { x: touch.clientX, y: touch.clientY };
            this.pinnedCell = e.target.closest?.('.cell') || null;
        }, { passive: false });

        window.addEventListener('touchmove', e => {
            if (isDragging) {
                e.preventDefault();
                const touch = e.touches[0];
                const dx = touch.clientX - start.x;
                const dy = touch.clientY - start.y;
                start = { x: touch.clientX, y: touch.clientY };
                if (!moved && (dx || dy)) startMoving();
                this.container.scrollLeft -= dx;
                this.container.scrollTop -= dy;
                this.renderViewport();
            }
        }, { passive: false });

        // 拖动过地图时取消这次触摸带来的点击，结束时不弹出选择器
        const endTouch = e => {
            isDragging = false;
            this.pinnedCell = null;
            if (moved && e.cancelable) e.preventDefault();
            moved = false;
        };
        window.addEventListener('touchend', endTouch, { passive: false });
        window.addEventListener('touchcancel', endTouch);
    }

    renderViewport() {
        const { size, wall } = getCellMetrics();
        const base = size + wall;

        // 计算需要渲染的行列数
        const cols = Math.ceil(this.container.clientWidth / base) + 1;
        const rows = Math.ceil(this.container.clientHeight / base) + 1;

        // 计算当前滚动偏移对应的逻辑网格坐标
        const offsetX = Math.floor(this.container.scrollLeft / base) * 2;
        const offsetY = Math.floor(this.container.scrollTop / base) * 2;

        // 可视范围不变时无需调整（拖动中多数事件落在同一范围内）
        const range = `${offsetX},${offsetY},${cols},${rows},${size},${wall}`;
        if (range === this.renderedRange) return;
        this.renderedRange = range;

        const view = { i0: offsetX, i1: offsetX + cols * 2, j0: offsetY, j1: offsetY + rows * 2 };
        this.view = view;

        // 离开视野（含缓冲）的格子移出页面
        const m = VIEW_KEEP_MARGIN;
        this.attached.forEach(cell => {
            if (cell === this.pinnedCell) return;
            const i = +cell.dataset.i;
            const j = +cell.dataset.j;
            if (i < view.i0 - m || i >= view.i1 + m || j < view.j0 - m || j >= view.j1 + m) {
                cell.remove();
                this.attached.delete(cell);
            }
        });

        // 视野内的格子创建或放回页面
        for (let i = view.i0; i < view.i1; i++) {
            for (let j = view.j0; j < view.j1; j++) {
                const cell = this.ensureCell(i, j, size, wall);
                if (!this.attached.has(cell)) this.attach(cell);
            }
        }
    }

    inView(i, j) {
        const v = this.view;
        return !!v && i >= v.i0 && i < v.i1 && j >= v.j0 && j < v.j1;
    }

    attach(cell) {
        this.container.appendChild(cell);
        this.attached.add(cell);
    }

    // 返回 (i, j) 处的格子，不存在则新建；视野外新建的格子先不放进页面
    ensureCell(i, j, size, wall) {
        const key = `${i},${j}`;
        const existing = this.cells.get(key);
        if (existing) return existing;

        const base = size + wall;

        const x = Math.floor(i / 2) * base + (i % 2) * size;
        const y = Math.floor(j / 2) * base + (j % 2) * size;

        let cell;
        if (i % 2 === 0 && j % 2 === 0) {
            // 正方形格子
            cell = document.createElement('div');
            cell.className = 'cell square';
            cell.dataset.type = 'square';
        } else if (i % 2 === 1 && j % 2 === 1) {
            // 中心小块
            cell = document.createElement('div');
            cell.className = 'cell center';
        } else {
            // 墙体
            const orientation = (i % 2 === 1) ? 'vertical' : 'horizontal';
            cell = document.createElement('div');
            cell.className = `cell wall ${orientation}`;
            cell.dataset.type = 'wall';
            cell.style.backgroundImage = `url('${getWallImage('未知', orientation)}')`;
        }

        cell.style.left = x + 'px';
        cell.style.top = y + 'px';

        cell.dataset.i = i;
        cell.dataset.j = j;

        this.cells.set(key, cell);
        if (i > this.maxI || j > this.maxJ) {
            this.maxI = Math.max(this.maxI, i);
            this.maxJ = Math.max(this.maxJ, j);
            this.updateExtent(size, wall);
        }
        if (this.inView(i, j)) this.attach(cell);
        return cell;
    }

    // 占位元素放在已创建格子的最右、最下边缘（定位方式同 ensureCell）
    updateExtent(size, wall) {
        const base = size + wall;
        const edge = n => Math.floor(n / 2) * base + (n % 2 === 1 ? base : size);
        this.extent.style.left = (edge(this.maxI) - 1) + 'px';
        this.extent.style.top = (edge(this.maxJ) - 1) + 'px';
    }

    updateCellPositions(size, wall) {
        // 尺寸未变（如只是窗口大小变化）时位置无需更新
        if (size === this.cellSize && wall === this.wallSize) return;
        this.cellSize = size;
        this.wallSize = wall;
        const base = size + wall;

        this.cells.forEach((cell, key) => {
            const [i, j] = key.split(',').map(Number);
            const x = Math.floor(i / 2) * base + (i % 2) * size;
            const y = Math.floor(j / 2) * base + (j % 2) * size;

            cell.style.left = x + 'px';
            cell.style.top = y + 'px';
        });
        this.updateExtent(size, wall);
    }

    // 在全部格子的内容中查找，含已移出页面的格子
    queryInCells(selector) {
        const found = [];
        this.cells.forEach(cell => {
            if (cell.firstElementChild) found.push(...cell.querySelectorAll(selector));
        });
        return found;
    }

    // 是否仍与 ensureCell 新建时一致：新建的格子只有 left、top，墙壁另有未知墙壁的背景图
    isInitialCell(cell) {
        const { style } = cell;
        if (cell.dataset.type === 'wall') {
            const orientation = cell.classList.contains('horizontal') ? 'horizontal' : 'vertical';
            return style.length === 3 && style.backgroundImage === getInitialWallImage(orientation);
        }
        if (style.length !== 2) return false;
        if (cell.dataset.type !== 'square') return true;
        if (getBlockBinding(cell)) return false;
        // 附着层或非空的标记层
        for (const child of cell.children) {
            if (child.classList.contains('attachment-layer') || child.querySelector('.marker')) return false;
        }
        return true;
    }
}
