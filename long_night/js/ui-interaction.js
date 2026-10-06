
function setAttachment(cell, imgFile) {
    const layer = getAttachmentLayer(cell);
    layer.style.backgroundColor = '';
    layer.style.backgroundImage = imgFile
        ? `url('./img/${imgFile}')`
        : '';
}

function getAttachmentLayer(cell) {
    let layer = cell.querySelector('.attachment-layer');
    if (!layer) {
        layer = document.createElement('div');
        cell.appendChild(layer);
    }
    layer.className = 'attachment-layer';
    layer.textContent = '';   // 清除可能残留的自定义文本
    return layer;
}

// 设置自定义文本附着（空文本则清除附着）
function setCustomTextAttachment(cell, text) {
    const value = (text ?? '').trim();
    if (!value) {
        clearAttachment(cell);
        return;
    }
    const layer = getAttachmentLayer(cell);
    layer.classList.add('custom-attach-text');
    layer.style.backgroundImage = 'none';
    layer.style.backgroundColor = '';
    layer.textContent = value;
}

// 读取单元格当前的自定义文本（用于编辑时回填）
function getCurrentAttachText(cell) {
    const layer = cell?.querySelector('.attachment-layer.custom-attach-text');
    return layer ? layer.textContent : '';
}

function getMarkerContainer(cell) {
    let ctr = cell.querySelector('.marker-container');
    if (ctr) return ctr;
    ctr = document.createElement('div');
    ctr.className = 'marker-container';
    cell.appendChild(ctr);
    return ctr;
}

// 根据格子的地形和附着获取特殊颜色（附着 > 地形）
function getGroundSpecialColor(cell) {
    if (!cell || cell.dataset.type !== 'square') return null;

    const getFileName = bg =>
        bg?.includes('none')
            ? null
            : bg?.match(/\/([^\/]+\.(png|jpg|jpeg))/)?.[1] ?? null;
    const isTarget = (fileName, options, target) =>
        fileName && options.find(([, file]) => file === fileName)?.[0] === target;

    // 检查附着
    const attachLayer = cell.querySelector('.attachment-layer');
    if (attachLayer && !attachLayer.classList.contains('custom-attach-circle')) {
        const fileName = getFileName(attachLayer.style.backgroundImage);
        if (isTarget(fileName, attachOptions, '炸弹')) return '#FFFF00';
    }
    // 检查地形
    const fileName = getFileName(cell.style.backgroundImage);
    if (isTarget(fileName, gridOptions, '传送门')) return '#FFFF00';

    return null;
}

// 刷新指定格子内所有标记的颜色
function refreshMarkerColors(cell) {
    if (!cell || cell.dataset.type !== 'square') return;
    const markers = cell.querySelectorAll('.marker');
    markers.forEach(marker => {
        const text = marker.textContent;
        if (num.includes(text)) {
            marker.style.color = getGroundSpecialColor(cell) || 'black';
        }
    });
}

function getAttachmentFileName(cell) {
    const layer = cell?.querySelector('.attachment-layer');
    if (!layer || layer.classList.contains('custom-attach-circle')) return null;
    const bg = layer.style.backgroundImage;
    if (!bg || bg === 'none') return null;
    return bg.match(/\/([^\/]+\.(png|jpg|jpeg))/)?.[1] ?? null;
}

function getAttachmentType(cell) {
    const fileName = getAttachmentFileName(cell);
    if (!fileName) return null;
    return attachOptions.find(([, file]) => file === fileName)?.[0] ?? null;
}

function isPushableBoxAttachment(cell) {
    const type = getAttachmentType(cell);
    return !!type && pushableTypes.includes(type);
}

function clearAttachment(cell) {
    cell?.querySelectorAll('.attachment-layer').forEach(layer => layer.remove());
}

function ensureKnownSquare(square) {
    if (!square || square.dataset.type !== 'square') return;
    const currentBg = square.style.backgroundImage;
    const isUnknown = !currentBg || currentBg.includes('unknown.png');
    if (isUnknown) {
        square.style.backgroundImage = `url('./img/empty.png')`;
    }
}

