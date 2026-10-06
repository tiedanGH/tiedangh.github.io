
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

class InfiniteMap {
    constructor(container) {
        this.container = container;
        this.cells = new Map(); // 存储已渲染的单元格
        ({ size: this.cellSize, wall: this.wallSize } = getCellMetrics());   // 格子当前所用的尺寸
        this.renderedRange = null;   // 上次渲染的可视范围
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
        let grabbing = false;   // 已切换为拖动中的光标
        let start = { x: 0, y: 0 };

        this.container.addEventListener('mousedown', e => {
            if (window.editModeManager?.blocksMapDrag?.()) return;
            if (e.button === 0) {
                isDragging = true;
                start = { x: e.clientX, y: e.clientY };
            }
        });

        window.addEventListener('mousemove', e => {
            if (isDragging) {
                const dx = e.clientX - start.x;
                const dy = e.clientY - start.y;
                start = { x: e.clientX, y: e.clientY };
                // 切换光标会重算全部格子的样式，只在地图真正被拖动时切换，单纯点击不切换
                if (!grabbing && (dx || dy)) {
                    grabbing = true;
                    this.container.style.cursor = 'grabbing';
                }
                this.container.scrollLeft -= dx;
                this.container.scrollTop -= dy;
                this.renderViewport();
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            if (grabbing) {
                grabbing = false;
                this.container.style.cursor = 'grab';
            }
        });

        // 移动端支持（触摸没有光标，不切换）
        this.container.addEventListener('touchstart', e => {
            if (window.editModeManager?.blocksMapDrag?.()) return;
            isDragging = true;
            const touch = e.touches[0];
            start = { x: touch.clientX, y: touch.clientY };
        }, { passive: false });

        window.addEventListener('touchmove', e => {
            if (isDragging) {
                e.preventDefault();
                const touch = e.touches[0];
                const dx = touch.clientX - start.x;
                const dy = touch.clientY - start.y;
                start = { x: touch.clientX, y: touch.clientY };
                this.container.scrollLeft -= dx;
                this.container.scrollTop -= dy;
                this.renderViewport();
            }
        }, { passive: false });

        window.addEventListener('touchend', () => {
            isDragging = false;
        });
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

        // 格子不会被移除，可视范围不变时都已创建（拖动中多数事件落在同一范围内）
        const range = `${offsetX},${offsetY},${cols},${rows},${size},${wall}`;
        if (range === this.renderedRange) return;
        this.renderedRange = range;

        for (let i = offsetX; i < offsetX + cols * 2; i++) {
            for (let j = offsetY; j < offsetY + rows * 2; j++) {
                this.ensureCell(i, j, size, wall);
            }
        }
    }

    ensureCell(i, j, size, wall) {
        const key = `${i},${j}`;
        if (this.cells.has(key)) return;

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

        this.container.appendChild(cell);
        this.cells.set(key, cell);
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
