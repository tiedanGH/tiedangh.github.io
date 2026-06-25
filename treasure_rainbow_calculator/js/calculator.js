// js/calculator.js — 彩虹奇兵 概率求解器
//
// 核心思想（相比逐格 3 分支暴力枚举的关键优化）：
//   1. 只对「受约束格」做 DFS：即出现在某条线索统计范围内的未知格。
//   2. 「自由格」（不在任何线索范围内的未知格）不参与搜索，而是用组合数
//      一次性计入——它们彼此对称，概率相同。这把 3^(全部未知格) 的爆炸量级
//      降到 3^(受约束格)，并精确处理大片空白地图。
//   3. 增量可行性剪枝：每条线索维护 cur(已确定的命中数) 与 pend(范围内尚未
//      确定的格数)。一旦 cur>目标 或 cur+pend<目标 立即剪枝。搜索到叶子时
//      pend 必为 0，故无需再做整盘复核。
//
// 线索语义：
//   R 红 周围8格炸弹   B 蓝 本行本列炸弹   Y 黄 周围8格宝藏
//   O 橙 周围8格宝藏+炸弹   G 绿 周围8格及本行本列宝藏(去重)
//   P 紫 周围8格及本行本列炸弹(去重)

const CLUE_RE = /^([RBYOPG])(\d+)$/;
const TREASURE = '★';
const BOMB = '✹';

// 单元格状态
const EMPTY = 0, T = 1, B = 2;

// 预计算 log 阶乘，用浮点组合数避免大整数（仅用于得到百分比，精度足够）
function makeLogFact(n) {
    const f = new Float64Array(n + 1);
    for (let i = 2; i <= n; i++) f[i] = f[i - 1] + Math.log(i);
    return f;
}

// 计算一条线索的统计范围（去重后的格子下标数组）
function buildPool(type, idx, size) {
    const r = (idx / size) | 0, c = idx % size;
    const around8 = 'RYOPG'.includes(type);   // 周围 8 格
    const rowcol  = 'BGP'.includes(type);     // 本行本列
    const dedup   = 'GOP'.includes(type);     // 需要去重
    const pool = [];
    if (around8) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const rr = r + dr, cc = c + dc;
                if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
                    pool.push(rr * size + cc);
                }
            }
        }
    }
    if (rowcol) {
        for (let i = 0; i < size; i++) {
            if (i !== c) pool.push(r * size + i);
            if (i !== r) pool.push(i * size + c);
        }
    }
    return dedup ? Array.from(new Set(pool)) : pool;
}

/**
 * @param {Object} input
 * @param {number} input.size     边长
 * @param {number} input.totalT   宝藏总数
 * @param {number} input.totalB   炸弹总数
 * @param {string[]} input.cells  长度 size*size，每格内容：'★' '✹' 'R3' … 或 ''(未知)
 * @param {number} [input.nodeCap]      搜索节点数上限（安全阀，无时间限制）
 * @returns {Object} { ok, pT, pB, isUnknown, stats }
 */