function canBoxMoveTo(direction, fromI, fromJ, size, wall) {
    let boxTargetI = fromI;
    let boxTargetJ = fromJ;
    let boxWallI = fromI;
    let boxWallJ = fromJ;

    switch(direction) {
        case 'up':
            boxTargetJ -= 2;
            boxWallJ = fromJ - 1;
            break;
        case 'down':
            boxTargetJ += 2;
            boxWallJ = fromJ + 1;
            break;
        case 'left':
            boxTargetI -= 2;
            boxWallI = fromI - 1;
            break;
        case 'right':
            boxTargetI += 2;
            boxWallI = fromI + 1;
            break;
    }

    currentMap.ensureCell(boxTargetI, boxTargetJ, size, wall);
    currentMap.ensureCell(boxWallI, boxWallJ, size, wall);

    const boxTargetSquare = currentMap.cells.get(`${boxTargetI},${boxTargetJ}`);
    const boxWallCell = currentMap.cells.get(`${boxWallI},${boxWallJ}`);

    if (!boxTargetSquare || boxTargetSquare.dataset.type !== 'square') {
        return { movable: false, boxTargetSquare: null, boxWallCell: null };
    }

    if (boxWallCell?.dataset.type === 'wall') {
        const boxWallType = getCurrentWallType(boxWallCell);
        const isBlockedWall = blockingWallTypes.includes(boxWallType);

        if (isBlockedWall) {
            return { movable: false, boxTargetSquare, boxWallCell };
        }
    }

    const hasOtherAttachment = !!getAttachmentType(boxTargetSquare);
    if (hasOtherAttachment) {
        return { movable: false, boxTargetSquare, boxWallCell };
    }

    return { movable: true, boxTargetSquare, boxWallCell };
}

// 输入框内的按键不触发地图快捷键
function isTypingTarget(target) {
    const tag = target?.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || !!target?.isContentEditable;
}

function initKeyboardControls() {
    const keyMap = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right'
    };

    document.addEventListener('keydown', (e) => {
        if (!window.playerCell || isTypingTarget(e.target)) return;

        const direction = keyMap[e.key];

        if (!direction) return;

        e.preventDefault();
        movePlayer(direction);
    });
}

function initMobileDirectionControls() {
    const directionBtns = document.querySelectorAll('.direction-btn');

    directionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const direction = btn.dataset.direction;
            movePlayer(direction);
        });

        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const direction = btn.dataset.direction;
            movePlayer(direction);
        }, { passive: false });
    });
}

// [树篱] 冲刺判定：上一次移动的方向，重新放置玩家后清空
let lastMoveDirection = null;
// [亚空间] 进入区块传送门后的剩余步数，0 为不在亚空间
let subspaceSteps = 0;

function resetPlayerMoveHistory() {
    lastMoveDirection = null;
    subspaceSteps = 0;
    renderSubspaceBadge();
    window.trackManager?.resetStart();   // [轨迹记录] 从新位置重新记录
}

function getPlayerMoveDirection() {
    return lastMoveDirection;
}

function setPlayerMoveDirection(direction) {
    lastMoveDirection = direction || null;
}

function getPlayerSubspace() {
    return subspaceSteps;
}

function setPlayerSubspace(steps) {
    subspaceSteps = steps || 0;
}

/* ========== 区块交互：传送门与按钮门 ========== */
// 仅放置区块时写入，以相对地图坐标存于格子：portalTo 为 [di, dj]，buttonDoors 为 [[di, dj], ...]（墙格）
function getBlockBinding(cell) {
    const { portalTo, buttonDoors } = cell.dataset;
    return portalTo || buttonDoors ? { portalTo, buttonDoors } : null;
}

function setBlockBinding(cell, binding) {
    delete cell.dataset.portalTo;
    delete cell.dataset.buttonDoors;
    if (binding?.portalTo) cell.dataset.portalTo = binding.portalTo;
    if (binding?.buttonDoors) cell.dataset.buttonDoors = binding.buttonDoors;
}

