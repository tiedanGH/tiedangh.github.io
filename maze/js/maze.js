// 迷宫渲染与墙体状态
//
// 与游戏内保持一致的坐标口径：
//   横墙 h(c, r)：格子 (c, r) 与 (c, r+1) 之间，c ∈ [0, size)，r ∈ [0, size-1)
//   纵墙 v(c, r)：格子 (c, r) 与 (c+1, r) 之间，c ∈ [0, size-1)，r ∈ [0, size)
// 格子编号自左上角起按行优先从 1 开始：id = r * size + c + 1

export const MIN_SIZE = 5;
export const MAX_SIZE = 9;

const key = (c, r) => c + ',' + r;

export function createMaze(gridEl, wrapEl) {
    let size = 0;
    const wallH = new Set();
    const wallV = new Set();
    let slots = new Map();      // 'h:c,r' / 'v:c,r' → 墙壁位置元素
    let cells = new Map();      // 'c,r' → { el, mark, square }
    let start = null;           // 起点，{ c, r } 或 null
    let goal = null;            // 终点，{ c, r } 或 null
    let changeHandler = () => {};

    /* ========== 墙体读写 ========== */
    const hasH = (c, r) => wallH.has(key(c, r));
    const hasV = (c, r) => wallV.has(key(c, r));
    const samePos = (pos, c, r) => !!pos && pos.c === c && pos.r === r;

    // 指定格子四周可通行的方向，地图边界视为墙
    function openNeighbors(c, r) {
        const list = [];
        if (r > 0 && !hasH(c, r - 1)) list.push([c, r - 1]);
        if (r < size - 1 && !hasH(c, r)) list.push([c, r + 1]);
        if (c > 0 && !hasV(c - 1, r)) list.push([c - 1, r]);
        if (c < size - 1 && !hasV(c, r)) list.push([c + 1, r]);
        return list;
    }

    /* ========== 绘制 ========== */
    // 按容器宽度自适应格子尺寸，比例参考游戏内的 56 : 10
    function relayout() {
        if (!size) return;
        const avail = Math.max(240, (wrapEl.clientWidth || 680) - 2);
        let wallPx = 10;
        let cellPx = Math.floor((avail - wallPx * (size + 1)) / size);
        if (cellPx < 34) {
            wallPx = 8;
            cellPx = Math.floor((avail - wallPx * (size + 1)) / size);
        }
        cellPx = Math.max(22, Math.min(56, cellPx));
        gridEl.style.setProperty('--cell-size', cellPx + 'px');
        gridEl.style.setProperty('--wall-size', wallPx + 'px');
        gridEl.style.setProperty('--num-font', Math.max(9, Math.round(cellPx * 0.23)) + 'px');
    }

    function paintSlot(k) {
        const el = slots.get(k);
        if (!el) return;
        const set = k[0] === 'h' ? wallH : wallV;
        el.classList.toggle('on', set.has(k.slice(2)));
    }

    // 黑白信息：周边通路数为奇数则为黑，偶数则为白
    function paintSquare(c, r) {
        const data = cells.get(key(c, r));
        if (data) data.square.classList.toggle('black', openNeighbors(c, r).length % 2 === 1);
    }

    // 起点与终点：底色与标记，且不展示黑白信息（由 CSS 依据 start / goal 类处理）
    function paintLandmark(c, r) {
        const data = cells.get(key(c, r));
        if (!data) return;
        const isStart = samePos(start, c, r);
        const isGoal = samePos(goal, c, r);
        data.el.classList.toggle('start', isStart);
        data.el.classList.toggle('goal', isGoal);
        data.mark.textContent = isStart ? '起' : (isGoal ? '终' : '');
    }

    function paintAllCells() {
        for (let c = 0; c < size; ++c) {
            for (let r = 0; r < size; ++r) {
                paintSquare(c, r);
                paintLandmark(c, r);
            }
        }
    }

    // 重建整张迷宫：(2 * size + 1)² 个单元，依次为交点、墙壁位置与格子
    function rebuild(newSize) {
        size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(newSize) || MIN_SIZE));
        // 缩小边长后越界的墙体与地标不再保留
        for (const k of [...wallH]) {
            const [c, r] = k.split(',').map(Number);
            if (c >= size || r >= size - 1) wallH.delete(k);
        }
        for (const k of [...wallV]) {
            const [c, r] = k.split(',').map(Number);
            if (c >= size - 1 || r >= size) wallV.delete(k);
        }
        if (start && (start.c >= size || start.r >= size)) start = null;
        if (goal && (goal.c >= size || goal.r >= size)) goal = null;

        slots = new Map();
        cells = new Map();
        const n = size * 2 + 1;
        const track = [];
        for (let i = 0; i < size; ++i) {
            track.push('var(--wall-size)', 'var(--cell-size)');
        }
        track.push('var(--wall-size)');
        gridEl.style.gridTemplateColumns = track.join(' ');
        gridEl.style.gridTemplateRows = track.join(' ');

        const frag = document.createDocumentFragment();
        for (let row = 0; row < n; ++row) {
            for (let col = 0; col < n; ++col) {
                const evenRow = row % 2 === 0;
                const evenCol = col % 2 === 0;
                const el = document.createElement('div');
                if (evenRow && evenCol) {
                    el.className = 'corner';
                } else if (evenRow) {
                    // 横向墙壁，最上与最下为地图边界
                    const c = (col - 1) / 2;
                    const r = row / 2 - 1;
                    if (row === 0 || row === n - 1) {
                        el.className = 'border horizontal';
                    } else {
                        el.className = 'slot horizontal';
                        el.dataset.k = 'h:' + key(c, r);
                        el.title = (r * size + c + 1) + '下 / ' + ((r + 1) * size + c + 1) + '上';
                        slots.set(el.dataset.k, el);
                    }
                } else if (evenCol) {
                    // 纵向墙壁，最左与最右为地图边界
                    const c = col / 2 - 1;
                    const r = (row - 1) / 2;
                    if (col === 0 || col === n - 1) {
                        el.className = 'border vertical';
                    } else {
                        el.className = 'slot vertical';
                        el.dataset.k = 'v:' + key(c, r);
                        el.title = (r * size + c + 1) + '右 / ' + (r * size + c + 2) + '左';
                        slots.set(el.dataset.k, el);
                    }
                } else {
                    // 格子：编号常驻左上角，黑白方块在底层，地标压在上层
                    const c = (col - 1) / 2;
                    const r = (row - 1) / 2;
                    el.className = 'cell';
                    el.title = (r * size + c + 1) + ' 号格';
                    const num = document.createElement('span');
                    num.className = 'num';
                    num.textContent = String(r * size + c + 1);
                    const square = document.createElement('span');
                    square.className = 'square';
                    const mark = document.createElement('span');
                    mark.className = 'mark';
                    el.append(num, square, mark);
                    cells.set(key(c, r), { el, mark, square });
                }
                frag.appendChild(el);
            }
        }
        gridEl.replaceChildren(frag);
        for (const k of slots.keys()) {
            paintSlot(k);
        }
        paintAllCells();
        relayout();
        changeHandler();
    }

    /* ========== 交互 ========== */
    // 点击墙壁位置直接放置或移除
    function toggleWall(k) {
        const body = k.slice(2);
        const [c, r] = body.split(',').map(Number);
        const set = k[0] === 'h' ? wallH : wallV;
        if (set.has(body)) {
            set.delete(body);
        } else {
            set.add(body);
        }
        paintSlot(k);
        // 墙体只影响两侧格子的通路数
        paintSquare(c, r);
        if (k[0] === 'h') {
            paintSquare(c, r + 1);
        } else {
            paintSquare(c + 1, r);
        }
    }

    gridEl.addEventListener('click', (e) => {
        const slot = e.target.closest('.slot');
        if (!slot) return;
        toggleWall(slot.dataset.k);
        changeHandler();
    });

    /* ========== 对外接口 ========== */
    // 起点与终点来自上方输入框，传入格子编号（1 ~ size²），null 或越界表示未设置
    function setLandmarks(startId, goalId) {
        const toPos = (id) => {
            if (!Number.isInteger(id) || id < 1 || id > size * size) {
                return null;
            }
            return { c: (id - 1) % size, r: Math.floor((id - 1) / size) };
        };
        const stale = [start, goal];
        start = toPos(startId);
        goal = toPos(goalId);
        for (const pos of [...stale, start, goal]) {
            if (pos) paintLandmark(pos.c, pos.r);
        }
    }

    function clear() {
        if (!wallH.size && !wallV.size) return;
        wallH.clear();
        wallV.clear();
        for (const k of slots.keys()) {
            paintSlot(k);
        }
        paintAllCells();
        changeHandler();
    }

    function setBlackWhite(on) {
        gridEl.classList.toggle('bw', !!on);
    }

    // 全部格子的连通块数量：为 1 时任意起点与终点之间都存在通路
    function regionCount() {
        const total = size * size;
        const seen = new Array(total).fill(false);
        let regions = 0;
        for (let i = 0; i < total; ++i) {
            if (seen[i]) continue;
            ++regions;
            seen[i] = true;
            const stack = [[Math.floor(i / size), i % size]];
            while (stack.length) {
                const [c, r] = stack.pop();
                for (const [nc, nr] of openNeighbors(c, r)) {
                    const id = nc * size + nr;
                    if (seen[id]) continue;
                    seen[id] = true;
                    stack.push([nc, nr]);
                }
            }
        }
        return regions;
    }

    // 起点到终点的最短通路长度，不可达返回 -1，未设置地标返回 null
    function shortestDistance() {
        if (!start || !goal) return null;
        const distance = new Array(size * size).fill(-1);
        distance[start.c * size + start.r] = 0;
        let queue = [[start.c, start.r]];
        while (queue.length) {
            const nextQueue = [];
            for (const [c, r] of queue) {
                if (c === goal.c && r === goal.r) {
                    return distance[c * size + r];
                }
                for (const [nc, nr] of openNeighbors(c, r)) {
                    const id = nc * size + nr;
                    if (distance[id] >= 0) continue;
                    distance[id] = distance[c * size + r] + 1;
                    nextQueue.push([nc, nr]);
                }
            }
            queue = nextQueue;
        }
        return -1;
    }

    // 机器人画图指令：按编号顺序为每面墙给出唯一的<编号><方向>，同一面墙只出现一次
    function command() {
        const tokens = [];
        for (let r = 0; r < size; ++r) {
            for (let c = 0; c < size; ++c) {
                const id = r * size + c + 1;
                if (r < size - 1 && hasH(c, r)) tokens.push(id + '下');
                if (c < size - 1 && hasV(c, r)) tokens.push(id + '右');
            }
        }
        return tokens.join(' ');
    }

    return {
        rebuild,
        clear,
        setBlackWhite,
        setLandmarks,
        relayout,
        regionCount,
        shortestDistance,
        command,
        get size() { return size; },
        get wallCount() { return wallH.size + wallV.size; },
        get hasLandmarks() { return !!start && !!goal; },
        onChange(cb) { changeHandler = cb; },
    };
}
