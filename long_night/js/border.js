
// 地图边框：以左上角黑点为锚点框出 w × h 格的区域，同主游戏地图边缘环绕
// 框内越过边框的移动从对侧出现；左右两边、上下两边的边界墙是同一面墙，改动时同步
const SVG_NS = 'http://www.w3.org/2000/svg';

class BorderManager {
    constructor(map) {
        this.map = map;
        this.borders = new Map();   // 锚点 `${i},${j}` → { i, j, w, h, el }
    }

    get(i, j) {
        return this.borders.get(`${i},${j}`) || null;
    }

    // 存档与历史记录使用的边框数据
    list() {
        return [...this.borders.values()].map(({ i, j, w, h }) => ({ i, j, w, h }));
    }

    // 放置边框：同一黑点最多一个边框，已有时先移除；reconcile 为 true 时统一两侧不一致的边界墙
    add(i, j, w, h, reconcile = true) {
        this.remove(i, j);
        const border = { i, j, w, h, el: this.createOverlay({ i, j, w, h }) };
        this.borders.set(`${i},${j}`, border);
        this.edgePairs(border);   // 边界墙全部建出，滚动范围覆盖整个边框
        if (reconcile) this.reconcile(border);
        return border;
    }

    remove(i, j) {
        const border = this.get(i, j);
        if (!border) return false;
        border.el.remove();
        this.borders.delete(`${i},${j}`);
        return true;
    }

    // 撤销 / 重做时整体替换，墙壁已由快照恢复
    setAll(list) {
        this.borders.forEach(border => border.el.remove());
        this.borders.clear();
        (list || []).forEach(({ i, j, w, h }) => this.add(i, j, w, h, false));
    }

    // 虚线框沿边界墙外缘绘制，位置与尺寸随缩放的 CSS 变量变化（线居中于框边，框向内收半个线宽）
    createOverlay({ i, j, w, h }, className = '') {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.classList.add('map-border');
        if (className) svg.classList.add(className);
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('width', '100%');
        rect.setAttribute('height', '100%');
        svg.appendChild(rect);

        const offset = n => `calc(${(n + 1) / 2} * var(--cell-size) + ${(n - 1) / 2} * var(--wall-size) + var(--border-line) / 2)`;
        const length = k => `calc(${k} * var(--cell-size) + ${k + 1} * var(--wall-size) - var(--border-line))`;
        svg.style.left = offset(i);
        svg.style.top = offset(j);
        svg.style.width = length(w);
        svg.style.height = length(h);

        this.map.container.appendChild(svg);
        return svg;
    }

    // (i, j) 是否在边框内（不含边界墙）
    contains(border, i, j) {
        return i > border.i && i < border.i + 2 * border.w && j > border.j && j < border.j + 2 * border.h;
    }

    // 从框内 (i, j) 走向 (ti, tj) 越过边框时，绕到对侧的同一行 / 列；同时位于多个边框内时取最小的
    wrap(i, j, ti, tj) {
        let inner = null;
        this.borders.forEach(border => {
            if (!this.contains(border, i, j) || this.contains(border, ti, tj)) return;
            if (!inner || border.w * border.h < inner.w * inner.h) inner = border;
        });
        if (!inner) return [ti, tj];
        if (ti !== i) ti = ti > i ? inner.i + 1 : inner.i + 2 * inner.w - 1;
        if (tj !== j) tj = tj > j ? inner.j + 1 : inner.j + 2 * inner.h - 1;
        return [ti, tj];
    }

    // 边界墙在对侧对应的墙：左边与右边、上边与下边同一行 / 列的墙一一对应
    linkedWalls(wi, wj) {
        const linked = [];
        this.borders.forEach(({ i, j, w, h }) => {
            const right = i + 2 * w, bottom = j + 2 * h;
            if (wj > j && wj < bottom && wj % 2 === 0) {
                if (wi === i) linked.push([right, wj]);
                else if (wi === right) linked.push([i, wj]);
            }
            if (wi > i && wi < right && wi % 2 === 0) {
                if (wj === j) linked.push([wi, bottom]);
                else if (wj === bottom) linked.push([wi, j]);
            }
        });
        return linked;
    }