// 手动修改地形 / 附着后，该格不再具备区块交互功能
function clearBlockBinding(cell, groupType) {
    if (groupType === 'grid') delete cell.dataset.portalTo;
    else if (groupType === 'attach') delete cell.dataset.buttonDoors;
}

function parseBindingOffsets(value) {
    try {
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
}

function getTerrainType(cell) {
    const fileName = cell.style.backgroundImage.match(/\/([^\/]+\.png)/)?.[1];
    return gridOptions.find(([, file]) => file === fileName)?.[0] ?? null;
}

function getRelativeCell(cell, [di, dj]) {
    const i = parseInt(cell.dataset.i, 10) + di;
    const j = parseInt(cell.dataset.j, 10) + dj;
    const { size, wall } = getCellMetrics();
    currentMap.ensureCell(i, j, size, wall);
    return currentMap.cells.get(`${i},${j}`);
}

// [按钮] 按下区块按钮：逐个切换关联的门，不是门的位置无事发生
function pressBlockButton(cell) {
    if (getAttachmentType(cell) !== '按钮') return;
    (parseBindingOffsets(cell.dataset.buttonDoors) || []).forEach(offset => {
        const wallCell = getRelativeCell(cell, offset);
        if (wallCell?.dataset.type !== 'wall') return;
        const type = getCurrentWallType(wallCell);
        const next = type === '门' ? '门 (开)' : type === '门 (开)' ? '门' : null;
        if (!next) return;
        const orientation = wallCell.classList.contains('horizontal') ? 'horizontal' : 'vertical';
        wallCell.style.backgroundColor = '';
        wallCell.style.backgroundImage = `url('${getWallImage(next, orientation)}')`;
    });
}

// [传送门] 传送到绑定的目标格：目标不是传送门也传送；落点的按钮会被按下，但不会再次进入亚空间
function teleportFromPortal(portalCell) {
    const offset = parseBindingOffsets(portalCell.dataset.portalTo);
    const target = offset && getRelativeCell(portalCell, offset);
    if (target?.dataset.type !== 'square') return;
    addMarker(target, '🧍', 'black');
    window.playerCell = target;
    pressBlockButton(target);
}

// [亚空间] 剩余步数显示为玩家右上角的角标
function renderSubspaceBadge() {
    document.querySelectorAll('.marker[data-subspace]').forEach(marker => delete marker.dataset.subspace);
    if (!subspaceSteps || !window.playerCell) return;
    const marker = [...window.playerCell.querySelectorAll('.marker')].find(m => m.dataset.markerType === 'player');
    if (marker) marker.dataset.subspace = subspaceSteps;
}

function movePlayer(direction) {
    if (window.editModeManager?.isActive()) return;
    if (!window.playerCell) return;

    // [亚空间] 原地不动，剩余步数归零时传送（亚空间内的步也计入冲刺方向）
    if (subspaceSteps > 0) {
        lastMoveDirection = direction;
        if (--subspaceSteps === 0) teleportFromPortal(window.playerCell);
        renderSubspaceBadge();
        window.trackManager?.record(direction);
        saveHistory();
        return;
    }

    const i = parseInt(window.playerCell.dataset.i, 10);
    const j = parseInt(window.playerCell.dataset.j, 10);

    let targetI = i;
    let targetJ = j;
    let wallI = i;
    let wallJ = j;

    switch(direction) {
        case 'up':
            targetJ -= 2;
            wallJ = j - 1;
            break;
        case 'down':
            targetJ += 2;
            wallJ = j + 1;
            break;
        case 'left':
            targetI -= 2;
            wallI = i - 1;
            break;
        case 'right':
            targetI += 2;
            wallI = i + 1;
            break;
    }

    const { size, wall } = getCellMetrics();

    currentMap.ensureCell(targetI, targetJ, size, wall);
    currentMap.ensureCell(wallI, wallJ, size, wall);

    const targetSquare = currentMap.cells.get(`${targetI},${targetJ}`);
    const wallCell = currentMap.cells.get(`${wallI},${wallJ}`);

    if (!targetSquare || !wallCell) return;

    // [树篱] 与上一步同向则冲刺穿过（保留），否则视为撞树篱（消失）
    const isHedgeDash = getCurrentWallType(wallCell) === '树篱' && lastMoveDirection === direction;

    let pushedBox = false;
    let pushedBoxWallCell = null;

    if (isPushableBoxAttachment(targetSquare)) {
        const attachFileName = getAttachmentFileName(targetSquare);
        const { movable, boxTargetSquare, boxWallCell } = canBoxMoveTo(direction, targetI, targetJ, size, wall);

        if (movable && attachFileName && boxTargetSquare) {
            clearAttachment(targetSquare);
            setAttachment(boxTargetSquare, attachFileName);
            ensureKnownSquare(boxTargetSquare);
            pushedBox = true;
            pushedBoxWallCell = boxWallCell;
        }
    }

    // 移动玩家标记
    addMarker(targetSquare, '🧍', 'black');
    window.playerCell = targetSquare;
    // 替换未知区域为已知
    ensureKnownSquare(targetSquare);
    // 更新经过的墙壁状态
    updatePassedWall(wallCell, isHedgeDash);
    lastMoveDirection = direction;

    // 推动成功时，人物和箱子间的墙也要变成空
    if (pushedBox && pushedBoxWallCell && pushedBoxWallCell.dataset.type === 'wall') {
        updatePassedWall(pushedBoxWallCell);
    }

    // [区块交互] 按下按钮；进入区块传送门则进入亚空间
    pressBlockButton(targetSquare);
    if (targetSquare.dataset.portalTo && getTerrainType(targetSquare) === '传送门') subspaceSteps = 2;
    renderSubspaceBadge();

    window.trackManager?.record(direction);   // [轨迹记录]
    saveHistory(); // 保存历史
}

function updatePassedWall(wallCell, isHedgeDash = false) {
    if (!wallCell || wallCell.dataset.type !== 'wall') return;

    const orientation = wallCell.classList.contains('horizontal') ? 'horizontal' : 'vertical';
    const currentWallType = getCurrentWallType(wallCell);
    let newWallType = '空';

    if (currentWallType === '树篱') {
        if (isHedgeDash) return;  // 冲刺穿过：树篱保留
        newWallType = '空';       // 撞树篱：树篱消失
    } else if (currentWallType === '门') {
        newWallType = '门 (开)';  // 如果是关闭的门，设为打开的门
    } else if (currentWallType === '门 (开)') {
        newWallType = '门 (开)';  // 如果是打开的门，保持为打开的门
    } else if (currentWallType === '未知') {
        newWallType = '空';  // 如果是未知墙壁，设为空墙
    } else if (currentWallType === '空') {
        newWallType = '空';  // 如果是空墙，保持为空
    } else if (currentWallType === '普通') {
        newWallType = '空';  // 如果是普通墙，设为空墙
    }

    wallCell.style.backgroundImage = `url('${getWallImage(newWallType, orientation)}')`;
}

function addMarker(cell, marker, color = 'black') {
    const type = MARKER_TYPE[marker];
    if (type) {
        document.querySelectorAll('.marker').forEach(m => {
            if (m.dataset.markerType === type) {
                m.remove();
            }
        });
    }

    const ctr = getMarkerContainer(cell);
    const span = document.createElement('span');
    span.className = 'marker';
    span.style.color = color;
    span.textContent = marker;
    if (type) {
        span.dataset.markerType = type;
    }

    ctr.appendChild(span);

    refreshMarkerColors(cell);  // 刷新标记颜色

    if (marker === '🧍') {
        const currentBg = cell.style.backgroundImage;
        const isUnknown = !currentBg || currentBg.includes('unknown.png');
        if (isUnknown) {
            cell.style.backgroundImage = `url('./img/empty.png')`;
        }
    }
}

function clearMarkers(cell) {
    cell.querySelectorAll('.marker').forEach(m => m.remove());
}
