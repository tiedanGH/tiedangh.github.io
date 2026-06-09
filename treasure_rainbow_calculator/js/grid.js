// js/grid.js — 棋盘渲染与单元格编辑
//
// 设计：每个格子的「真值」存于 dataset.val（'' / '★' / '✹' / 'R3' …），
// 概率显示只是叠加层，清除后可从 dataset.val 复原，因此计算后仍可继续编辑。

const CLUE_RE = /^([RBYOPG])(\d+)$/;

// 提交时把用户输入规范化为真值
function normalize(raw) {
    const v = raw.trim().toUpperCase();
    if (v === '') return '';
    if (CLUE_RE.test(v)) return v;                  // 颜色线索，如 R3
    if (v === 'T' || v === '★' || v === '*') return '★';
    if (v === 'X' || v === '✹' || v === 'B') return '✹';
    return '';                                       // 无法识别 → 视为空
}

// 依据 dataset.val 重绘单元格外观
function paintCell(cell) {
    const v = cell.dataset.val || '';
    cell.className = 'cell';
    cell.innerHTML = '';
    if (v === '★') { cell.textContent = '★'; cell.classList.add('treasure'); }
    else if (v === '✹') { cell.textContent = '✹'; cell.classList.add('bomb'); }
    else {
        const m = v.match(CLUE_RE);
        if (m) { cell.textContent = v; cell.classList.add(m[1]); }
        else cell.textContent = '';
    }
}

export function createBoard(container) {
    let size = 0;
    let cellEls = [];
    let editHandler = () => {};
    let hasProbs = false;

    function relayout() {
        if (!size) return;
        const cols = size + 2;
        // 自适应格子尺寸：容器宽度 / 列数，限制在 [22, 44]px
        const avail = Math.min(container.clientWidth || 560, 560);
        const cell = Math.max(22, Math.min(44, Math.floor(avail / cols)));
        container.style.setProperty('--cell', cell + 'px');
        container.style.setProperty('--font', Math.max(9, Math.round(cell * 0.30)) + 'px');
        container.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
    }

    function beginEdit(cell) {
        if (hasProbs) clearProbabilities();      // 计算后点击 → 回到编辑态
        cell.classList.add('editing');
        cell.textContent = cell.dataset.val && cell.dataset.val.match(CLUE_RE) ? cell.dataset.val : '';
        cell.contentEditable = 'true';
        cell.focus();
        const sel = window.getSelection();
        sel.selectAllChildren(cell);
    }

    function commitEdit(cell) {
        cell.contentEditable = 'false';
        cell.classList.remove('editing');
        const next = normalize(cell.textContent);
        const changed = next !== (cell.dataset.val || '');
        cell.dataset.val = next;
        paintCell(cell);
        if (changed) editHandler();
    }

    function makeCoord(text) {
        const d = document.createElement('div');
        d.className = 'coord-cell';
        d.textContent = text;
        return d;
    }

    function rebuild(n) {
        size = n;
        container.innerHTML = '';
        cellEls = new Array(n * n);
        hasProbs = false;

        for (let r = 0; r < n + 2; r++) {
            for (let c = 0; c < n + 2; c++) {
                const edge = r === 0 || r === n + 1 || c === 0 || c === n + 1;
                if (edge) {
                    const onTopBot = r === 0 || r === n + 1;
                    const onLeftRight = c === 0 || c === n + 1;
                    let label = '';
                    if (onTopBot && !onLeftRight) label = String.fromCharCode(64 + c);
                    else if (onLeftRight && !onTopBot) label = String(r);
                    container.appendChild(makeCoord(label));
                    continue;
                }
                const idx = (r - 1) * n + (c - 1);
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.index = idx;
                cell.dataset.val = '';
                cell.addEventListener('click', () => {
                    if (cell.isContentEditable) return;
                    beginEdit(cell);
                });
                cell.addEventListener('blur', () => commitEdit(cell));
                cell.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); cell.blur(); }
                    else if (e.key === 'Escape') { e.preventDefault(); paintCell(cell); cell.blur(); }
                });
                cellEls[idx] = cell;
                container.appendChild(cell);
            }
        }
        relayout();
    }

    function getCells() {
        return cellEls.map(c => c.dataset.val || '');
    }

    function clearAll() {
        cellEls.forEach(c => { c.dataset.val = ''; paintCell(c); });
        hasProbs = false;
    }

    function clearProbabilities() {
        if (!hasProbs) return;
        cellEls.forEach(paintCell);
        hasProbs = false;
    }

    // 渲染概率叠加层
    function showProbabilities(result) {
        const { pT, pB, isUnknown } = result;
        // 找最大宝藏概率与并列个数；若所有未知格概率相同（无区分度）则不高亮
        let maxPT = 0, unknownN = 0;
        for (let i = 0; i < pT.length; i++) {
            if (!isUnknown[i]) continue;
            unknownN++;
            if (pT[i] > maxPT) maxPT = pT[i];
        }
        let bestN = 0;
        for (let i = 0; i < pT.length; i++)
            if (isUnknown[i] && Math.abs(pT[i] - maxPT) < 1e-9) bestN++;
        const markBest = maxPT > 0 && bestN < unknownN;

        cellEls.forEach((cell, i) => {
            if (!isUnknown[i]) { paintCell(cell); return; }   // 已知格保持原样
            const t = Math.round(pT[i] * 100);
            const b = Math.round(pB[i] * 100);
            cell.className = 'cell prob-cell';
            cell.innerHTML =
                `<span class="line1">${t}</span>` +
                `<span class="line2 ${b > 40 ? 'danger' : b === 0 ? 'safe' : ''}">${b}</span>`;
            // 宝藏热度背景
            cell.style.setProperty('--heat', pT[i].toFixed(3));
            if (markBest && Math.abs(pT[i] - maxPT) < 1e-9) cell.classList.add('best');
            if (b === 0) cell.classList.add('safe-cell');
        });
        hasProbs = true;
    }

    function onEdit(fn) { editHandler = fn; }

    window.addEventListener('resize', relayout);

    return { rebuild, getCells, clearAll, clearProbabilities, showProbabilities, onEdit, relayout,
        get size() { return size; } };
}
