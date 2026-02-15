
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
    return layer;
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
        if (!window.playerCell) return;

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

function movePlayer(direction) {
    if (!window.playerCell) return;

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

    const size = window.innerWidth > 600 ? 40 : 30;
    const wall = window.innerWidth > 600 ? 11 : 9;

    currentMap.ensureCell(targetI, targetJ, size, wall);
    currentMap.ensureCell(wallI, wallJ, size, wall);

    const targetSquare = currentMap.cells.get(`${targetI},${targetJ}`);
    const wallCell = currentMap.cells.get(`${wallI},${wallJ}`);

    if (!targetSquare || !wallCell) return;

    // 移动玩家标记
    addMarker(targetSquare, '🧍', 'black');
    window.playerCell = targetSquare;

    // 仅替换未知区域
    const currentBg = targetSquare.style.backgroundImage;
    const isUnknown = !currentBg || currentBg.includes('unknown.png');
    if (isUnknown) {
        targetSquare.style.backgroundImage = `url('./img/empty.png')`;
    }

    if (wallCell.dataset.type === 'wall') {
        const orientation = wallCell.classList.contains('horizontal') ? 'horizontal' : 'vertical';

        const currentWallType = getCurrentWallType(wallCell);
        let newWallType = '空';

        if (currentWallType === '门') {
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

    saveHistory(); // 保存历史
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
