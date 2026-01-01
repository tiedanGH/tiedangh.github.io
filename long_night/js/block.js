
const BLOCKS_VERSION = '20251221';

let blocksData = {};

function loadBlocks() {
    fetch(`blocks.json?v=${BLOCKS_VERSION}`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(data => {
            blocksData = data;
            console.log('Blocks loaded:', blocksData);
        })
        .catch(err => {
            console.error('Failed to load blocks:', err);
            blocksData = {};
        });
}

function getWallColor(type) {
    const option = wallOptions.find(([name]) => name === type);
    return option ? option[3] : '#D9D9D9';
}

function getWallImage(type, orientation) {
    const option = wallOptions.find(([name]) => name === type);
    if (!option) {
        return orientation === 'horizontal'
            ? './img/walls/unknown_row.png'
            : './img/walls/unknown_col.png';
    }
    return orientation === 'horizontal'
        ? `./img/${option[1]}`
        : `./img/${option[2]}`;
}

// 墙壁类型的优先级：越靠后优先级越高
function getWallPriority(type) {
    if (type === "未知") return -1;
    return wallOptions.findIndex(([name]) => name === type);
}

function compareWallPriority(typeA, typeB) {
    const priorityA = getWallPriority(typeA);
    const priorityB = getWallPriority(typeB);
    return priorityA > priorityB ? typeA : typeB;
}

// 从墙壁元素中解析当前墙壁类型
function getCurrentWallType(wallCell) {
    const currentBg = wallCell.style.backgroundImage;
    if (!currentBg || currentBg === 'none') {
        return '未知';
    }
    const url = currentBg.replace(/url\(['"]?(.*?)['"]?\)/, '$1');
    const fileName = url.split('/').pop();
    const wallOption = wallOptions.find(option =>
        option[1] === `walls/${fileName}` ||
        option[2] === `walls/${fileName}`
    );
    return wallOption ? wallOption[0] : '未知';
}

function blockCellEvent(map) {
    map.container.addEventListener('click', e => {
        const center = e.target.closest('.cell.center');
        if (!center) return;

        const i0 = parseInt(center.dataset.i, 10);
        const j0 = parseInt(center.dataset.j, 10);

        showBlockSelector(e, blockId => {
            removeBlockSelector()

            if (blockId === '__CLEAR__') {
                clearArea(map, i0, j0);
                setTimeout(() => {
                    if (window.historyManager) window.historyManager.saveState(); // 清除后保存历史
                }, 10);
                return;
            }

            const block = blocksData[blockId];
            if (!block) return;

            // 先清空区域
            for (let dx = 0; dx < 3; dx++) {
                for (let dy = 0; dy < 3; dy++) {
                    const i = i0 + dx * 2 + 1;
                    const j = j0 + dy * 2 + 1;
                    const key = `${i},${j}`;
                    const square = map.cells.get(key);
                    if (square?.dataset.type === 'square') {
                        square.style.backgroundImage = `url('./img/empty.png')`;
                    }

                    const directions = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
                    directions.forEach(([wi, wj]) => {
                        if (wi > i0 && wi < i0 + 6 && wj > j0 && wj < j0 + 6) {
                            const key = `${wi},${wj}`;
                            const wall = map.cells.get(key);
                            if (wall?.dataset.type === 'wall') {
                                const orientation = wall.classList.contains('horizontal') ? 'horizontal' : 'vertical';
                                wall.style.backgroundImage = `url('${getWallImage('空', orientation)}')`;
                            }
                        }
                    });
                }
            }

            // 然后放置区块
            block.forEach(cellInfo => {
                const i = i0 + cellInfo.pos.x * 2 + 1;
                const j = j0 + cellInfo.pos.y * 2 + 1;
                const key = `${i},${j}`;
                const square = map.cells.get(key);
                if (!square || square.dataset.type !== 'square') return;

                const imgFile = gridOptions.find(([name]) => name === cellInfo.ground.type)?.[1];
                square.style.backgroundImage = `url('./img/${imgFile || 'unknown.png'}')`;
                const attImgFile = attachOptions.find(([name]) => name === cellInfo.ground.attach)?.[1];
                if (attImgFile) setAttachment(square, attImgFile);

                ['top', 'right', 'bottom', 'left'].forEach(dir => {
                    if (cellInfo[dir].wall) {
                        let wi = i + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0);
                        let wj = j + (dir === 'top'  ? -1 : dir === 'bottom'? 1 : 0);
                        const wallCell = map.cells.get(`${wi},${wj}`);
                        if (!wallCell || wallCell.dataset.type !== 'wall') return;

                        const newWallType = cellInfo[dir].type;
                        const orientation = wallCell.classList.contains('horizontal') ? 'horizontal' : 'vertical';
                        if (wi > i0 && wi < i0 + 6 && wj > j0 && wj < j0 + 6) {
                            wallCell.style.backgroundImage = `url('${getWallImage(newWallType, orientation)}')`;
                            return;
                        }

                        // 比较优先级，仅当新墙壁优先级更高时才更新
                        const higherPriorityType = compareWallPriority(getCurrentWallType(wallCell), newWallType);
                        if (higherPriorityType === newWallType) {
                            wallCell.style.backgroundImage = `url('${getWallImage(newWallType, orientation)}')`;
                        }
                    }
                });
            });

            setTimeout(() => {
                if (window.historyManager) window.historyManager.saveState(); // 区块放置后保存历史
            }, 10);
        }, map, i0, j0);
    });
}

function showBlockSelector(e, onSelect, map, i0, j0) {
    removeBlockSelector();

    const panel = document.createElement('div');
    panel.className = 'selector';
    panel.style.left = e.clientX + 'px';
    panel.style.top = e.clientY + 'px';

    const ids = Object.keys(blocksData);

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = '放置区块';
    panel.appendChild(title);

    const container = document.createElement('div');

    function createGrid(marginTop = '0px') {
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(8, 1fr)';
        grid.style.gap = '4px';
        grid.style.marginTop = marginTop;
        return grid;
    }

    const normalGrid = createGrid();
    const specialGrid = createGrid('6px');
    const exitGrid = createGrid('6px');

    ids.forEach(id => {
        const block = blocksData[id];
        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.flexDirection = 'column';
        btnWrap.style.alignItems = 'center';

        const btn = document.createElement('button');
        btn.textContent = id;
        btn.onclick = () => onSelect(id);

        const preview = createPreview(block);
        btnWrap.appendChild(btn);
        btnWrap.appendChild(preview);

        if (id.startsWith('E')) {
            exitGrid.appendChild(btnWrap);
        } else if (id.startsWith('S')) {
            specialGrid.appendChild(btnWrap)
        } else {
            normalGrid.appendChild(btnWrap);
        }
    });

    // 预设地图边框按钮
    const borderSizes = [
        { label: '9×9', gridWidth: 9, gridHeight: 9 },
        { label: '10×10', gridWidth: 10, gridHeight: 10 },
        { label: '12×12', gridWidth: 12, gridHeight: 12 }
    ];
    const borderContainer = document.createElement('div');
    borderContainer.style.display = 'flex';
    borderContainer.style.marginTop = '5px';

    borderSizes.forEach(border => {
        const borderBtn = document.createElement('button');
        borderBtn.textContent = border.label;
        borderBtn.style.flex = '1';
        borderBtn.style.margin = '0 2px';

        borderBtn.onclick = () => {
            createMapBorder(map, i0, j0, border.gridWidth, border.gridHeight);
            removeBlockSelector();
            setTimeout(() => {
                if (window.historyManager) window.historyManager.saveState();
            }, 10);
        };

        borderContainer.appendChild(borderBtn);
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'clear-btn';
    clearBtn.textContent = '清除区块';
    clearBtn.onclick = () => onSelect('__CLEAR__');

    container.appendChild(normalGrid);
    if (exitGrid.children.length > 0) {
        container.appendChild(exitGrid);
    }
    if (specialGrid.children.length > 0) {
        container.appendChild(specialGrid);
    }
    container.appendChild(borderContainer);
    container.appendChild(clearBtn);

    panel.appendChild(container);
    document.body.appendChild(panel);

    setTimeout(() => {
        adjustElementPosition(panel, e);
    }, 0);
}

// 创建地图边框
function createMapBorder(map, startI, startJ, gridWidth, gridHeight) {
    const wallsX = gridWidth + 1;
    const wallsY = gridHeight + 1;

    const endI = startI + (wallsX - 1) * 2;
    const endJ = startJ + (wallsY - 1) * 2;

    const size = window.innerWidth > 600 ? 40 : 30;
    const wall = window.innerWidth > 600 ? 11 : 9;

    function ensureWhiteWall(map, i, j, size, wall) {
        map.ensureCell(i, j, size, wall);
        const wallCell = map.cells.get(`${i},${j}`);

        if (wallCell && wallCell.dataset.type === 'wall') {
            if (getCurrentWallType(wallCell) === '未知') {
                const orientation = wallCell.classList.contains('horizontal') ? 'horizontal' : 'vertical';
                wallCell.style.backgroundImage = `url('${getWallImage('空', orientation)}')`;
            }
        }
    }

    for (let i = startI; i <= endI; i++) {
        ensureWhiteWall(map, i, startJ, size, wall); // 上
        ensureWhiteWall(map, i, endJ, size, wall);   // 下
    }
    for (let j = startJ; j <= endJ; j++) {
        ensureWhiteWall(map, startI, j, size, wall); // 左
        ensureWhiteWall(map, endI, j, size, wall);   // 右
    }
}

// 边界检查：确保菜单不会超出屏幕
const adjustElementPosition = (element, e) => {
    const rect = element.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // 调整水平位置
    if (rect.right > windowWidth - 10) {
        element.style.left = (windowWidth - rect.width - 10) + 'px';
    }
    if (rect.left < 10) {
        element.style.left = '10px';
    }

    // 调整垂直位置
    if (rect.bottom > windowHeight - 10) {
        const newTop = e.clientY - rect.height - 20;
        if (newTop > 10) {
            element.style.top = newTop + 'px';
        } else {
            element.style.maxHeight = (windowHeight - e.clientY - 30) + 'px';
            element.style.top = e.clientY + 'px';
        }
    }

    const newRect = element.getBoundingClientRect();
    if (newRect.top < 10) {
        element.style.top = '10px';
        element.style.maxHeight = (windowHeight - 30) + 'px';
    }
};

function removeBlockSelector() {
    const ex = document.querySelector('.selector');
    if (ex) ex.remove();
}

function clearArea(map, i0, j0) {
    for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 3; dy++) {
            const i = i0 + dx * 2 + 1;
            const j = j0 + dy * 2 + 1;
            const square = map.cells.get(`${i},${j}`);
            if (square?.dataset.type === 'square') {
                // 清除地形
                square.style.backgroundImage = 'url(./img/unknown.png)';
                // 清除附着
                const attachmentLayer = square.querySelector('.attachment-layer');
                if (attachmentLayer) {
                    attachmentLayer.style.backgroundImage = '';
                    attachmentLayer.remove();
                }
            }

            const directions = [
                [i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]
            ];
            directions.forEach(([wi, wj]) => {
                const wall = map.cells.get(`${wi},${wj}`);
                if (wall?.dataset.type === 'wall') {
                    const orientation = wall.classList.contains('horizontal') ? 'horizontal' : 'vertical';
                    wall.style.backgroundImage = `url('${getWallImage('未知', orientation)}')`;
                }
            });
        }
    }
}

function createPreview(block) {
    const table = document.createElement('table');
    table.className = 'preview';

    for (let y = 0; y < 3; y++) {
        const tr = document.createElement('tr');
        for (let x = 0; x < 3; x++) {
            const td = document.createElement('td');

            const info = block.find(b => b.pos.x === x && b.pos.y === y);
            if (info) {
                const imgFile = gridOptions.find(([name]) => name === info.ground.type)?.[1];
                td.style.backgroundImage = `url('./img/${imgFile || 'unknown.png'}')`;
                td.style.backgroundSize = 'cover';

                const t = info.top, r = info.right, b = info.bottom, l = info.left;
                td.style.borderTop    = t.wall ? `2px solid ${getWallColor(t.type)}` : '1px solid white';
                td.style.borderRight  = r.wall ? `2px solid ${getWallColor(r.type)}` : '1px solid white';
                td.style.borderBottom = b.wall ? `2px solid ${getWallColor(b.type)}` : '1px solid white';
                td.style.borderLeft   = l.wall ? `2px solid ${getWallColor(l.type)}` : '1px solid white';

                if (info.ground.attach) {
                    const attachImg = attachOptions.find(([name]) => name === info.ground.attach)?.[1];
                    if (attachImg) {
                        const attachEl = document.createElement('img');
                        attachEl.className = 'attach';
                        attachEl.src = `./img/${attachImg}`;
                        td.appendChild(attachEl);
                    }
                }
            }

            tr.appendChild(td);
        }
        table.appendChild(tr);
    }

    return table;
}
