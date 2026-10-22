
// 使用教程：逐步高亮界面并介绍功能
// 教程在空白地图上进行，结束后恢复开始前的地图、撤销记录与视野
const TUTORIAL_PADDING = 6;        // 高亮区域外扩的像素
const TUTORIAL_MARGIN = 12;        // 说明卡片与屏幕边缘、高亮区域的间距
const TUTORIAL_TOP_SAFE = 110;     // 顶部按钮占用的高度，教程选取的格子避开这里
const TUTORIAL_DONE_DELAY = 700;   // 完成操作后停留片刻再进入下一步
// 说明卡片遮挡的代价（按面积）：可操作的高亮区域最不能挡，其次是菜单、弹窗与需要避开的区域，提示区域最后
const TUTORIAL_COVER_WEIGHT = { target: 1000, popup: 20, outline: 1 };
const TUTORIAL_POPUP_DELAY = 400;  // 菜单弹出片刻后说明卡片才避让：手机双击时第一下弹出的菜单不会让卡片移动到格子上
const TUTORIAL_MOVE_STEPS = 3;     // 移动玩家需要走的步数
const TUTORIAL_START_RATIO = 0.4;  // 第一个教学格子的横向位置：视野中央偏左
const TUTORIAL_KEEP_DISTANCE = 120;   // 换到下一步时，说明卡片离新的高亮区域不超过这个距离就留在原处
const TUTORIAL_PATH_SAMPLE = '↓↓[→沙沙]→(逃生)';   // 赛况快捷路径步骤预先填入的示例赛况

// 手机布局：与样式中显示方向按钮的断点一致
function isTutorialMobile() {
    return window.innerWidth <= 600;
}

// 底部方向按钮占用的高度
function tutorialBottomSafe() {
    return isTutorialMobile() ? 140 : 20;
}

// 电脑与手机使用不同的说明文字
function byLayout(desktop, mobile) {
    return () => isTutorialMobile() ? mobile : desktop;
}

function isSaveManagerOpen() {
    return document.getElementById('save-manager').style.display === 'flex';
}

