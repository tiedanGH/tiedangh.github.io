// js/main.js — 交互逻辑：预设地图、控件、调用后台求解、展示结果
import { createBoard } from './grid.js?v=20260625';

document.addEventListener('DOMContentLoaded', () => {
    const sizeInput     = document.getElementById('sizeInput');
    const treasureInput = document.getElementById('treasureInput');
    const bombInput     = document.getElementById('bombInput');
    const calcBtn       = document.getElementById('calcBtn');
    const clearBtn      = document.getElementById('clearBtn');
    const boardEl       = document.getElementById('boardContainer');
    const msg           = document.getElementById('message');

    const board = createBoard(boardEl);
    let worker = null;

    // ---- 状态提示 ----
    function setStatus(text, kind = '') {
        msg.textContent = text;
        msg.className = 'message' + (kind ? ' ' + kind : '');
    }
    function fmtConfigs(w) {
        if (!isFinite(w)) return '∞';
        if (w >= 1e6) return w.toExponential(2);
        return Math.round(w).toLocaleString('en-US');
    }

    // ---- 读取并校验输入 ----
    function readSize() {
        let n = Math.round(+sizeInput.value);
        if (!Number.isFinite(n)) n = 6;
        n = Math.max(1, Math.min(15, n));
        sizeInput.value = n;
        return n;
    }

    function rebuild() {
        board.rebuild(readSize());
        setStatus('');
    }

    // ---- 预设地图 ----
    document.querySelectorAll('.preset').forEach(btn => {
        btn.addEventListener('click', () => {
            sizeInput.value     = btn.dataset.size;
            treasureInput.value = btn.dataset.t;
            bombInput.value     = btn.dataset.b;
            document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            rebuild();
        });
    });

    sizeInput.addEventListener('change', () => {
        document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
        rebuild();
    });
    [treasureInput, bombInput].forEach(el =>
        el.addEventListener('change', () => board.clearProbabilities()));

    board.onEdit(() => setStatus('已修改，点击「计算概率」更新结果', 'hint'));

    clearBtn.addEventListener('click', () => { board.clearAll(); setStatus(''); });

    // ---- 计算 ----
    function onResult(result) {
        calcBtn.disabled = false;
        if (!result.ok) {
            board.clearProbabilities();
            setStatus(result.reason || '无满足线索的方案', 'error');
            return;
        }
        board.showProbabilities(result);
        const s = result.stats;
        setStatus(
            `用时 ${s.timeMs.toFixed(0)}ms · 方案数 ${fmtConfigs(s.totalConfigs)} · ` +
            `剩余宝藏 ${s.remT}、炸弹 ${s.remB}`,
            'ok'
        );
    }

    async function runSync(payload) {
        // 无 Worker 时的回退：异步让出，先渲染「计算中」
        const { solveExact } = await import('./calculator.js?v=20260625');
        setTimeout(() => onResult(solveExact(payload)), 0);
    }

    function calculate() {
        const size   = readSize();
        const totalT = Math.max(0, Math.round(+treasureInput.value) || 0);
        const totalB = Math.max(0, Math.round(+bombInput.value) || 0);
        if (totalT + totalB > size * size) {
            setStatus('宝藏与炸弹总数超过了格子数', 'error');
            return;
        }
        const payload = { size, totalT, totalB, cells: board.getCells() };

        // 取消上一次计算
        if (worker) { worker.terminate(); worker = null; }
        setStatus('计算中…', 'busy');
        calcBtn.disabled = true;

        let w = null;
        try {
            w = new Worker(new URL('./solver.worker.js?v=20260625', import.meta.url), { type: 'module' });
        } catch (_) { w = null; }

        if (w) {
            worker = w;
            w.onmessage = (e) => { worker = null; w.terminate(); onResult(e.data); };
            w.onerror = () => { worker = null; w.terminate(); runSync(payload); };
            w.postMessage(payload);
        } else {
            runSync(payload);
        }
    }

    calcBtn.addEventListener('click', calculate);

    // 初始化
    rebuild();
});