    // 墙壁改动后同步到对侧的边界墙（边框相连时继续传递）
    syncWall(cell) {
        if (!this.borders.size || cell?.dataset.type !== 'wall') return;
        const { size, wall } = getCellMetrics();
        const seen = new Set([`${cell.dataset.i},${cell.dataset.j}`]);
        const queue = [[+cell.dataset.i, +cell.dataset.j]];
        while (queue.length) {
            const [wi, wj] = queue.shift();
            this.linkedWalls(wi, wj).forEach(([li, lj]) => {
                const key = `${li},${lj}`;
                if (seen.has(key)) return;
                seen.add(key);
                copyWallState(cell, this.map.ensureCell(li, lj, size, wall));
                queue.push([li, lj]);
            });
        }
    }

    // 范围内已有的墙壁逐一同步（放置、清除区块后）
    syncWallsIn(minI, maxI, minJ, maxJ) {
        if (!this.borders.size) return;
        for (let i = minI; i <= maxI; i++) {
            for (let j = minJ; j <= maxJ; j++) {
                const cell = this.map.cells.get(`${i},${j}`);
                if (cell?.dataset.type === 'wall') this.syncWall(cell);
            }
        }
    }

    // 两侧边界墙成对列出（缺失的墙壁一并建出）
    edgePairs({ i, j, w, h }) {
        const { size, wall } = getCellMetrics();
        const at = (ci, cj) => this.map.ensureCell(ci, cj, size, wall);
        const pairs = [];
        for (let y = j + 1; y < j + 2 * h; y += 2) pairs.push([at(i, y), at(i + 2 * w, y)]);
        for (let x = i + 1; x < i + 2 * w; x += 2) pairs.push([at(x, j), at(x, j + 2 * h)]);
        return pairs;
    }

    // 两侧不一致时统一：已知墙壁优先于未知，再按墙壁优先级，相同时保留左 / 上侧
    reconcile(border) {
        this.edgePairs(border).forEach(([a, b]) => {
            if (isSameWallState(a, b)) return;
            const [from, to] = getWallStateRank(b) > getWallStateRank(a) ? [b, a] : [a, b];
            copyWallState(from, to);
            this.syncWall(to);
        });
    }

    // 选区覆盖边框内全部格子时，边框随选区移动、复制或删除
    inRange({ minI, maxI, minJ, maxJ }) {
        return [...this.borders.values()].filter(({ i, j, w, h }) =>
            minI <= i + 1 && maxI >= i + 2 * w - 1 && minJ <= j + 1 && maxJ >= j + 2 * h - 1);
    }
}

// 墙壁的完整状态：类型图片、自定义颜色、附着与文本层
function copyWallState(from, to) {
    to.style.backgroundImage = from.style.backgroundImage;
    to.style.backgroundColor = from.style.backgroundColor;
    to.querySelectorAll('.attachment-layer').forEach(layer => layer.remove());
    from.querySelectorAll('.attachment-layer').forEach(layer => to.appendChild(layer.cloneNode(true)));
}

function isSameWallState(a, b) {
    const layers = cell => [...cell.querySelectorAll('.attachment-layer')].map(layer => layer.outerHTML).join('');
    return a.style.backgroundImage === b.style.backgroundImage &&
        a.style.backgroundColor === b.style.backgroundColor &&
        layers(a) === layers(b);
}

// 未知且无附着最低，其余按墙壁优先级（自定义颜色、带附着的未知墙为 -1）
function getWallStateRank(cell) {
    const type = getCurrentWallType(cell);
    if (type === '未知' && !cell.querySelector('.attachment-layer')) return -2;
    return getWallPriority(type);
}

// [边框] 移动、推箱子、快捷路径：框内越过边框时绕到对侧
function wrapBorderTarget(i, j, ti, tj) {
    return window.borderManager ? window.borderManager.wrap(i, j, ti, tj) : [ti, tj];
}

// [边框] 墙壁改动后同步对侧的边界墙
function syncBorderWall(cell) {
    window.borderManager?.syncWall(cell);
}