/* ========== 教程步骤 ========== */
// 有 done 的步骤需要完成操作，完成后自动进入下一步；没有 done 的步骤只看说明，点击按钮继续
// targets 为高亮并可操作的区域（元素或屏幕矩形），outlines 为只作提示的虚线框，avoid 为说明卡片需要避开的区域
// block 为 false 时遮罩不拦截点击，dim 为 false 时不压暗；skipIf 成立时跳过该步；tick 每帧调用，处理步骤中的辅助操作
// aroundStart 为在起始格子附近操作的步骤，起始格子上方按其中最高的说明卡片留出位置
const TUTORIAL_STEPS = [
    {
        title: '欢迎使用漫漫长夜草稿本',
        text: '接下来将会一步步介绍草稿本的主要功能，按提示完成操作自动进入下一步。<br>教程将在一张空白地图上进行，结束后自动恢复现在的地图。',
        next: '开始',
        quit: '跳过教程',
    },
    {
        title: '设置地形',
        aroundStart: true,
        text: byLayout(
            '<b>左键点击</b>高亮的格子，在弹出的菜单中选择一种<b>地形</b>，例如「空地」或「树丛」。菜单右侧的<b>附着</b>可以放置按钮、箱子等物品。',
            '<b>点击</b>高亮的格子，在弹出的菜单中选择一种<b>地形</b>，例如「空地」或「树丛」。菜单右侧的<b>附着</b>可以放置按钮、箱子等物品。'),
        setup: t => {
            t.ctx.square = t.startSquare();
        },
        targets: t => [t.cellRect(t.ctx.square.i, t.ctx.square.j)],
        done: t => {
            const cell = t.cell(t.ctx.square.i, t.ctx.square.j);
            return !isUnknownTerrain(cell) || !!cell.querySelector('.attachment-layer');
        },
    },
    {
        title: '设置墙壁',
        aroundStart: true,
        text: '格子之间的细条是<b>墙壁</b>。<br>点击高亮的墙壁，选择一种墙壁类型，例如「普通」或「门」。',
        targets: t => [t.cellRect(t.ctx.square.i + 1, t.ctx.square.j)],
        done: t => {
            const wall = t.cell(t.ctx.square.i + 1, t.ctx.square.j);
            return getCurrentWallType(wall) !== '未知' || !!wall.querySelector('.attachment-layer');
        },
    },
    {
        title: '快速放置墙壁',
        aroundStart: true,
        text: '再次点击这面<b>墙壁</b>，点击墙壁菜单标题旁的 <kbd><b>+</b></kbd>，选择一种图案，可以一次设置虚线框中格子<b>四周</b>的墙壁。',
        setup: t => {
            const { i, j } = t.ctx.square;
            t.ctx.quickWall = { i: i + 1, j };
            const target = getQuickTargetSquare(t.cell(i + 1, j));   // 竖墙作用于右侧的格子
            t.ctx.quickSquare = { i: target.i, j: target.j };
        },
        // 依次高亮墙壁、菜单中的 +、快速放置的图案
        targets: t => {
            const panel = document.querySelector('.wall-quick-panel');
            if (panel) return [panel];
            const plus = document.querySelector('.selector .wall-quick-btn');
            if (plus) return [plus];
            return [t.cellRect(t.ctx.quickWall.i, t.ctx.quickWall.j)];
        },
        outlines: t => [t.cellRect(t.ctx.quickSquare.i, t.ctx.quickSquare.j)],
        done: t => {
            const { i, j } = t.ctx.quickSquare;
            return Object.values(WALL_SIDE_OFFSET).every(([di, dj]) => getCurrentWallType(t.cell(i + di, j + dj)) !== '未知');
        },
    },
    {
        title: '标记玩家',
        aroundStart: true,
        text: byLayout(
            '<b>右键点击</b>或<b>双击</b>高亮的格子打开标记菜单，选择 🧍 放置玩家。菜单中还可以标记 BOSS、星星和玩家编号。',
            '<b>双击</b>高亮的格子打开标记菜单，选择 🧍 放置玩家。菜单中还可以标记 BOSS、星星和玩家编号。'),
        targets: t => [t.cellRect(t.ctx.square.i, t.ctx.square.j)],
        done: () => !!window.trackManager?.hasPlayer(),
    },
    {
        title: '赛况快捷路径',
        aroundStart: true,
        text: byLayout(
            '<b>右键点击</b>玩家格子，点击「<b>赛况快捷路径</b>」，已填好示例赛况，点击「确定」画出路径和地形；平时粘贴游戏中的赛况即可。',
            '<b>双击</b>玩家格子，点击「<b>赛况快捷路径</b>」，已填好示例赛况，点击「确定」画出路径和地形；平时粘贴游戏中的赛况即可。'),
        setup: t => {
            t.ctx.pathCell = t.reveal(t.ensurePlayer());
            t.ctx.pathInputOpen = false;
            t.ctx.pathDrawn = false;
        },
        // 打开输入框时填入示例；输入框关闭后地图上多出已知格子即为画出了路径，点击外部关闭则继续等待
        tick: t => {
            const input = document.querySelector('.color-input-container input.path-input');
            if (input) {
                if (!t.ctx.pathInputOpen) {
                    t.ctx.pathInputOpen = true;
                    t.ctx.knownSquares = t.knownSquareCount();
                }
                if (!input.dataset.tutorialFilled) {
                    input.dataset.tutorialFilled = '1';
                    if (!input.value) input.value = TUTORIAL_PATH_SAMPLE;
                }
            } else if (t.ctx.pathInputOpen) {
                t.ctx.pathInputOpen = false;
                t.ctx.pathDrawn = t.knownSquareCount() > t.ctx.knownSquares;
            }
        },
        // 依次高亮格子、菜单中的赛况快捷路径、输入框
        targets: t => {
            const input = document.querySelector('.color-input-container input.path-input');
            if (input) return [input.closest('.color-input-container')];
            const btn = document.querySelector('.selector .path-btn');
            if (btn) return [btn];
            return [t.cellRect(+t.ctx.pathCell.dataset.i, +t.ctx.pathCell.dataset.j)];
        },
        // 示例赛况经过的范围：向下两格、向右两格
        outlines: t => {
            const i = +t.ctx.pathCell.dataset.i;
            const j = +t.ctx.pathCell.dataset.j;
            return [t.areaRect(i, j, i + 4, j + 4)];
        },
        done: t => t.ctx.pathDrawn,
    },
    {
        title: '移动玩家',
        aroundStart: true,
        text: byLayout(
            '按 <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> 或 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动玩家，经过的未知格子和墙壁会自动更新，例如门会被打开、同方向连续移动可以冲刺穿过树篱。',
            '点击屏幕下方的<b>方向按钮</b>移动玩家，经过的未知格子和墙壁会自动更新，例如门会被打开；同方向连续移动可以冲刺穿过树篱。'),
        setup: t => {
            t.reveal(t.ensurePlayer());
            t.ctx.moves = 0;
            t.watchPlayerMoves(() => t.ctx.moves++);
        },
        status: t => `已移动 ${Math.min(t.ctx.moves, TUTORIAL_MOVE_STEPS)} / ${TUTORIAL_MOVE_STEPS} 步`,
        targets: t => [t.playerRect(), t.directionRect()],
        done: t => t.ctx.moves >= TUTORIAL_MOVE_STEPS,
    },
    {
        title: '放置区块',
        text: byLayout(
            '点击格子角落高亮的<b>黑点</b>，从列表中选择一个游戏区块（鼠标悬停可查看名称），它会铺满虚线框中的 3×3 格子。列表顶部还可以放置<b>地图边框</b>。',
            '点击格子角落高亮的<b>黑点</b>，从列表中选择一个游戏区块，它会铺满虚线框中的 3×3 格子。列表顶部还可以放置<b>地图边框</b>。'),
        setup: t => {
            t.ctx.dot = t.findBlockDot();
            t.ctx.blockSignature = t.blockSignature();
        },
        targets: t => [t.cellRect(t.ctx.dot.i, t.ctx.dot.j)],
        outlines: t => [t.areaRect(t.ctx.dot.i, t.ctx.dot.j, t.ctx.dot.i + 6, t.ctx.dot.j + 6)],
        done: t => t.blockSignature() !== t.ctx.blockSignature,
    },
    {
        title: '拖动地图',
        text: byLayout(
            '地图从左上角开始向右下方延伸。按住地图<b>向左或向上拖动</b>，可以展开更多区域。',
            '地图从左上角开始向右下方延伸。用手指按住地图<b>向左或向上拖动</b>，可以展开更多区域。'),
        block: false,
        dim: false,
        placement: 'bottom',
        setup: t => {
            t.ctx.scroll = t.scrollInCells();
        },
        done: t => {
            const now = t.scrollInCells();
            return Math.hypot(now.x - t.ctx.scroll.x, now.y - t.ctx.scroll.y) >= 2;
        },
    },
    {
        title: '缩放地图',
        text: byLayout(
            '点击 <b>＋</b> / <b>－</b> 放大或缩小地图，也可以使用键盘 <kbd>+</kbd> / <kbd>-</kbd>。试着缩放一次。',
            '点击 <b>＋</b> / <b>－</b> 放大或缩小地图，试着缩放一次。'),
        setup: t => {
            t.ctx.zoom = zoomIndex;
        },
        targets: () => [document.getElementById('zoom-out-button'), document.getElementById('zoom-in-button')],
        done: t => zoomIndex !== t.ctx.zoom,
    },
    {
        title: '撤销',
        text: byLayout(
            '点击 <b>↶</b> 撤销上一步操作，也可以按 <kbd>Ctrl</kbd>+<kbd>Z</kbd>，最多可以撤销 50 步。',
            '点击 <b>↶</b> 撤销上一步操作，最多可以撤销 50 步。'),
        skipIf: () => window.historyManager.currentIndex <= 0,
        setup: t => {
            t.ctx.historyIndex = window.historyManager.currentIndex;
        },
        targets: () => [document.getElementById('undo-button')],
        done: t => window.historyManager.currentIndex < t.ctx.historyIndex,
    },
    {
        title: '重做',
        text: byLayout(
            '点击 <b>↷</b> 恢复刚才撤销的操作，也可以按 <kbd>Ctrl</kbd>+<kbd>Y</kbd>。',
            '点击 <b>↷</b> 恢复刚才撤销的操作。'),
        skipIf: () => window.historyManager.currentIndex >= window.historyManager.history.length - 1,
        setup: t => {
            t.ctx.historyIndex = window.historyManager.currentIndex;
        },
        targets: () => [document.getElementById('redo-button')],
        done: t => window.historyManager.currentIndex > t.ctx.historyIndex,
    },
    {
        title: '编辑模式',
        text: byLayout(
            '点击 <b>✂️</b> 进入<b>编辑模式</b>，也可以按 <kbd>M</kbd>。编辑模式中可以框选一片区域，整体移动、复制或删除。',
            '点击 <b>✂️</b> 进入<b>编辑模式</b>，可以框选一片区域，整体移动、复制或删除。'),
        targets: () => [document.getElementById('edit-mode-button')],
        done: () => window.editModeManager.isActive(),
    },
    {
        title: '框选区域',
        text: byLayout(
            '在地图上<b>按住鼠标拖动</b>，框选虚线框中刚才画的内容。',
            '在地图上<b>用手指拖动</b>，框选虚线框中刚才画的内容。'),
        block: false,
        dim: false,
        skipIf: () => !window.editModeManager.isActive(),
        setup: t => {
            // 拖动、缩放地图后内容可能已移出视野，框选时地图不能拖动，先滚回视野
            const c = t.ctx.content = t.contentBounds();
            if (c) t.revealArea(c.i0, c.j0, c.i1, c.j1);
        },
        outlines: t => {
            const c = t.ctx.content;
            return c ? [t.areaRect(c.i0, c.j0, c.i1, c.j1)] : [];
        },
        done: () => !window.editModeManager.isActive() || window.editModeManager.stage !== 'selecting',
        onSkip: () => window.editModeManager.exitMode(),
    },
    {
        title: '移动、复制或删除',
        text: byLayout(
            '点击「确认选区」，再点击地图上的目标位置预览，然后选择「确认并移动」或「确认并复制」，也可以「删除区域」。完成后自动退出编辑模式，按 <kbd>Esc</kbd> 可以逐步返回。',
            '点击「确认选区」，再点击地图上的目标位置预览，然后选择「确认并移动」或「确认并复制」，也可以「删除区域」。完成后自动退出编辑模式。'),
        block: false,
        dim: false,
        skipIf: () => !window.editModeManager.isActive(),
        targets: () => [window.editModeManager.confirmBar],
        // 说明卡片避开选区与目标位置的预览
        avoid: t => {
            const { selectedRange: range, previewDelta: delta } = window.editModeManager;
            if (!range) return [];
            const area = (di, dj) => t.areaRect(range.minI + di, range.minJ + dj, range.maxI + di, range.maxJ + dj);
            return delta ? [area(0, 0), area(delta.i, delta.j)] : [area(0, 0)];
        },
        done: () => !window.editModeManager.isActive(),
        onSkip: () => window.editModeManager.exitMode(),
    },
    {
        title: '轨迹记录',
        text: byLayout(
            '点击 <b>🏃</b> 开启<b>轨迹记录</b>，也可以按 <kbd>T</kbd>。开启后每一步移动都会被记录下来。',
            '点击 <b>🏃</b> 开启<b>轨迹记录</b>，开启后每一步移动都会被记录下来。'),
        setup: t => {
            t.reveal(t.ensurePlayer());
        },
        targets: () => [document.getElementById('track-button')],
        done: () => window.trackManager.isActive(),
    },
    {
        title: '导出轨迹',
        text: byLayout(
            '用方向键移动玩家几步，右上角会显示已记录的步数，然后点击「<b>导出轨迹</b>」。',
            '用方向按钮移动玩家几步，右上角会显示已记录的步数，然后点击「<b>导出轨迹</b>」。'),
        skipIf: () => !window.trackManager.isActive(),
        status: () => `已记录 ${window.trackManager.getRecordedSegments().reduce((sum, steps) => sum + steps.length, 0)} 步`,
        targets: t => [window.trackManager.panel, t.playerRect(), t.directionRect()],
        done: () => !!window.trackManager.exportPopup,
    },
    {
        title: '退出轨迹记录',
        text: byLayout(
            '导出的「上下左右」可以直接用于游戏中的多步行动，点击「复制」即可复制。最后再次点击 <b>🏃</b> 或按 <kbd>T</kbd> 退出轨迹记录。',
            '导出的「上下左右」可以直接用于游戏中的多步行动，点击「复制」即可复制。最后再次点击 <b>🏃</b> 退出轨迹记录。'),
        skipIf: () => !window.trackManager.isActive(),
        targets: () => [document.getElementById('track-button'), window.trackManager.exportPopup],
        done: () => !window.trackManager.isActive(),
    },
    {
        title: '清除标记',
        text: byLayout(
            '按住 <kbd>Shift</kbd> 再<b>右键点击</b>高亮的格子，可以一次清除格子上的所有标记；标记菜单中的「清除标记」效果相同。',
            '<b>双击</b>高亮的格子打开标记菜单，点击「清除标记」可以清除格子上的所有标记。'),
        setup: t => {
            t.ctx.markedCell = t.reveal(t.ensurePlayer());
        },
        targets: t => [t.cellRect(+t.ctx.markedCell.dataset.i, +t.ctx.markedCell.dataset.j)],
        done: t => !t.ctx.markedCell.querySelector('.marker'),
    },
    {
        title: '存档管理',
        text: byLayout(
            '刷新页面会重置草稿本。点击 <b>📁</b> 打开<b>存档管理</b>，也可以按 <kbd>C</kbd>，把地图保存在本地浏览器中。',
            '刷新页面会重置草稿本。点击 <b>📁</b> 打开<b>存档管理</b>，把地图保存在本地浏览器中。'),
        targets: () => [document.getElementById('save-button')],
        done: () => isSaveManagerOpen(),
    },
    {
        title: '保存与导入导出',
        text: '这里可以新建、加载、覆盖和删除存档。<br>「导出」会下载存档文件，「导入存档」可以读取文件，按住存档左侧的手柄可以拖动排序。教程中新建的存档会被保留。<br><b>点击右上角 × 关闭面板以继续</b>',
        skipIf: () => !isSaveManagerOpen(),
        targets: () => [document.getElementById('save-manager')],
        done: () => !isSaveManagerOpen(),
        onSkip: () => window.saveManager.hideSaveManager(),
    },
    {
        title: '随时查看帮助',
        text: byLayout(
            '点击 <b>?</b> 可以随时打开帮助，也可以按 <kbd>H</kbd>，在帮助中可以重新开始本教程。',
            '点击 <b>?</b> 可以随时打开帮助，在帮助中可以重新开始本教程。'),
        targets: () => [document.getElementById('help-button')],
        next: '下一步',
    },
    {
        title: '教程完成 🎉',
        text: '你已经了解了草稿本的主要功能。<br>点击「<b>进入草稿本</b>」开始使用，地图会恢复为教程开始前的状态。',
        next: '进入草稿本',
    },
];

