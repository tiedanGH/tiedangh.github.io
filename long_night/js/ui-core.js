
const gridOptions = [
    ['空地', 'empty.png'],
    ['树丛', 'grass.png'],
    ['水洼', 'water.png'],
    ['传送门', 'portal.png'],
    ['陷阱', 'trap.png'],
    ['热源', 'heat.png'],
    ['逃生舱', 'exit.png'],
    ['未知', 'unknown.png'],
];
const attachOptions = [
    ['按钮', 'button.png'],
    ['炸弹', 'bomb.png'],
    ['箱子', 'box.png'],
    ['无', 'transparent.png'],
];
const wallOptions = [
    ['空', 'walls/empty_row.png', 'walls/empty_col.png', '#FFFFFF'],
    ['普通', 'walls/wall_row.png', 'walls/wall_col.png', '#000000'],
    ['门', 'walls/door_row.png', 'walls/door_col.png', '#EA68A2'],
    ['门 (开)', 'walls/dooropen_row.png', 'walls/dooropen_col.png', '#F8CDE1'],
    ['未知', 'walls/unknown_row.png', 'walls/unknown_col.png', '#D9D9D9'],
];

const num = ["⓪","①","②","③","④","⑤","⑥","⑦","⑧","⑨"];

const markerEmojis = [
    { emoji: '🧍', color: 'black', name: '玩家' },
    { emoji: '👹', color: 'orange', name: '米诺陶斯' },
    { emoji: '💣', color: 'black', name: '邦邦' },
    { emoji: '★', color: 'red', name: '星星' },
];
// 不允许重复的标记类型
const MARKER_TYPE = {
    '🧍': 'player',
    '👹': 'minotaur',
    '💣': 'bangbang',
};

// 玩家移动相关
let currentMap = null;

function uiCellEvents(map) {
    currentMap = map; // 保存地图引用

    map.container.addEventListener('contextmenu', e => e.preventDefault());

    // 移动端双击支持
    let lastClickTime = 0;
    map.container.addEventListener('click', e => {
        if (window.moveEditModeManager?.isActive()) return;
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
                }
            });
        }
        lastClickTime = now;
    });

    // 右键：标记玩家 / 清空标记
    map.container.addEventListener('mousedown', e => {
        if (window.moveEditModeManager?.isActive()) return;
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
            }
        });
    });

    // 左键：设置方块 / 墙
    map.container.addEventListener('mousedown', e => {
        if (window.moveEditModeManager?.isActive()) return;
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
