
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
            showWallSelector(e, cell, orientation);
        }
    });

    initKeyboardControls();
    initMobileDirectionControls();
}

// 通用颜色输入函数
function createColorInputPopup(title, onConfirm) {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'color-input-container';
    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.fontWeight = 'bold';
    const previewBox = document.createElement('div');
    previewBox.className = 'color-preview-box';
    const colorInput = document.createElement('input');
    colorInput.type = 'text';
    colorInput.placeholder = '6位HEX颜色';
    colorInput.maxLength = 6;
    const preview = document.createElement('div');
    preview.className = 'color-preview invalid';
    preview.style.backgroundImage = 'url(./img/custom.png)';
    preview.style.backgroundSize = 'cover';
    colorInput.value = '';
    let isValidColor = false;
    let currentColor = '';

    colorInput.addEventListener('input', () => {
        let color = colorInput.value.trim().toUpperCase();
        color = color.replace(/[^0-9A-F]/g, '');    // 过滤非HEX字符
        colorInput.value = color;

        if (/^[0-9A-F]{6}$/i.test(color)) {
            preview.style.backgroundImage = 'none';
            preview.style.backgroundColor = '#' + color;
            preview.className = 'color-preview valid';
            isValidColor = true;
            currentColor = '#' + color;
        } else {
            preview.style.backgroundImage = 'url(./img/custom.png)';
            preview.style.backgroundColor = 'transparent';
            preview.className = 'color-preview invalid';
            isValidColor = false;
            currentColor = '';
        }
    });

    // 点击预览确认
    preview.onclick = () => {
        if (isValidColor && currentColor) {
            onConfirm(currentColor);
            if (document.body.contains(inputContainer)) {
                document.body.removeChild(inputContainer);
            }
        }
    };
    // 按Enter键确认
    colorInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' && isValidColor && currentColor) {
            onConfirm(currentColor);
            if (document.body.contains(inputContainer)) {
                document.body.removeChild(inputContainer);
            }
        }
    });

    previewBox.appendChild(preview);
    previewBox.appendChild(colorInput);
    inputContainer.appendChild(titleEl);
    inputContainer.appendChild(previewBox);

    return {
        container: inputContainer,
        input: colorInput,
        focus: () => colorInput.focus()
    };
}

// 选择器位置调整函数
function positionSelector(container, targetElement, isMobile) {
    if (isMobile) {
        // 小屏幕居中
        container.style.left = '50%';
        container.style.top = '50%';
        container.style.transform = 'translate(-50%, -50%)';
    } else {
        // 大屏幕显示在点击位置的右下方
        const rect = targetElement.getBoundingClientRect();
        let left = rect.right + 5;
        let top = rect.top;
        // 确保不超出屏幕
        setTimeout(() => {
            const containerRect = container.getBoundingClientRect();
            if (left + containerRect.width > window.innerWidth) {
                left = rect.left - containerRect.width - 5;
            }
            if (top + containerRect.height > window.innerHeight) {
                top = window.innerHeight - containerRect.height - 10;
            }
            if (top < 10) {
                top = 10;
            }
            container.style.left = left + 'px';
            container.style.top = top + 'px';
            container.style.transform = 'none';
        }, 0);
    }
}

// 创建通用选项列表项
function createOptionItem(name, imageSrc, onClick, imageClass = 'square-box') {
    const li = document.createElement('li');
    li.className = 'option-item';

    const img = document.createElement('img');
    img.className = imageClass;
    img.src = imageSrc;
    img.alt = name;

    li.appendChild(img);
    li.appendChild(document.createTextNode(name));

    li.onclick = onClick;
    return li;
}