/* ========== 矩形工具 ========== */
function padRect(r, p) {
    return { left: r.left - p, top: r.top - p, right: r.right + p, bottom: r.bottom + p };
}

function unionRect(a, b) {
    return {
        left: Math.min(a.left, b.left),
        top: Math.min(a.top, b.top),
        right: Math.max(a.right, b.right),
        bottom: Math.max(a.bottom, b.bottom),
    };
}

// 两个矩形之间的距离，相交时为 0
function rectGap(a, b) {
    const dx = Math.max(0, a.left - b.right, b.left - a.right);
    const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
    return Math.hypot(dx, dy);
}

function overlapArea(a, b) {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
}

// 相交或紧挨的高亮区域合并为一个，避免重叠处被遮罩重新盖住
function mergeRects(rects) {
    const merged = [];
    rects.forEach(rect => {
        let current = rect;
        for (let k = merged.length - 1; k >= 0; k--) {
            if (overlapArea(padRect(merged[k], 2), current) > 0) {
                current = unionRect(merged[k], current);
                merged.splice(k, 1);
            }
        }
        merged.push(current);
    });
    return merged;
}

// 圆角矩形路径，作为遮罩上的镂空
function roundedRectPath({ left, top, right, bottom }, radius) {
    const f = n => Math.round(n * 10) / 10;
    const r = f(Math.max(0, Math.min(radius, (right - left) / 2, (bottom - top) / 2)));
    return `M${f(left + r)},${f(top)}H${f(right - r)}A${r},${r} 0 0 1 ${f(right)},${f(top + r)}` +
        `V${f(bottom - r)}A${r},${r} 0 0 1 ${f(right - r)},${f(bottom)}` +
        `H${f(left + r)}A${r},${r} 0 0 1 ${f(left)},${f(bottom - r)}` +
        `V${f(top + r)}A${r},${r} 0 0 1 ${f(left + r)},${f(top)}Z`;
}