export function solveExact({ size, totalT, totalB, cells, nodeCap = 10_000_000_000 }) {
    const clock = (typeof performance !== 'undefined' ? performance : Date);
    const t0 = clock.now();
    const N = size * size;

    // ---- 解析格子 ----
    const kind = new Int8Array(N);        // 0 空白未知, 1 宝藏(固定), 2 炸弹(固定), 3 线索(已知空地)
    const KIND_BLANK = 0, KIND_T = 1, KIND_B = 2, KIND_CLUE = 3;
    let fixedT = 0, fixedB = 0;
    const clues = [];                     // {num, pool, wantT, wantB}

    for (let i = 0; i < N; i++) {
        const text = (cells[i] || '').trim();
        if (text === TREASURE)      { kind[i] = KIND_T; fixedT++; }
        else if (text === BOMB)     { kind[i] = KIND_B; fixedB++; }
        else {
            const m = text.match(CLUE_RE);
            if (m) {
                kind[i] = KIND_CLUE;
                const type = m[1];
                clues.push({
                    num: +m[2],
                    pool: buildPool(type, i, size),
                    wantT: 'YGO'.includes(type),   // 统计宝藏
                    wantB: 'RBPO'.includes(type),  // 统计炸弹
                });
            }
        }
    }

    const remT = totalT - fixedT, remB = totalB - fixedB;
    const isUnknown = new Uint8Array(N);
    for (let i = 0; i < N; i++) isUnknown[i] = kind[i] === KIND_BLANK ? 1 : 0;

    const fail = (reason) => ({
        ok: false, reason,
        pT: new Float64Array(N), pB: new Float64Array(N), isUnknown,
        stats: { timeMs: 0, totalConfigs: 0, remT, remB, constrained: 0, free: 0, nodes: 0, truncated: false },
    });

    if (remT < 0) return fail('已标记的宝藏数超过总数');
    if (remB < 0) return fail('已标记的炸弹数超过总数');

    const K = clues.length;

    // ---- 反向索引 + 受约束/自由划分 ----
    const cellClues = Array.from({ length: N }, () => []);
    const inPool = new Uint8Array(N);
    for (let ci = 0; ci < K; ci++) {
        for (const cellIdx of clues[ci].pool) {
            inPool[cellIdx] = 1;
            cellClues[cellIdx].push(ci);
        }
    }
    let free = 0;
    for (let i = 0; i < N; i++) if (kind[i] === KIND_BLANK && !inPool[i]) free++;

    // ---- 每条线索的初始 cur / pend ----
    const cur = new Int32Array(K), pend = new Int32Array(K);
    for (let ci = 0; ci < K; ci++) {
        const { pool, wantT, wantB } = clues[ci];
        for (const cellIdx of pool) {
            const k = kind[cellIdx];
            if (k === KIND_T && wantT) cur[ci]++;
            else if (k === KIND_B && wantB) cur[ci]++;
            else if (k === KIND_BLANK) pend[ci]++;
            // KIND_CLUE 是已知空地，计 0
        }
    }
    for (let ci = 0; ci < K; ci++) {
        if (cur[ci] > clues[ci].num || cur[ci] + pend[ci] < clues[ci].num) {
            return fail('线索之间存在矛盾，无解');
        }
    }

    // ---- 受约束格的搜索顺序：按线索范围从小到大分组，让线索尽快被「锁定」----
    const order = [];
    const seen = new Uint8Array(N);
    const clueOrder = Array.from({ length: K }, (_, i) => i)
        .sort((a, b) => clues[a].pool.length - clues[b].pool.length);
    for (const ci of clueOrder) {
        for (const cellIdx of clues[ci].pool) {
            if (kind[cellIdx] === KIND_BLANK && !seen[cellIdx]) {
                seen[cellIdx] = 1;
                order.push(cellIdx);
            }
        }
    }
    const M = order.length;
    const orderClues = order.map(idx => cellClues[idx]);

    // ---- DFS ----
    const logFact = makeLogFact(Math.max(free, 1));
    const assign = new Int8Array(N);
    const cntT = new Float64Array(N), cntB = new Float64Array(N);
    let W = 0, freeTnum = 0, freeBnum = 0;
    let nodes = 0, truncated = false;

    function dfs(pos, tc, bc) {
        if (truncated) return;
        // 安全阀：无时间限制，仅在搜索量超出节点上限时中止（极端复杂局面防止永久占用 CPU）
        if (++nodes > nodeCap) { truncated = true; return; }

        const restT = remT - tc, restB = remB - bc;
        if (restT < 0 || restB < 0) return;
        // 剩余待放置(宝+弹) 不能超过 剩余受约束格 + 自由格
        if (restT + restB > (M - pos) + free) return;

        if (pos === M) {
            const rt = restT, rb = restB;          // 由自由格吸收
            if (rt + rb > free) return;
            // 组合数 C(free, rt) * C(free-rt, rb)
            const w = Math.exp(
                logFact[free] - logFact[rt] - logFact[rb] - logFact[free - rt - rb]
            );
            W += w;
            for (let p = 0; p < M; p++) {
                const idx = order[p];
                if (assign[idx] === T) cntT[idx] += w;
                else if (assign[idx] === B) cntB[idx] += w;
            }
            if (free > 0) {
                freeTnum += w * rt / free;
                freeBnum += w * rb / free;
            }
            return;
        }

        const idx = order[pos];
        const cls = orderClues[pos];
        const nc = cls.length;

        for (let v = T; ; v = (v === T ? B : EMPTY)) {   // 顺序尝试 宝藏→炸弹→空
            // 应用
            for (let k = 0; k < nc; k++) {
                const ci = cls[k];
                pend[ci]--;
                if (v === T && clues[ci].wantT) cur[ci]++;
                else if (v === B && clues[ci].wantB) cur[ci]++;
            }
            // 校验受影响线索
            let ok = true;
            for (let k = 0; k < nc; k++) {
                const ci = cls[k];
                if (cur[ci] > clues[ci].num || cur[ci] + pend[ci] < clues[ci].num) { ok = false; break; }
            }
            if (ok) {
                assign[idx] = v;
                dfs(pos + 1, tc + (v === T ? 1 : 0), bc + (v === B ? 1 : 0));
                assign[idx] = EMPTY;
            }
            // 撤销
            for (let k = 0; k < nc; k++) {
                const ci = cls[k];
                pend[ci]++;
                if (v === T && clues[ci].wantT) cur[ci]--;
                else if (v === B && clues[ci].wantB) cur[ci]--;
            }
            if (v === EMPTY) break;
        }
    }

    dfs(0, 0, 0);

    const pT = new Float64Array(N), pB = new Float64Array(N);
    if (W > 0 && !truncated) {
        const freeT = free > 0 ? freeTnum / W : 0;
        const freeB = free > 0 ? freeBnum / W : 0;
        for (let i = 0; i < N; i++) {
            if (kind[i] !== KIND_BLANK) continue;
            if (inPool[i]) { pT[i] = cntT[i] / W; pB[i] = cntB[i] / W; }
            else           { pT[i] = freeT;       pB[i] = freeB; }
        }
    }

    const timeMs = clock.now() - t0;
    return {
        ok: W > 0 && !truncated,
        reason: truncated
            ? '局面过于复杂，搜索量超出上限已中止'
            : (W === 0 ? '无满足所有线索的方案' : ''),
        pT, pB, isUnknown,
        stats: {
            timeMs, totalConfigs: W, remT, remB,
            constrained: M, free, nodes, truncated,
        },
    };
}