// 创建自定义选项
function createCustomOption(idGrid, cell, event, groupType = 'grid') {
    const li = document.createElement('li');
    li.className = 'option-item custom-option';

    const customImg = document.createElement('img');
    customImg.className = 'square-box';
    customImg.src = './img/custom.png';

    li.appendChild(customImg);
    li.appendChild(document.createTextNode('自定义'));

    li.onclick = (e) => {
        const title = idGrid ? '自定义地形颜色' : (groupType === 'attach' ? '自定义附着颜色' : '自定义墙壁颜色');

        const existingInput = document.querySelector('.color-input-container');
        if (existingInput) {
            document.body.removeChild(existingInput);
        }
        const colorInput = createColorInputPopup(title, (color) => {
            if (groupType === 'grid') {
                // 自定义地形
                cell.style.backgroundImage = 'none';
                cell.style.backgroundColor = color;
                cell.style.backgroundSize = 'cover';
            } else if (groupType === 'attach') {
                // 自定义附着
                const layer = getAttachmentLayer(cell);
                layer.style.backgroundImage = 'none';
                layer.style.cssText = '';
                layer.style.backgroundColor = color;
                layer.style.borderRadius = '50%';
                layer.style.width = '70%';
                layer.style.height = '70%';
                layer.style.position = 'absolute';
                layer.style.top = '50%';
                layer.style.left = '50%';
                layer.style.transform = 'translate(-50%, -50%)';
            } else if (groupType === 'wall') {
                // 自定义墙壁
                cell.style.backgroundImage = 'none';
                cell.style.backgroundColor = color;
                cell.style.backgroundSize = 'cover';
            }
            saveHistory();
            removeSelector();
        });

        const isMobile = window.innerWidth <= 600;
        positionSelector(colorInput.container, e.target, isMobile);

        document.body.appendChild(colorInput.container);
        colorInput.focus();

        // 点击外部关闭
        const handleOutsideClick = (event) => {
            if (!colorInput.container.contains(event.target)) {
                if (document.body.contains(colorInput.container)) {
                    document.body.removeChild(colorInput.container);
                }
                document.removeEventListener('mousedown', handleOutsideClick);
            }
        };

        setTimeout(() => {
            document.addEventListener('mousedown', handleOutsideClick);
        }, 0);
    };

    return li;
}

function showSquareAttachSelector(e, cell) {
    const sel = document.createElement('div');
    sel.className = 'selector';
    sel.style.left = e.clientX + 'px';
    sel.style.top = e.clientY + 'px';
    sel.style.display = 'flex';

    // 创建地形组
    const gridGroup = createOptionGroup('地形', gridOptions, cell, e, 'grid');
    // 创建附着组
    const attachGroup = createOptionGroup('附着', attachOptions, cell, e, 'attach');

    sel.appendChild(gridGroup);
    sel.appendChild(attachGroup);
    document.body.appendChild(sel);

    setTimeout(() => {
        adjustElementPosition(sel, e);
    }, 0);
}

// 创建选项组
function createOptionGroup(titleText, options, cell, event, groupType = 'grid') {
    const group = document.createElement('div');
    group.style.flex = '1';
    group.style.padding = '0 10px';

    const title = document.createElement('div');
    title.textContent = titleText;
    Object.assign(title.style, {
        fontWeight: 'bold',
        textAlign: 'center',
        margin: '6px 0',
    });
    const ul = document.createElement('ul');
    ul.className = 'option-list';

    // 添加常规选项
    options.forEach(([name, val]) => {
        const onClick = () => {
            if (groupType === 'grid') {
                cell.style.backgroundColor = '';
                cell.style.backgroundImage = `url('./img/${val}')`;
                cell.style.backgroundSize = 'cover';
            } else if (groupType === 'attach') {
                const layer = getAttachmentLayer(cell);
                layer.className = 'attachment-layer';
                layer.style.cssText = '';
                layer.style.backgroundImage = `url('./img/${val}')`;
                layer.style.backgroundSize = 'contain';
                layer.style.backgroundRepeat = 'no-repeat';
                layer.style.backgroundPosition = 'center';
            }
            saveHistory();
            removeSelector();
        };

        const li = createOptionItem(name, `./img/${val}`, onClick);
        ul.appendChild(li);
    });
    // 添加自定义选项
    const idGrid = groupType === 'grid';
    const customLi = createCustomOption(idGrid, cell, event, groupType);
    ul.appendChild(customLi);

    group.appendChild(title);
    group.appendChild(ul);
    return group;
}

// 墙壁选择器
function showWallSelector(e, cell, orientation) {
    const sel = document.createElement('div');
    sel.className = 'selector';
    sel.style.left = e.clientX + 'px';
    sel.style.top = e.clientY + 'px';

    const title = document.createElement('div');
    title.textContent = '墙壁类型';
    Object.assign(title.style, {
        fontWeight: 'bold',
        textAlign: 'center',
        margin: '6px 0',
    });

    const ul = document.createElement('ul');
    ul.className = 'option-list';

    // 添加预设墙壁选项
    wallOptions.forEach(([name, hImg, vImg]) => {
        const li = document.createElement('li');
        li.className = 'option-item';

        const img = document.createElement('img');
        img.className = 'wall-box';
        img.src = `./img/${orientation === 'horizontal' ? hImg : vImg}`;
        img.alt = name;

        li.appendChild(img);
        li.appendChild(document.createTextNode(name));

        li.onclick = () => {
            const wallImage = getWallImage(name, orientation);
            cell.style.backgroundImage = `url('${wallImage}')`;
            cell.style.backgroundColor = '';
            cell.style.backgroundSize = 'cover';
            saveHistory();
            removeSelector();
        };

        ul.appendChild(li);
    });
    // 添加自定义墙壁选项
    const customLi = createCustomOption(false, cell, e, 'wall');
    ul.appendChild(customLi);

    sel.appendChild(title);
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
