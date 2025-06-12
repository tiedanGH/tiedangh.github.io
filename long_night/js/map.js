// js/map.js
export class InfiniteMap {
    constructor(container) {
        this.container = container;
        this.cells = new Map(); // 存储已渲染的单元格
        this.initDrag();
        // 浏览器窗口大小变化时重新渲染可视区域
        window.addEventListener('resize', () => this.renderViewport());
        this.renderViewport();
    }

    initDrag() {
        let isDragging = false;
        let start = { x: 0, y: 0 };

        this.container.addEventListener('mousedown', e => {
            if (e.button === 0) {
                isDragging = true;
                start = { x: e.clientX, y: e.clientY };
                this.container.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', e => {
            if (isDragging) {
                const dx = e.clientX - start.x;
                const dy = e.clientY - start.y;
                start = { x: e.clientX, y: e.clientY };
                this.container.scrollLeft -= dx;
                this.container.scrollTop -= dy;
                this.renderViewport();
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            this.container.style.cursor = 'grab';
        });
    }

    renderViewport() {
        const size = 40;
        const wall = 10;
        const base = size + wall;

        // 计算需要渲染的行列数
        const cols = Math.ceil(this.container.clientWidth / base) + 1;
        const rows = Math.ceil(this.container.clientHeight / base) + 1;

        // 计算当前滚动偏移对应的逻辑网格坐标
        const offsetX = Math.floor(this.container.scrollLeft / base) * 2;
        const offsetY = Math.floor(this.container.scrollTop / base) * 2;

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
        }

        cell.style.left = x + 'px';
        cell.style.top = y + 'px';

        this.container.appendChild(cell);
        this.cells.set(key, cell);
    }
}
