
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
// 标记类型
const MARKER_TYPE = {
    '🧍': 'player',
    '👹': 'minotaur',
    '💣': 'bangbang',
    '👑': 'tyrant',
};
// 全图唯一的标记类型
const UNIQUE_MARKER_TYPES = new Set(['player']);

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
function downscaleImage(img, width, height = width) {
    const sw = img.naturalWidth, sh = img.naturalHeight;
    const src = document.createElement('canvas');
    src.width = sw;
    src.height = sh;
    const sctx = src.getContext('2d');
    sctx.drawImage(img, 0, 0);
    const s = sctx.getImageData(0, 0, sw, sh).data;

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const octx = out.getContext('2d');
    const o = octx.createImageData(width, height);
    const fx = sw / width, fy = sh / height;
    for (let dy = 0; dy < height; dy++) {
        const y0 = dy * fy, y1 = Math.min((dy + 1) * fy, sh);
        for (let dx = 0; dx < width; dx++) {
            const x0 = dx * fx, x1 = Math.min((dx + 1) * fx, sw);
            let r = 0, g = 0, b = 0, a = 0, area = 0;
            for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
                const wy = Math.min(y + 1, y1) - Math.max(y, y0);
                for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
                    const w = (Math.min(x + 1, x1) - Math.max(x, x0)) * wy;
                    const k = (y * sw + x) * 4, wa = s[k + 3] * w;
                    r += s[k] * wa; g += s[k + 1] * wa; b += s[k + 2] * wa; a += wa; area += w;
                }
            }
            const i = (dy * width + dx) * 4;
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

/* ========== 图例图标、区块预览与地图图片 ========== */
// 原图比显示尺寸大时，图标按显示的设备像素尺寸预先缩小，避免浏览器实时缩小发糊
const scaledImageCache = new Map();   // `${src}@${宽}x${高}` → 缩小后的图片地址，无需缩小时为 null

function getScaledImage(src, width, height) {
    const key = `${src}@${width}x${height}`;
    if (!scaledImageCache.has(key)) {
        scaledImageCache.set(key, new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                if (width >= img.naturalWidth && height >= img.naturalHeight) return resolve(null);   // 放大时用原图
                try {
                    resolve(downscaleImage(img, width, height));
                } catch {
                    resolve(null);   // 画布无法读取像素时（如图片跨域）用原图
                }
            };
            img.onerror = () => resolve(null);
            img.src = src;
        }));
    }
    return scaledImageCache.get(key);
}

// 菜单放入页面后调用：图例图标与区块预览按显示尺寸换成清晰版本
function sharpenMenuIcons(container) {
    const dpr = window.devicePixelRatio || 1;
    container.querySelectorAll('img.square-box, img.wall-box, .preview img.attach').forEach(img => {
        const src = img.getAttribute('src');
        const width = Math.round(img.clientWidth * dpr);
        const height = Math.round(img.clientHeight * dpr);
        if (!src || !width || !height) return;
        getScaledImage(src, width, height).then(url => {
            if (url) img.src = url;
        });
    });
    // 区块预览的地形格：背景按 cover 铺满，按较长边生成
    container.querySelectorAll('.preview td').forEach(td => {
        const src = td.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
        const size = Math.round(Math.max(td.clientWidth, td.clientHeight) * dpr);
        if (!src || !size) return;
        getScaledImage(src, size, size).then(url => {
            if (url) td.style.backgroundImage = `url('${url}')`;
        });
    });
}

// 地图上的地形与附着：以样式覆盖格子的行内背景图，行内写法不变
const mapImageStyle = document.createElement('style');
let mapImagePx = 0;

// 地图缩放、窗口尺寸或设备像素比变化时重新生成
async function refreshMapImages(cellSize) {
    const px = Math.round(cellSize * (window.devicePixelRatio || 1));
    if (px === mapImagePx) return;
    mapImagePx = px;
    const groups = [['.cell.square', gridOptions], ['.attachment-layer', attachOptions]];
    const rules = await Promise.all(groups.flatMap(([selector, options]) => options.map(async ([, file]) => {
        const url = await getScaledImage(`./img/${file}`, px, px);
        return url && `${selector}[style*="/${file}"] { background-image: url('${url}') !important; }`;
    })));
    if (px !== mapImagePx) return;   // 等待期间尺寸变化，交给新的一次生成
    mapImageStyle.textContent = rules.filter(Boolean).join('\n');
    if (!mapImageStyle.isConnected) document.head.appendChild(mapImageStyle);
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
