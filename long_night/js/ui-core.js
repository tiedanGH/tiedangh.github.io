
const gridOptions = [
    ['空地', 'empty.png'],
    ['树丛', 'grass.png'],
    ['浆果丛', 'berry.png'],
    ['水洼', 'water.png'],
    ['传送门', 'portal.png'],
    // ['单向', 'oneway_portal.png'],
    ['陷阱', 'trap.png'],
    ['热源', 'heat.png'],
    ['心脏', 'heart.png'],
    ['逃生舱', 'exit.png'],
    ['未知', 'unknown.png'],
];
const attachOptions = [
    ['按钮', 'button.png'],
    ['炸弹', 'bomb.png'],
    ['箱子', 'box.png'],
    ['小太阳', 'heat_box.png'],
    ['屏蔽器', 'jammer_box.png'],
    ['金币', 'coin.png'],
];
const wallOptions = [
    ['空', 'walls/empty_row.png', 'walls/empty_col.png', '#FFFFFF'],
    ['普通', 'walls/wall_row.png', 'walls/wall_col.png', '#000000'],
    ['树篱', 'walls/hedge_row.png', 'walls/hedge_col.png', '#4E9A06'],
    ['门', 'walls/door_row.png', 'walls/door_col.png', '#EA68A2'],
    ['门 (开)', 'walls/dooropen_row.png', 'walls/dooropen_col.png', '#F8CDE1'],
    ['未知', 'walls/unknown_row.png', 'walls/unknown_col.png', '#D9D9D9'],
];
const pushableTypes = ['箱子', '小太阳', '屏蔽器'];
const blockingWallTypes = ['普通', '树篱', '门', '自定义'];

const num = ["⓪","①","②","③","④","⑤","⑥","⑦","⑧","⑨"];

const markerEmojis = [
    { emoji: '🧍', color: 'black', name: '玩家' },
    { emoji: '👹', color: 'orange', name: '米诺陶斯', boss: true },
    { emoji: '💣', color: 'black', name: '邦邦', boss: true },
    { emoji: '👑', color: 'black', name: '暴君', boss: true },
    { emoji: '★', color: 'red', name: '星星' },
];
// 不允许重复的标记类型
const MARKER_TYPE = {
    '🧍': 'player',
    '👹': 'minotaur',
    '💣': 'bangbang',
    '👑': 'tyrant',
};

/* ========== BOSS 图标 ========== */
// 浏览器实时缩小原图会发糊，按实际绘制的设备像素尺寸用面积平均预先缩小，作为背景图
const BOSS_IMAGE_NAMES = ['minotaur', 'bangbang', 'tyrant'];
const bossImageCache = {};
let bossIconKey = '';   // 当前图标对应的设备像素尺寸

function loadBossImage(name) {
    return bossImageCache[name] ??= new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = `./img/boss/${name}.png`;
    });
}

// 每个目标像素取其覆盖源像素的面积加权均值（按透明度加权，避免边缘发黑）
function downscaleImage(img, size) {
    const sw = img.naturalWidth, sh = img.naturalHeight;
    const src = document.createElement('canvas');
    src.width = sw;
    src.height = sh;
    const sctx = src.getContext('2d');
    sctx.drawImage(img, 0, 0);
    const s = sctx.getImageData(0, 0, sw, sh).data;

    const out = document.createElement('canvas');
    out.width = out.height = size;
    const octx = out.getContext('2d');
    const o = octx.createImageData(size, size);
    const fx = sw / size, fy = sh / size;
    for (let dy = 0; dy < size; dy++) {
        const y0 = dy * fy, y1 = y0 + fy;
        for (let dx = 0; dx < size; dx++) {
            const x0 = dx * fx, x1 = x0 + fx;
            let r = 0, g = 0, b = 0, a = 0, area = 0;
            for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
                const wy = Math.min(y + 1, y1) - Math.max(y, y0);
                for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
                    const w = (Math.min(x + 1, x1) - Math.max(x, x0)) * wy;
                    const k = (y * sw + x) * 4, wa = s[k + 3] * w;
                    r += s[k] * wa; g += s[k + 1] * wa; b += s[k + 2] * wa; a += wa; area += w;
                }
            }
            const i = (dy * size + dx) * 4;
            if (a > 0) {
                o.data[i] = r / a; o.data[i + 1] = g / a; o.data[i + 2] = b / a;
            }
            o.data[i + 3] = a / area;
        }
    }
    octx.putImageData(o, 0, 0);
    return out.toDataURL();
}

