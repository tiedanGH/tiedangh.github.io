// ========== main ==========
document.addEventListener('DOMContentLoaded', () => {
    const sizeInput = document.getElementById('sizeInput');
    const totalInput = document.getElementById('totalInput');
    const calcBtn = document.getElementById('calcBtn');
    const board = document.getElementById('boardContainer');
    const msg = document.getElementById('message');

    // 初始构建网格
    buildGrid(board, msg, parseInt(sizeInput.value, 10));

    // 适配窗口大小
    window.addEventListener('resize', () => {
        applyBoard(board, parseInt(sizeInput.value, 10));
    });

    // 事件监听
    sizeInput.addEventListener('change', () => {
        buildGrid(board, msg, parseInt(sizeInput.value, 10));
    });

    // 设置计算器
    setupCalculator({
        sizeInput,
        totalInput,
        calcBtn,
        board,
        msg,
        buildGrid: (n) => buildGrid(board, msg, n)
    });
});

// ========== grid ==========
function buildGrid(board, msg, n) {
    const gap = window.innerWidth > 600 ? 40 : 30;
    msg.textContent = '';
    board.innerHTML = '';
    board.style.gridTemplateColumns = `repeat(${n + 2}, ${gap}px)`;

    for (let row = 0; row < n + 2; row++) {
        for (let col = 0; col < n + 2; col++) {
            const isTop = row === 0;
            const isBottom = row === n + 1;
            const isLeft = col === 0;
            const isRight = col === n + 1;

            const isCorner = (isTop || isBottom) && (isLeft || isRight);
            if (isCorner) {
                const corner = document.createElement('div');
                corner.classList.add('coord-cell');
                board.appendChild(corner);
                continue;
            }
            if (isTop || isBottom) {
                const letter = document.createElement('div');
                letter.textContent = String.fromCharCode(64 + col);
                letter.classList.add('coord-cell');
                board.appendChild(letter);
                continue;
            }
            if (isLeft || isRight) {
                const number = document.createElement('div');
                number.textContent = row.toString();
                number.classList.add('coord-cell');
                board.appendChild(number);
                continue;
            }

            // 中心格子
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.maxLength = 4;
            inp.dataset.index = ((row - 1) * n + (col - 1)).toString();
            inp.addEventListener('click', () => {
                inp.value = '';
                inp.classList.remove('known', 'marked', 'prob', 'highlight');
            });
            inp.addEventListener('input', () => {
                const v = inp.value.toUpperCase();
                inp.value = /^[0-9*]*$/.test(v) ? v : '';
            });

            board.appendChild(inp);
        }
    }
}

function applyBoard(board, n) {
    const gap = window.innerWidth > 600 ? 40 : 30;
    board.style.gridTemplateColumns = `repeat(${n + 2}, ${gap}px)`;
}