class TutorialManager {
    constructor(map) {
        this.map = map;
        this.active = false;
        this.index = -1;
        this.ctx = {};             // 步骤间共享的数据：选取的格子、步骤开始时的状态等
        this.saved = null;         // 教程开始前的地图、撤销记录与视野
        this.holes = [];           // 当前绘制的高亮区域，逐帧靠近目标
        this.completing = false;
        this.frame = 0;
        this.advanceTimer = null;
        this.observer = null;      // 统计玩家移动的页面监听
        this.drawn = { path: '', rings: '' };   // 上次写入页面的图形，未变化时不重复写入
        this.cardPos = null;
        this.cardStep = -1;                // 说明卡片当前位置是哪一步选定的
        this.popupSince = new WeakMap();   // 菜单与弹窗开始显示的时间

        this.init();
    }

    init() {
        document.getElementById('tutorial-start-button')?.addEventListener('click', () => this.start());
    }

    isActive() {
        return this.active;
    }

    get step() {
        return TUTORIAL_STEPS[this.index];
    }

    /* ========== 开始与结束 ========== */
    // 退出其他模式并关闭弹窗，保存当前地图后换成空白地图
    start() {
        if (this.active) return;
        this.closeOtherUI();
        document.getElementById('help-container').style.display = 'none';

        const history = window.historyManager;
        const { size, wall } = getCellMetrics();
        const container = this.map.container;
        this.saved = {
            snapshot: history.getStateSnapshot(),
            records: history.history,
            index: history.currentIndex,
            scroll: { x: container.scrollLeft / (size + wall), y: container.scrollTop / (size + wall) },
        };
        history.restoreState({ cells: new Map(), playerPosition: null, lastMoveDirection: null, subspaceSteps: 0, borders: [] });
        history.history = [];
        history.currentIndex = -1;
        history.saveState();

        this.active = true;
        this.ctx = {};
        this.shade = this.createShade();
        this.blocker = this.createBlocker();
        this.card = this.createCard();
        document.body.classList.add('tutorial-active');
        this.go(0);
        this.loop();
    }

    // 结束或中途退出：恢复教程开始前的地图、撤销记录与视野
    end() {
        if (!this.active) return;
        this.active = false;
        this.index = -1;
        cancelAnimationFrame(this.frame);
        clearTimeout(this.advanceTimer);
        this.stopWatching();
        this.closeOtherUI();

        // 移除全部教程元素，下次开始时重新创建
        document.body.classList.remove('tutorial-active');
        [this.shade, this.ringLayer, this.blocker, this.card].forEach(el => el?.remove());
        this.shade = this.ringLayer = this.blocker = this.card = null;
        this.holes = [];
        this.drawn = { path: '', rings: '' };
        this.cardPos = null;
        this.cardStep = -1;

        const history = window.historyManager;
        const { snapshot, records, index, scroll } = this.saved;
        history.restoreState(snapshot);
        history.history = records;
        history.currentIndex = index;
        history.updateButtons();

        const { size, wall } = getCellMetrics();
        this.map.container.scrollLeft = scroll.x * (size + wall);
        this.map.container.scrollTop = scroll.y * (size + wall);
        this.map.renderViewport();
        this.saved = null;
    }