function bossIconUrl(img, px) {
    if (px >= img.naturalWidth) return `url('${img.src}')`;   // 放大时直接用原图
    try {
        return `url('${downscaleImage(img, px)}')`;
    } catch {
        return `url('${img.src}')`;   // 画布无法读取像素时（如图片跨域）退回原图
    }
}

// 地图缩放、窗口尺寸或设备像素比变化时重新生成
async function refreshBossIcons(mapSize) {
    const root = document.documentElement;
    const dpr = window.devicePixelRatio || 1;
    const menuSize = parseFloat(getComputedStyle(root).getPropertyValue('--boss-menu-size'));
    const mapPx = Math.round(mapSize * dpr), menuPx = Math.round(menuSize * dpr);
    const key = `${mapPx}/${menuPx}`;
    if (key === bossIconKey) return;
    bossIconKey = key;
    for (const name of BOSS_IMAGE_NAMES) {
        const img = await loadBossImage(name);
        if (key !== bossIconKey) return;   // 等待期间尺寸变化，交给新的一次生成
        if (!img) continue;
        root.style.setProperty(`--boss-${name}`, bossIconUrl(img, mapPx));
        root.style.setProperty(`--boss-${name}-menu`, bossIconUrl(img, menuPx));
    }
}

// 玩家移动相关
let currentMap = null;

function uiCellEvents(map) {
    currentMap = map; // 保存地图引用

    map.container.addEventListener('contextmenu', e => e.preventDefault());

    // 移动端双击支持
    let lastClickTime = 0;
    map.container.addEventListener('click', e => {
        if (window.editModeManager?.isActive()) return;
        const now = Date.now();
        const cell = e.target.closest('.cell');
        if (!cell || cell.classList.contains('center') || cell.dataset.type !== 'square') return;

        if (now - lastClickTime < 800) {
            e.preventDefault();
            removeSelector();
            showPlayerSelector(e, (choice, color) => {
                if (choice === '__CLEAR__') clearMarkers(cell);
                else addMarker(cell, choice, color);
                removeSelector();

                // 更新玩家位置
                if (choice === '🧍') {
                    window.playerCell = cell;
                    resetPlayerMoveHistory();   // 重新放置玩家：清空行动轨迹
                }
            }, cell);
        }
        lastClickTime = now;
    });

    // 右键：标记玩家 / 清空标记
    map.container.addEventListener('mousedown', e => {
        if (window.editModeManager?.isActive()) return;
        if (e.button !== 2) return;
        removeSelector();
        const cell = e.target.closest('.cell');
        if (!cell || cell.classList.contains('center') || cell.dataset.type !== 'square') return;

        // 如果按Shift则改为清空标记
        if (e.shiftKey) { clearMarkers(cell); return; }

        showPlayerSelector(e, (choice, color) => {
            if (choice === '__CLEAR__') clearMarkers(cell);
            else addMarker(cell, choice, color);
            removeSelector();

            // 更新玩家位置
            if (choice === '🧍') {
                window.playerCell = cell;
                resetPlayerMoveHistory();   // 重新放置玩家：清空行动轨迹
            }
        }, cell);
    });

    // 左键：设置方块 / 墙
    map.container.addEventListener('mousedown', e => {
        if (window.editModeManager?.isActive()) return;
        if (e.button !== 0) return;
        removeSelector();
        const cell = e.target.closest('.cell');
        if (!cell || cell.classList.contains('center')) return;
        const type = cell.dataset.type;

        if (type === 'square') {
            showSquareAttachSelector(e, cell);
        } else if (type === 'wall') {
            const orientation = cell.classList.contains('horizontal') ? 'horizontal' : 'vertical';
            showWallSelector(e, cell, orientation);
        }
    });

    initKeyboardControls();
    initMobileDirectionControls();
}

function saveHistory() {
    if (window.historyManager) {
        setTimeout(() => {
            window.historyManager.saveState();
        }, 10);
    }
}
