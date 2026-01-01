
const gridOptions = [
    ['空地', 'empty.png'],
    ['树丛', 'grass.png'],
    ['水洼', 'water.png'],
    ['传送门', 'portal.png'],
    ['陷阱', 'trap.png'],
    ['热源', 'heat.png'],
    ['箱子', 'box.png'],
    ['逃生舱', 'exit.png'],
    ['未知', 'unknown.png'],
];
const attachOptions = [
    ['按钮', 'button.png'],
    ['炸弹', 'bomb.png'],
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
const MARKER_TYPE = {
    '🧍': 'player',
};

// 玩家移动相关
let currentMap = null;

function uiCellEvents(map) {
    currentMap = map; // 保存地图引用

    map.container.addEventListener('contextmenu', e => e.preventDefault());

    // 移动端双击支持
    let lastClickTime = 0;
    map.container.addEventListener('click', e => {
        const now = Date.now();
        const cell = e.target.closest('.cell');
        if (!cell || cell.classList.contains('center') || cell.dataset.type !== 'square') return;

        if (now - lastClickTime < 500) {
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
        if (e.button !== 0) return;
        removeSelector();
        const cell = e.target.closest('.cell');
        if (!cell || cell.classList.contains('center')) return;
        const type = cell.dataset.type;

        if (type === 'square') {
            showSquareAttachSelector(e, cell);
        } else if (type === 'wall') {
            const orientation = cell.classList.contains('horizontal') ? 'horizontal' : 'vertical';
            showSelector(e, wallOptions, wallType => {
                const wallImage = getWallImage(wallType, orientation);
                cell.style.backgroundImage = `url('${wallImage}')`;
            });
        }
    });

    initKeyboardControls();
    initMobileDirectionControls();
}

function showSquareAttachSelector(e, cell) {
    const sel = document.createElement('div');
    sel.className = 'selector';
    sel.style.left = e.clientX + 'px';
    sel.style.top = e.clientY + 'px';
    sel.style.display = 'flex';

    function createGroup(titleText, options, onSelect) {
        const group = document.createElement('div');

        const title = document.createElement('div');
        title.textContent = titleText;
        Object.assign(title.style, {
            fontWeight: 'bold',
            textAlign: 'center',
            margin: '6px 0',
        });

        const ul = document.createElement('ul');
        ul.className = 'option-list';

        options.forEach(([name, val]) => {
            const li = document.createElement('li');
            li.className = 'option-item';

            const img = document.createElement('img');
            img.className = 'square-box';
            img.src = `./img/${val}`;
            img.alt = name;

            li.appendChild(img);
            li.appendChild(document.createTextNode(name));

            li.onclick = () => {
                onSelect(val);
                saveHistory();
                removeSelector();
            };

            ul.appendChild(li);
        });

        group.appendChild(title);
        group.appendChild(ul);
        return group;
    }

    sel.appendChild(
        createGroup('地形', gridOptions, imgFile => {
            cell.style.backgroundImage = `url('./img/${imgFile}')`;
        })
    );
    sel.appendChild(
        createGroup('附着', attachOptions, imgFile => {
            setAttachment(cell, imgFile);
        })
    );

    document.body.appendChild(sel);

    setTimeout(() => {
        adjustElementPosition(sel, e);
    }, 0);
}

function showSelector(e, options, callback) {
    const sel = document.createElement('div');
    sel.className = 'selector';
    sel.style.left = e.clientX + 'px';
    sel.style.top = e.clientY + 'px';

    const ul = document.createElement('ul');
    ul.className = 'option-list';

    options.forEach(([name, hImg, _]) => {
        const li = document.createElement('li');
        li.className = 'option-item';

        // 显示水平墙壁的预览图
        const img = document.createElement('img');
        img.className = 'wall-box';
        img.src = `./img/${hImg}`;
        img.alt = name;
        li.appendChild(img);

        li.appendChild(document.createTextNode(name));
        li.onclick = () => {
            callback(name);
            saveHistory();
            removeSelector();
        };
        ul.appendChild(li);
    });

    sel.appendChild(ul);
    document.body.appendChild(sel);

    setTimeout(() => {
        adjustElementPosition(sel, e);
    }, 0);
}

function setAttachment(cell, imgFile) {
    const layer = getAttachmentLayer(cell);
    layer.style.backgroundImage = imgFile
        ? `url('./img/${imgFile}')`
        : '';
}

function getAttachmentLayer(cell) {
    let layer = cell.querySelector('.attachment-layer');
    if (layer) return layer;

    layer = document.createElement('div');
    layer.className = 'attachment-layer';
    cell.appendChild(layer);
    return layer;
}

function showPlayerSelector(e, onSelect) {
    const panel = document.createElement('div');
    panel.className = 'selector';
    panel.style.left = `${e.clientX}px`;
    panel.style.top = `${e.clientY}px`;

    function createGrid(marginTop = '0px') {
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
        grid.style.gap = '4px';
        grid.style.marginTop = marginTop;
        return grid;
    }

    const title = document.createElement('div');
    title.textContent = '标记玩家';
    title.style.textAlign = 'center';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '16px';
    title.style.marginBottom = '8px';

    const special = createGrid('10px');
    [['🧍','black'], ['★','red']].forEach(([ch, color]) => {
        const btn = document.createElement('button');
        btn.textContent = ch;
        btn.style.padding = '4px 6px';
        btn.style.color = color;
        btn.onclick = () => {
            onSelect(ch, color);
            saveHistory(); // 保存历史
        };
        special.appendChild(btn);
    });

    const numbers = createGrid('10px');
    for (let i = 0; i <= 7; i++) {
        const ch = num[i];
        const btn = document.createElement('button');
        btn.textContent = ch;
        btn.style.padding = '4px 6px';
        btn.onclick = () => {
            onSelect(ch);
            saveHistory(); // 保存历史
        };
        numbers.appendChild(btn);
    }

    const clearBtn = document.createElement('button');
    clearBtn.textContent = '清除标记';
    clearBtn.style.width = '100px';
    clearBtn.style.display = 'block';
    clearBtn.style.marginTop = '10px';
    clearBtn.style.marginLeft = 'auto';
    clearBtn.style.marginRight = 'auto';
    clearBtn.onclick = () => {
        onSelect('__CLEAR__');
        saveHistory(); // 保存历史
    };

    panel.appendChild(title);
    panel.appendChild(special);
    panel.appendChild(numbers);
    panel.appendChild(clearBtn);
    document.body.appendChild(panel);

    setTimeout(() => {
        adjustElementPosition(panel, e);
    }, 0);
}

function getMarkerContainer(cell) {
    let ctr = cell.querySelector('.marker-container');
    if (ctr) return ctr;
    ctr = document.createElement('div');
    ctr.className = 'marker-container';
    Object.assign(ctr.style, {
        position: 'absolute',
        top:      '0',
        left:     '0',
        right:    '0',
        bottom:   '0',
        display:          'flex',
        flexWrap:         'wrap',
        justifyContent:   'center',
        alignItems:       'center',
        gap:              '2px',
        pointerEvents:    'none',
    });
    cell.appendChild(ctr);
    return ctr;
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
        wallCell.style.backgroundImage = `url('${getWallImage('空', orientation)}')`;
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
    span.textContent = marker;

    if (type) {
        span.dataset.markerType = type;
    }

    Object.assign(span.style, {
        color,
        fontSize: '14px',
        lineHeight: '1',
    });

    ctr.appendChild(span);

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

function removeSelector() {
    const ex = document.querySelector('.selector');
    if (ex) ex.remove();
}

function saveHistory() {
    if (window.historyManager) {
        setTimeout(() => {
            window.historyManager.saveState();
        }, 10);
    }
}