    closeOtherUI() {
        window.trackManager?.exitMode();
        if (window.editModeManager?.isActive()) window.editModeManager.exitMode();
        removeAllSelectors();
        window.saveManager?.hideSaveManager();
        window.saveManager?.customAlert.hide();
    }

    /* ========== 步骤切换 ========== */
    go(index) {
        clearTimeout(this.advanceTimer);
        this.stopWatching();
        this.completing = false;
        while (index < TUTORIAL_STEPS.length && TUTORIAL_STEPS[index].skipIf?.(this)) index++;
        if (index >= TUTORIAL_STEPS.length) {
            this.end();
            return;
        }
        this.index = index;
        this.renderCard();          // 先换上这一步的说明，setup 中可以按说明卡片的尺寸选取位置
        this.step.setup?.(this);
        this.layout();              // 立即放好说明卡片，不在上一步的位置停留一帧
    }

    // 跳过当前步骤：关闭这一步打开的菜单
    skip() {
        removeAllSelectors();
        this.step.onSkip?.(this);
        this.go(this.index + 1);
    }

    complete() {
        this.completing = true;
        this.card.classList.add('done');
        this.shade.classList.add('done');
        this.ringLayer.classList.add('done');
        this.statusText.textContent = '✓ 完成';
        this.advanceTimer = setTimeout(() => this.go(this.index + 1), TUTORIAL_DONE_DELAY);
    }

    // 每帧检查操作是否完成，并让高亮与说明卡片跟随目标
    loop() {
        this.frame = requestAnimationFrame(() => this.loop());
        const step = this.step;
        if (!step) return;
        step.tick?.(this);
        if (step.done && !this.completing) {
            if (step.done(this)) this.complete();
            else if (step.status) this.setStatus(step.status(this));
        }
        this.layout();
    }

    setStatus(text) {
        if (this.statusText.textContent !== text) this.statusText.textContent = text;
    }

    // 玩家每走一步都会在新的格子放置标记：按新增的玩家标记计数，不依赖动画帧，快速连续移动也不会漏计
    watchPlayerMoves(onMove) {
        this.stopWatching();
        const isPlayerMarker = node => node.nodeType === Node.ELEMENT_NODE && node.matches('.marker[data-marker-type="player"]');
        this.observer = new MutationObserver(records => {
            records.forEach(record => record.addedNodes.forEach(node => {
                if (isPlayerMarker(node)) onMove();
            }));
        });
        this.observer.observe(this.map.container, { childList: true, subtree: true });
    }

    stopWatching() {
        this.observer?.disconnect();
        this.observer = null;
    }

    /* ========== 遮罩与说明卡片 ========== */
    // 遮罩：镂空处可以操作下方的界面，其余位置拦截点击；提示用的虚线框画在遮罩上
    // 可操作区域的高亮边框单独一层，显示在教程中打开的菜单之上，菜单里的按钮也能看到高亮
    createShade() {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.classList.add('tutorial-shade');
        this.shadeFill = document.createElementNS(SVG_NS, 'path');
        this.shadeFill.classList.add('tutorial-shade-fill');
        this.outlineGroup = document.createElementNS(SVG_NS, 'g');
        svg.appendChild(this.shadeFill);
        svg.appendChild(this.outlineGroup);
        this.blockPointer(this.shadeFill);
        document.body.appendChild(svg);

        this.ringLayer = document.createElementNS(SVG_NS, 'svg');
        this.ringLayer.classList.add('tutorial-rings');
        this.ringGroup = document.createElementNS(SVG_NS, 'g');
        this.ringLayer.appendChild(this.ringGroup);
        document.body.appendChild(this.ringLayer);
        return svg;
    }

    // 只看说明的步骤拦截全部点击
    createBlocker() {
        const blocker = document.createElement('div');
        blocker.className = 'tutorial-blocker';
        this.blockPointer(blocker);
        document.body.appendChild(blocker);
        return blocker;
    }

    // 点到被拦截的位置时晃动说明卡片，提示按说明操作
    blockPointer(el) {
        const nudge = e => {
            e.preventDefault();
            this.nudge();
        };
        el.addEventListener('mousedown', nudge);
        el.addEventListener('touchstart', nudge, { passive: false });
        el.addEventListener('contextmenu', e => e.preventDefault());
    }

    nudge() {
        this.card.classList.remove('nudge', 'enter');
        void this.card.offsetWidth;   // 重新触发动画
        this.card.classList.add('nudge');
    }

    createCard() {
        const card = document.createElement('div');
        card.className = 'tutorial-card';
        card.innerHTML = `
            <div class="tutorial-card-head">
                <span class="tutorial-step-count"></span>
                <button type="button" class="tutorial-quit-btn">退出教程</button>
            </div>
            <div class="tutorial-progress"><div class="tutorial-progress-bar"></div></div>
            <div class="tutorial-title"></div>
            <div class="tutorial-text"></div>
            <div class="tutorial-status"></div>
            <div class="tutorial-actions"></div>
        `;
        this.countText = card.querySelector('.tutorial-step-count');
        this.quitButton = card.querySelector('.tutorial-quit-btn');
        this.progressBar = card.querySelector('.tutorial-progress-bar');
        this.titleText = card.querySelector('.tutorial-title');
        this.bodyText = card.querySelector('.tutorial-text');
        this.statusText = card.querySelector('.tutorial-status');
        this.actions = card.querySelector('.tutorial-actions');
        this.quitButton.onclick = () => this.end();

        document.body.appendChild(card);
        return card;
    }

    renderCard() {
        const step = this.step;
        const total = TUTORIAL_STEPS.length;
        const needsAction = !!step.done;

        this.countText.textContent = `使用教程 ${this.index + 1} / ${total}`;
        this.progressBar.style.width = `${(this.index + 1) / total * 100}%`;
        this.titleText.textContent = step.title;
        this.bodyText.innerHTML = typeof step.text === 'function' ? step.text(this) : step.text;
        this.quitButton.hidden = this.index === total - 1;
        this.statusText.hidden = !needsAction;
        this.statusText.textContent = '完成操作后自动进入下一步';

        this.actions.innerHTML = '';
        const addButton = (label, className, onClick) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = className;
            btn.textContent = label;
            btn.onclick = onClick;
            this.actions.appendChild(btn);
        };
        if (needsAction) {
            addButton('跳过此步', 'secondary', () => this.skip());
        } else {
            if (step.quit) addButton(step.quit, 'secondary', () => this.end());
            addButton(step.next, 'primary', () => this.go(this.index + 1));
        }