// ========== calculator ==========
function setupCalculator({ sizeInput, totalInput, calcBtn, board, msg, buildGrid }) {
    // 计算概率
    async function calculate() {
        const originalText = calcBtn.textContent;
        calcBtn.textContent = '计算中…';
        calcBtn.disabled = true;
        msg.textContent = '';
        await new Promise(resolve => setTimeout(resolve, 10)); // UI更新

        const t0 = performance.now();
        const n = parseInt(sizeInput.value, 10);
        const totalMines = parseInt(totalInput.value, 10);
        const inputs = Array.from(board.querySelectorAll('input'));
        const rows = n, cols = n;
        const grid = Array(rows).fill(0).map(() => Array(cols).fill(-1));
        const marked = [], known = [];

        if (n > 15) {
            alert('边长过大，可能导致浏览器卡顿或崩溃。请设置不超过 15 的值！');
            sizeInput.value = 15;
            buildGrid(15);
            calcBtn.disabled = false;
            calcBtn.textContent = originalText;
            return;
        }

        // 读取已知格
        inputs.forEach(inp => {
            inp.classList.remove('known', 'marked', 'prob', 'highlight');
            const idx = +inp.dataset.index;
            const r = Math.floor(idx / cols), c = idx % cols;
            const v = inp.value;
            if (v === '*') {
                grid[r][c] = -2;
                marked.push([r, c]);
            } else if (/^\d+$/.test(v)) {
                grid[r][c] = +v;
                known.push([r, c, +v]);
            }
        });
        const remaining = totalMines - marked.length;

        // 边界格与自由格
        const borderSet = new Set();
        known.forEach(([r, c]) => {
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (!dr && !dc) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === -1) {
                    borderSet.add(nr * cols + nc);
                }
            }
        });
        const border = Array.from(borderSet);
        const B = border.length;
        const borderIndex = new Map(border.map((v, i) => [v, i]));

        const free = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            if (grid[r][c] === -1 && !borderSet.has(idx)) free.push([r, c]);
        }
        const F = free.length;

        // 构建约束
        const constraints = known.map(([r, c, val]) => {
            let fixed = 0, adj = [];
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (!dr && !dc) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                    if (grid[nr][nc] === -2) fixed++;
                    else {
                        const key = nr * cols + nc;
                        if (borderIndex.has(key)) adj.push(borderIndex.get(key));
                    }
                }
            }
            return [val - fixed, adj];
        });

        // 基本合法性检查
        for (const [need, adj] of constraints) {
            if (need < 0 || need > adj.length) {
                msg.textContent = '计算失败：已知数字错误，或与已知宝藏冲突';
                calcBtn.disabled = false;
                calcBtn.textContent = originalText;
                return;
            }
        }

        // 自由格组合数 C(F,k)
        const comb = Array(F + 1).fill(0n);
        if (F > 0) {
            comb[0] = 1n;
            for (let k = 1; k <= F; k++) {
                comb[k] = comb[k - 1] * BigInt(F - k + 1) / BigInt(k);
            }
        }

        // 划分约束连通块 - 优化连通块识别
        const cell2constraints = Array(B).fill(0).map(() => []);
        constraints.forEach(([, adj], ci) => adj.forEach(bi => cell2constraints[bi].push(ci)));

        const visited = Array(B).fill(false);
        const blocks = [];

        // 连通块识别算法
        for (let i = 0; i < B; i++) {
            if (!visited[i]) {
                const queue = [i];
                const compCells = new Set([i]);
                const compCons = new Set();
                visited[i] = true;

                while (queue.length) {
                    const u = queue.shift();
                    for (const ci of cell2constraints[u]) {
                        compCons.add(ci);
                        for (const neighbor of constraints[ci][1]) {
                            if (!visited[neighbor]) {
                                visited[neighbor] = true;
                                queue.push(neighbor);
                                compCells.add(neighbor);
                            }
                        }
                    }
                }

                blocks.push({
                    cells: Array.from(compCells),
                    cons: Array.from(compCons)
                });
            }
        }

        // 分块回溯 + 自由格卷积
        let totalWays = 0n;
        const borderCounts = Array(B).fill(0n);
        let freeSum = 0n;
        const blockAssign = {};

        // 剪枝策略
        function dfsBlock(bi, minesSoFar) {
            if (bi === blocks.length) {
                if (minesSoFar > remaining) return;
                const f = remaining - minesSoFar;
                if (f < 0 || f > F) return;
                const waysFree = comb[f] || 1n;
                totalWays += waysFree;
                freeSum += BigInt(f) * waysFree;
                for (let i = 0; i < B; i++) {
                    if (blockAssign[i] === 1) borderCounts[i] += waysFree;
                }
                return;
            }

            const { cells, cons } = blocks[bi];
            const sz = cells.length;

            // 预计算约束状态
            const constraintStates = cons.map(ci => {
                const [need, adj] = constraints[ci];
                let assigned = 0;
                let unknown = adj.filter(bi => !blockAssign.hasOwnProperty(bi)).length;
                return { need, assigned, unknown };
            });

            // 回溯函数
            function dfsCell(pos, minesInBlock) {
                // 检查约束是否满足 - 动态更新约束状态
                for (let idx = 0; idx < constraintStates.length; idx++) {
                    const state = constraintStates[idx];
                    if (state.assigned > state.need) return;
                    if (state.assigned + state.unknown < state.need) return;
                }

                if (pos === sz) {
                    dfsBlock(bi + 1, minesSoFar + minesInBlock);
                    return;
                }

                const idx = cells[pos];

                // 尝试不放雷
                blockAssign[idx] = 0;
                // 更新相关约束状态
                let valid = true;
                for (const ci of cell2constraints[idx]) {
                    const state = constraintStates[cons.indexOf(ci)];
                    state.unknown--;
                    if (state.assigned > state.need || state.assigned + state.unknown < state.need) {
                        valid = false;
                    }
                }

                if (valid) {
                    dfsCell(pos + 1, minesInBlock);
                }

                // 恢复约束状态
                for (const ci of cell2constraints[idx]) {
                    const state = constraintStates[cons.indexOf(ci)];
                    state.unknown++;
                }

                // 尝试放雷
                blockAssign[idx] = 1;
                valid = true;
                for (const ci of cell2constraints[idx]) {
                    const state = constraintStates[cons.indexOf(ci)];
                    state.assigned++;
                    state.unknown--;
                    if (state.assigned > state.need || state.assigned + state.unknown < state.need) {
                        valid = false;
                    }
                }

                if (valid) {
                    dfsCell(pos + 1, minesInBlock + 1);
                }

                // 恢复约束状态
                for (const ci of cell2constraints[idx]) {
                    const state = constraintStates[cons.indexOf(ci)];
                    state.assigned--;
                    state.unknown++;
                }

                delete blockAssign[idx];
            }

            dfsCell(0, 0);
        }

        // 使用异步执行让UI能更新
        await new Promise(resolve => {
            setTimeout(() => {
                dfsBlock(0, 0);
                resolve();
            }, 10);
        });

        dfsBlock(0, 0);

        // 无解检测
        if (totalWays === 0n) {
            msg.textContent = '计算失败：无有效解，请检查输入！';
            calcBtn.disabled = false;
            calcBtn.textContent = originalText;
            return;
        }

        // 渲染概率
        const pctMap = {}, pctList = [];
        border.forEach((cell, i) => {
            const p = Number((borderCounts[i] * 100n) / totalWays);
            pctMap[cell] = p;
            pctList.push(p);
        });
        if (F > 0) {
            const freePct = Number((freeSum * 100n) / (BigInt(F) * totalWays));
            free.forEach(([r, c]) => {
                pctMap[r * cols + c] = freePct;
                pctList.push(freePct);
            });
        }
        const maxPct = Math.max(...pctList.filter(x => x > 0), 0);

        inputs.forEach(inp => {
            const idx = +inp.dataset.index, v = inp.value;
            if (v === '*') {
                inp.classList.add('marked');
            } else if (/^\d+$/.test(v)) {
                inp.classList.add('known');
            } else {
                const p = pctMap[idx] || 0;
                if (p > 0) {
                    inp.value = p + '%';
                    inp.classList.add('prob');
                    if (p === maxPct) inp.classList.add('highlight');
                } else {
                    inp.value = '';
                }
            }
        });

        function formatBigIntSci(nBigInt, sigDigits = 10) {
            const s = nBigInt.toString();
            const len = s.length;
            if (len <= sigDigits + 1) return s;
            const mantissa = s[0] + '.' + s.slice(1, sigDigits);
            const exp = len - 1;
            return `${mantissa}e+${exp}`;
        }

        // 展示统计信息
        const t1 = performance.now();
        const elapsed = ((t1 - t0) / 1000).toFixed(2);
        const waysStr = formatBigIntSci(totalWays);
        msg.textContent = `用时 ${elapsed}s，剩余宝藏 ${remaining}，总方案数 ${waysStr}`;

        calcBtn.disabled = false;
        calcBtn.textContent = originalText;
    }

    // 绑定计算按钮事件
    calcBtn.addEventListener('click', calculate);
}
