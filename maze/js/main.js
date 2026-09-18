// 交互逻辑：边长与墙数、黑白模式、状态提示、指令生成与复制
import { createMaze, MIN_SIZE, MAX_SIZE } from './maze.js?v=20260917';

const LIMIT_MIN = 5;
const LIMIT_MAX = 64;

document.addEventListener('DOMContentLoaded', () => {
    const sizeInput  = document.getElementById('sizeInput');
    const limitInput = document.getElementById('limitInput');
    const bwInput    = document.getElementById('bwInput');
    const clearBtn   = document.getElementById('clearBtn');
    const copyBtn    = document.getElementById('copyBtn');
    const statusEl   = document.getElementById('status');
    const legendEl   = document.getElementById('legend');
    const cmdEl      = document.getElementById('cmdOutput');
    const wrapEl     = document.getElementById('mazeWrap');

    const maze = createMaze(document.getElementById('mazeGrid'), wrapEl);

    // ---- 读取并校验输入 ----
    function clampInput(el, min, max, fallback) {
        // 输入框被清空或填入非法内容时回到默认值
        const raw = el.value.trim();
        let n = raw === '' ? fallback : Math.round(+raw);
        if (!Number.isFinite(n)) n = fallback;
        n = Math.max(min, Math.min(max, n));
        el.value = n;
        return n;
    }
    const readSize  = () => clampInput(sizeInput, MIN_SIZE, MAX_SIZE, MIN_SIZE);
    const readLimit = () => clampInput(limitInput, LIMIT_MIN, LIMIT_MAX, 16);

    // ---- 状态提示与指令输出 ----
    function refresh() {
        const limit = readLimit();
        const count = maze.wallCount;
        let tail;
        if (count > limit) {
            tail = '<span class="error">已超出上限 ' + (count - limit) + ' 面，需要移除后才能提交</span>';
        } else if (maze.hasLandmarks) {
            const distance = maze.shortestDistance();
            tail = distance >= 0
                ? '<span class="ok">起点与终点之间存在通路，可以提交（最短 ' + distance + ' 步）</span>'
                : '<span class="error">起点与终点之间没有通路，无法提交</span>';
        } else {
            // 起点与终点尚未设置：先给出全图连通性，连通则任意起终点都有通路
            const regions = maze.regionCount();
            const head = regions === 1
                ? '<span class="ok">全部格子连通</span>'
                : '<span class="warn">分裂为 ' + regions + ' 个区域</span>';
            const hint = maze.nextLandmark === 'start' ? '点击格子放置起点' : '点击格子放置终点';
            tail = head + '<span class="sep">·</span><span class="hint">' + hint + '</span>';
        }
        statusEl.innerHTML = '已放置 <b>' + count + '</b> / ' + limit + ' 面墙<span class="sep">·</span>' + tail;
        cmdEl.value = maze.command();
        copyBtn.classList.remove('done');
        copyBtn.textContent = '一键复制';
    }

    maze.onChange(refresh);

    // ---- 控件 ----
    sizeInput.addEventListener('change', () => maze.rebuild(readSize()));
    limitInput.addEventListener('change', refresh);
    clearBtn.addEventListener('click', () => maze.clear());

    bwInput.addEventListener('change', () => {
        maze.setBlackWhite(bwInput.checked);
        legendEl.classList.toggle('bw', bwInput.checked);
    });

    // ---- 一键复制 ----
    function feedback(text, ok = true) {
        copyBtn.textContent = text;
        copyBtn.classList.toggle('done', ok);
        setTimeout(() => {
            copyBtn.textContent = '一键复制';
            copyBtn.classList.remove('done');
        }, 1500);
    }

    // 选中文本框内容后交由浏览器复制：非安全上下文或 clipboard 不可用时的兜底方案
    function copyBySelection(text) {
        cmdEl.removeAttribute('readonly');
        cmdEl.focus();
        cmdEl.setSelectionRange(0, text.length);
        let ok;
        try {
            ok = document.execCommand('copy');
        } catch {
            ok = false;
        }
        cmdEl.setAttribute('readonly', '');
        return ok;
    }

    async function copyText(text) {
        if (window.isSecureContext && navigator.clipboard) {
            try {
                // 页面失去焦点时 writeText 可能长时间没有结果，超时后改用兜底方案
                await Promise.race([
                    navigator.clipboard.writeText(text),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 600)),
                ]);
                return true;
            } catch { /* 继续尝试兜底方案 */ }
        }
        return copyBySelection(text);
    }

    copyBtn.addEventListener('click', async () => {
        const text = cmdEl.value;
        if (!text) {
            feedback('暂无墙体', false);
            return;
        }
        const ok = await copyText(text);
        feedback(ok ? '已复制 ✓' : '请手动复制', ok);
    });

    // ---- 窗口尺寸变化时重新计算格子大小 ----
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => maze.relayout(), 120);
    });

    maze.rebuild(readSize());
});
