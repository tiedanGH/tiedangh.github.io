
const squareOptions = [
    ['空地', 'empty.png'],
    ['树丛', 'grass.png'],
    ['水洼', 'water.png'],
    ['传送门', 'portal.png'],
    ['陷阱', 'trap.png'],
    ['热源', 'heat.png'],
    ['箱子', 'box.png'],
    ['按钮', 'button.png'],
    ['逃生舱', 'exit.png'],
    ['未知', 'unknown.png'],
];
const wallOptions = [
    ['空', '#FFFFFF'],
    ['普通', '#000000'],
    ['门', '#EA68A2'],
    ['门 (开)', '#F8CDE1'],
    ['未知', '#D9D9D9'],
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

        if (now - lastClickTime < 300) {
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
            showSelector(e, squareOptions, imgFile => {
                cell.style.backgroundImage = `url('./img/${imgFile}')`;
            });
        } else if (type === 'wall') {
            showSelector(e, wallOptions, c => {
                cell.style.backgroundColor = c;
            });
        }
    });

    initKeyboardControls();
    initMobileDirectionControls();
}

function initKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

        if (!window.playerCell) return;

        e.preventDefault();

        let direction;
        switch(e.key) {
            case 'ArrowUp': direction = 'up'; break;
            case 'ArrowDown': direction = 'down'; break;
            case 'ArrowLeft': direction = 'left'; break;
            case 'ArrowRight': direction = 'right'; break;
        }

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
        wallCell.style.backgroundColor = '#FFFFFF';
    }

    saveHistory(); // 保存历史
}

function showSelector(e, options, callback) {
    const sel = document.createElement('div');
    sel.className = 'selector';
    sel.style.left = e.clientX + 'px';
    sel.style.top = e.clientY + 'px';

    const ul = document.createElement('ul');
    ul.className = 'option-list';

    options.forEach(([name, val]) => {
        const li = document.createElement('li');
        li.className = 'option-item';

        if (val.endsWith('.png') || val.endsWith('.jpg')) {
            const img = document.createElement('img');
            img.className = 'color-box';
            img.src = `./img/${val}`;
            img.alt = name;
            li.appendChild(img);
        } else {
            const box = document.createElement('span');
            box.className = 'color-box';
            box.style.backgroundColor = val;
            li.appendChild(box);
        }

        li.appendChild(document.createTextNode(name));
        li.onclick = () => {
            callback(val);
            saveHistory(); // 保存历史
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