        this.card.classList.remove('done', 'enter', 'nudge');
        void this.card.offsetWidth;   // 重新触发进入动画
        this.card.classList.add('enter');
        this.shade.classList.remove('done');
        this.ringLayer.classList.remove('done');
        this.shade.classList.toggle('clear', step.dim === false);
        this.shadeFill.style.pointerEvents = step.block === false ? 'none' : '';
        this.blocker.classList.toggle('show', !needsAction);
    }

    layout() {
        const step = this.step;
        const W = window.innerWidth;
        const H = window.innerHeight;
        const targets = mergeRects(this.resolveRects(step.targets).map(r => padRect(r, TUTORIAL_PADDING)));
        const outlines = this.resolveRects(step.outlines).map(r => padRect(r, 3));
        this.animateHoles(targets, W, H);

        const path = `M0,0H${W}V${H}H0Z${this.holes.map(r => roundedRectPath(r, 8)).join('')}`;
        if (path !== this.drawn.path) {
            this.shadeFill.setAttribute('d', path);
            this.drawn.path = path;
        }
        this.drawRings([
            ...this.holes.map(r => ({ r, outline: false })),
            ...outlines.map(r => ({ r, outline: true })),
        ]);
        this.placeCard(targets, outlines, [...this.popupRects(), ...this.resolveRects(step.avoid)]);
    }

    // 元素或屏幕矩形统一为矩形，隐藏的元素不计入
    resolveRects(getTargets) {
        return (getTargets?.(this) || []).filter(Boolean)
            .map(target => target instanceof Element ? target.getBoundingClientRect() : target)
            .filter(r => r.right > r.left && r.bottom > r.top)
            .map(({ left, top, right, bottom }) => ({ left, top, right, bottom }));
    }

    // 高亮区域逐帧靠近目标；数量变化时新的高亮从整个屏幕收拢到目标
    animateHoles(targets, W, H) {
        if (targets.length !== this.holes.length) {
            this.holes = targets.map(() => ({ left: 0, top: 0, right: W, bottom: H }));
        }
        this.holes.forEach((hole, k) => {
            ['left', 'top', 'right', 'bottom'].forEach(side => {
                const diff = targets[k][side] - hole[side];
                hole[side] = Math.abs(diff) < 0.5 ? targets[k][side] : hole[side] + diff * 0.3;
            });
        });
    }

    // 高亮边框：可操作的区域为实线，提示区域为虚线
    drawRings(list) {
        const key = list.map(({ r, outline }) =>
            `${outline ? 'o' : 'h'}${[r.left, r.top, r.right, r.bottom].map(Math.round).join(',')}`).join(';');
        if (key === this.drawn.rings) return;
        this.drawn.rings = key;

        const fill = (group, rects, className) => {
            while (group.children.length > rects.length) group.lastChild.remove();
            while (group.children.length < rects.length) group.appendChild(document.createElementNS(SVG_NS, 'rect'));
            rects.forEach((r, k) => {
                const rect = group.children[k];
                rect.setAttribute('class', className);
                rect.setAttribute('x', Math.round(r.left));
                rect.setAttribute('y', Math.round(r.top));
                rect.setAttribute('width', Math.max(0, Math.round(r.right - r.left)));
                rect.setAttribute('height', Math.max(0, Math.round(r.bottom - r.top)));
                rect.setAttribute('rx', 8);
            });
        };
        fill(this.ringGroup, list.filter(item => !item.outline).map(item => item.r), 'tutorial-ring');
        fill(this.outlineGroup, list.filter(item => item.outline).map(item => item.r), 'tutorial-ring outline');
    }

    // 打开的菜单与弹窗，说明卡片避开它们，刚弹出的先不避让
    popupRects() {
        const now = performance.now();
        const rects = [];
        document.querySelectorAll('.selector, .color-input-container, #save-manager, #custom-alert').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) {
                this.popupSince.delete(el);
                return;
            }
            if (!this.popupSince.has(el)) this.popupSince.set(el, now);
            if (now - this.popupSince.get(el) >= TUTORIAL_POPUP_DELAY) rects.push(r);
        });
        return rects;
    }

    // 说明卡片依次尝试放在全部高亮区域、各个高亮区域与弹窗的上、左、下、右，以及屏幕底部、顶部与四角，按遮挡代价选最小的位置
    // 菜单多在点击处的右下方弹出，先试上方与左侧，弹出菜单时卡片不必移动
    placeCard(targets, outlines, others) {
        const card = this.card;
        const W = window.innerWidth;
        const H = window.innerHeight;
        const m = TUTORIAL_MARGIN;
        const cw = card.offsetWidth;
        const ch = card.offsetHeight;
        const rectAt = pos => ({ left: pos.left, top: pos.top, right: pos.left + cw, bottom: pos.top + ch });
        const isOutside = rect => rect.left < m - 1 || rect.top < m - 1 || rect.right > W - m + 1 || rect.bottom > H - m + 1;
        const focus = [...targets, ...outlines];

        // 操作过程中说明卡片尽量不动：同一步内只在挡住可操作区域或弹窗时移动；
        // 换到下一步时，原位置不挡任何区域且离新的高亮区域不远就留在原处
        const pos = this.cardPos;
        const current = pos && rectAt({ left: pos.left, top: pos.anchorBottom ? pos.bottom - ch : pos.top });
        if (current && !isOutside(current) && ![...targets, ...others].some(r => overlapArea(current, r) > 0)) {
            const nearby = pos.focused && focus.length > 0 && !outlines.some(r => overlapArea(current, r) > 0) &&
                rectGap(current, focus.reduce(unionRect)) <= TUTORIAL_KEEP_DISTANCE;
            if (this.cardStep === this.index || nearby) {
                this.cardStep = this.index;
                this.setCardPos(current.left, current.top, pos.anchorBottom, pos.focused);
                return;
            }
        }
        const stepChanged = this.cardStep !== this.index;
        this.cardStep = this.index;

        const clampX = x => Math.max(m, Math.min(W - cw - m, x));
        const clampY = y => Math.max(m, Math.min(H - ch - m, y));
        const bottom = { left: clampX((W - cw) / 2), top: H - ch - m };
        const top = { left: clampX((W - cw) / 2), top: m };

        const around = r => {
            const x = clampX((r.left + r.right - cw) / 2);
            const y = clampY((r.top + r.bottom - ch) / 2);
            return [
                { left: x, top: r.top - m - ch },
                { left: r.left - m - cw, top: y },
                { left: x, top: r.bottom + m },
                { left: r.right + m, top: y },
            ];
        };
        const corners = [
            { left: m, top: m },
            { left: W - cw - m, top: m },
            { left: m, top: H - ch - m },
            { left: W - cw - m, top: H - ch - m },
        ];

        let candidates;
        if (focus.length) {
            // 围绕整体的位置都放不下时，尝试各个区域与弹窗旁边
            const each = focus.length > 1 ? focus.flatMap(around) : [];
            candidates = [...around(focus.reduce(unionRect)), ...each, ...others.flatMap(around), bottom, top, ...corners];
        } else if (this.step.placement === 'bottom') {
            candidates = [bottom, top];
        } else {
            candidates = [{ left: clampX((W - cw) / 2), top: clampY((H - ch) / 2) }, bottom, top];
        }

        const { target, popup, outline } = TUTORIAL_COVER_WEIGHT;
        const avoid = [
            ...targets.map(r => [r, target]),
            ...others.map(r => [r, popup]),
            ...outlines.map(r => [r, outline]),
        ];
        let best = null;
        candidates.forEach(pos => {
            const rect = rectAt(pos);
            const score = (isOutside(rect) ? 1e12 : 0) + avoid.reduce((sum, [r, weight]) => sum + overlapArea(rect, r) * weight, 0);
            if (!best || score < best.score) best = { ...pos, score };
        });

        const above = focus.length > 0 && best.top + ch <= focus.reduce(unionRect).top;
        // 换到新的一步时直接出现在新位置，同一步内避让时平滑移动
        this.setCardPos(best.left, best.top, above, focus.length > 0, !stepChanged);
    }

    // anchorBottom：放在高亮区域上方，按下边缘对齐；focused：位置是围绕高亮区域选的
    setCardPos(left, top, anchorBottom, focused, animate = true) {
        const card = this.card;
        left = Math.round(left);
        top = Math.round(top);
        if (left !== this.cardPos?.left || top !== this.cardPos?.top) {
            if (!animate) card.classList.remove('placed');
            card.style.left = left + 'px';
            card.style.top = top + 'px';
            if (!animate) {
                void card.offsetWidth;   // 先定位再恢复过渡，不播放移动动画
                card.classList.add('placed');
            }
        }
        this.cardPos = { left, top, bottom: top + card.offsetHeight, anchorBottom, focused };
    }

    /* ========== 地图坐标工具 ========== */
    cell(i, j) {
        const { size, wall } = getCellMetrics();
        return this.map.ensureCell(i, j, size, wall);
    }

    // 地图坐标 (i0, j0) ~ (i1, j1) 在屏幕上的矩形（含两端的格子或墙壁，定位方式同 ensureCell）
    areaRect(i0, j0, i1, j1) {
        const { size, wall } = getCellMetrics();
        const base = size + wall;
        const start = n => Math.floor(n / 2) * base + (n % 2) * size;
        const end = n => start(n) + (n % 2 ? wall : size);
        const container = this.map.container;
        const box = container.getBoundingClientRect();
        return {
            left: box.left + start(i0) - container.scrollLeft,
            top: box.top + start(j0) - container.scrollTop,
            right: box.left + end(i1) - container.scrollLeft,
            bottom: box.top + end(j1) - container.scrollTop,
        };
    }

    cellRect(i, j) {
        return this.areaRect(i, j, i, j);
    }

    playerRect() {
        const cell = window.playerCell;
        return cell ? this.cellRect(+cell.dataset.i, +cell.dataset.j) : null;
    }

    // 手机上的方向按钮
    directionRect() {
        if (!isTutorialMobile()) return null;
        const rects = [...document.querySelectorAll('.direction-btn')]
            .map(btn => btn.getBoundingClientRect())
            .filter(r => r.width > 0);
        return rects.length ? rects.reduce(unionRect) : null;
    }

    // 视野中央（避开顶部按钮与底部方向按钮）的格子
    centerSquare() {
        const { size, wall } = getCellMetrics();
        const base = size + wall;
        const container = this.map.container;
        const x = container.scrollLeft + container.clientWidth / 2;
        const y = container.scrollTop + (TUTORIAL_TOP_SAFE + container.clientHeight - tutorialBottomSafe()) / 2;
        return { i: Math.floor(x / base) * 2, j: Math.floor(y / base) * 2 };
    }

    // 起始格子：横向在视野中央偏左；纵向尽量靠上，上方刚好放说明卡片
    startSquare() {
        const { size, wall } = getCellMetrics();
        const base = size + wall;
        const container = this.map.container;
        const box = container.getBoundingClientRect();
        const cardHeight = Math.max(...TUTORIAL_STEPS.filter(s => s.aroundStart).map(s => this.cardHeightFor(s)));
        const top = Math.max(TUTORIAL_TOP_SAFE, this.cardSpace(cardHeight));   // 格子上边缘在屏幕上的最高位置
        const x = container.scrollLeft + container.clientWidth * TUTORIAL_START_RATIO;
        const y = container.scrollTop + top - box.top;
        return { i: Math.floor(x / base) * 2, j: Math.ceil(y / base) * 2 };
    }

    // 说明卡片放在高亮区域上方需要的高度
    cardSpace(cardHeight = this.card.offsetHeight) {
        return cardHeight + 2 * TUTORIAL_MARGIN + TUTORIAL_PADDING;
    }

    // 说明卡片显示某一步的说明时的高度
    cardHeightFor(step) {
        const title = this.titleText.textContent;
        const html = this.bodyText.innerHTML;
        this.titleText.textContent = step.title;
        this.bodyText.innerHTML = typeof step.text === 'function' ? step.text(this) : step.text;
        const height = this.card.offsetHeight;
        this.titleText.textContent = title;
        this.bodyText.innerHTML = html;
        return height;
    }

    // 菜单从点击处向下展开的最大高度：样式中随屏幕高度设置，另加内边距与边框，手机上菜单还会整体下移几像素
    selectorMaxHeight() {
        const probe = document.createElement('div');
        probe.className = 'selector';
        probe.style.visibility = 'hidden';
        document.body.appendChild(probe);
        const cs = getComputedStyle(probe);
        const extra = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((sum, k) => sum + (parseFloat(cs[k]) || 0), 0);
        const shift = cs.transform && cs.transform !== 'none' ? Math.max(0, new DOMMatrixReadOnly(cs.transform).m42) : 0;
        const max = (parseFloat(cs.maxHeight) || window.innerHeight * 0.7) + extra + shift;
        probe.remove();
        return max;
    }

    // 以格子为单位的滚动位置
    scrollInCells() {
        const { size, wall } = getCellMetrics();
        const container = this.map.container;
        return { x: container.scrollLeft / (size + wall), y: container.scrollTop / (size + wall) };
    }

    // 格子不在视野内时滚动地图，让它位于视野中央
    reveal(cell) {
        this.revealArea(+cell.dataset.i, +cell.dataset.j, +cell.dataset.i, +cell.dataset.j);
        return cell;
    }

    // 区域不完全在视野内时滚动地图，让它位于视野中央（避开顶部按钮与底部方向按钮）
    revealArea(i0, j0, i1, j1) {
        const r = this.areaRect(i0, j0, i1, j1);
        const W = window.innerWidth;
        const H = window.innerHeight;
        const bottom = H - tutorialBottomSafe();
        const inView = r.left >= TUTORIAL_MARGIN && r.right <= W - TUTORIAL_MARGIN &&
            r.top >= TUTORIAL_TOP_SAFE && r.bottom <= bottom;
        if (!inView) {
            const container = this.map.container;
            container.scrollLeft += (r.left + r.right - W) / 2;
            container.scrollTop += (r.top + r.bottom - TUTORIAL_TOP_SAFE - bottom) / 2;
            this.map.renderViewport();
        }
    }

    // 后续步骤需要玩家：没有时在视野中央放置一个
    ensurePlayer() {
        if (window.trackManager?.hasPlayer()) return window.playerCell;
        const { i, j } = this.centerSquare();
        const cell = this.cell(i, j);
        addMarker(cell, '🧍', 'black');
        window.playerCell = cell;
        resetPlayerMoveHistory();
        window.historyManager.saveState();
        return cell;
    }

    // 范围内的格子与墙壁是否都为初始状态
    isBlankArea(i0, j0, i1, j1) {
        for (let i = i0; i <= i1; i++) {
            for (let j = j0; j <= j1; j++) {
                const cell = this.map.cells.get(`${i},${j}`);
                if (cell && !cell.classList.contains('center') && !this.map.isInitialCell(cell)) return false;
            }
        }
        return true;
    }

    // 放置区块的黑点：右下方 3×3 区域全空且在视野内，先比较区块列表高度（尽量靠上，让列表完整显示），再取离前面操作的格子近的（同样距离取靠上的）
    findBlockDot() {
        const { wall } = getCellMetrics();
        const { i: ci, j: cj } = this.ctx.square || this.centerSquare();
        const W = window.innerWidth;
        const H = window.innerHeight;
        const listHeight = this.selectorMaxHeight();
        const cardSpace = this.cardSpace();
        const better = (a, b) => {
            for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k];
            return false;
        };
        let best = null;
        for (let a = -8; a <= 8; a++) {
            for (let b = -8; b <= 8; b++) {
                const i = ci + 2 * a - 1;
                const j = cj + 2 * b - 1;
                if (i < 1 || j < 1) continue;
                const r = this.areaRect(i, j, i + 6, j + 6);
                if (r.left < TUTORIAL_MARGIN || r.right > W - TUTORIAL_MARGIN ||
                    r.top < TUTORIAL_TOP_SAFE || r.bottom > H - tutorialBottomSafe()) continue;
                if (!this.isBlankArea(i, j, i + 6, j + 6)) continue;
                // 点击黑点后列表从点击处向下展开，放不下时会被缩短（同 adjustElementPosition）
                // 手机上列表旁放不下说明卡片，卡片放不进区域上方时会盖住列表下部
                const overflow = Math.max(0, r.top + wall / 2 + listHeight - (H - 10));
                const covered = r.top >= cardSpace || !isTutorialMobile() ? 0 : this.card.offsetHeight;
                const key = [Math.round(overflow + covered), a * a + b * b + Math.max(0, b)];
                if (!best || better(key, best.key)) best = { i, j, key };
            }
        }
        return best || { i: ci + 1, j: cj + 1 };
    }

    // 地形已知的格子数量
    knownSquareCount() {
        let count = 0;
        this.map.cells.forEach(cell => {
            if (cell.dataset.type === 'square' && !isUnknownTerrain(cell)) count++;
        });
        return count;
    }

    // 区块区域的地形与边框数量：放置区块、清除区块或放置边框后会变化
    blockSignature() {
        const { i, j } = this.ctx.dot;
        const parts = [window.borderManager?.list().length ?? 0];
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                const cell = this.map.cells.get(`${i + 2 * x + 1},${j + 2 * y + 1}`);
                parts.push(cell ? `${cell.style.backgroundImage}${cell.style.backgroundColor}` : '');
            }
        }
        return parts.join('|');
    }

    // 地图上已有内容（非初始状态的格子与墙壁）的范围
    contentBounds() {
        let bounds = null;
        this.map.cells.forEach(cell => {
            if (cell.classList.contains('center') || this.map.isInitialCell(cell)) return;
            const i = +cell.dataset.i;
            const j = +cell.dataset.j;
            bounds = bounds
                ? { i0: Math.min(bounds.i0, i), j0: Math.min(bounds.j0, j), i1: Math.max(bounds.i1, i), j1: Math.max(bounds.j1, j) }
                : { i0: i, j0: j, i1: i, j1: j };
        });
        return bounds;
    }
}
