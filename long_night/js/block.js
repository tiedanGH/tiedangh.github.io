import {squareOptions} from "./ui.js";

export let blocksData = {};
export async function loadBlocks() {
    const res = await fetch('block.json');
    blocksData = await res.json();
}

export function blockCellEvent(map) {
    map.container.addEventListener('click', e => {
        const center = e.target.closest('.cell.center');
        if (!center) return;

        const i0 = parseInt(center.dataset.i, 10);
        const j0 = parseInt(center.dataset.j, 10);

        showBlockSelector(e, blockId => {
            removeBlockSelector()
            if (blockId === '__CLEAR__') {
                clearArea(map, i0, j0);
                return;
            }

            const block = blocksData[blockId];
            if (!block) return;

            for (let dx = 0; dx < 3; dx++) {
                for (let dy = 0; dy < 3; dy++) {
                    const i = i0 + dx * 2 + 1;
                    const j = j0 + dy * 2 + 1;
                    const key = `${i},${j}`;
                    const square = map.cells.get(key);
                    if (square?.dataset.type === 'square') {
                        square.style.backgroundColor = '#FFFFFF';
                    }

                    const directions = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
                    directions.forEach(([wi, wj]) => {
                        if (wi > i0 && wi < i0 + 6 && wj > j0 && wj < j0 + 6) {
                            const key = `${wi},${wj}`;
                            const wall = map.cells.get(key);
                            if (wall?.dataset.type === 'wall') {
                                wall.style.backgroundColor = '#FFFFFF';
                            }
                        }
                    });
                }
            }

            block.forEach(cellInfo => {
                const i = i0 + cellInfo.pos.x * 2 + 1;
                const j = j0 + cellInfo.pos.y * 2 + 1;
                const key = `${i},${j}`;
                const square = map.cells.get(key);
                if (!square || square.dataset.type !== 'square') return;

                square.style.backgroundColor = squareOptions.find(([name]) => name === cellInfo.ground.type)?.[1] || '#D9D9D9';

                ['top','right','bottom','left'].forEach(dir => {
                    if (cellInfo[dir].wall) {
                        let wi = i + (dir === 'left'  ? -1 : dir === 'right' ? 1 : 0);
                        let wj = j + (dir === 'top'   ? -1 : dir === 'bottom'? 1 : 0);
                        const wallCell = map.cells.get(`${wi},${wj}`);
                        if (wallCell && wallCell.dataset.type === 'wall') {
                            wallCell.style.backgroundColor = '#000';
                        }
                    }
                });
            });
        });
    });
}

export function showBlockSelector(e, onSelect) {
    removeBlockSelector();

    const panel = document.createElement('div');
    panel.className = 'selector';
    panel.style.left = e.clientX + 'px';
    panel.style.top = e.clientY + 'px';

    const ids = Object.keys(blocksData);

    const title = document.createElement('div');
    title.textContent = '放置区块';
    title.style.textAlign = 'center';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '16px';
    title.style.marginBottom = '8px';
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
    const specialGrid = createGrid('10px');
    const exitGrid = createGrid('10px');

    ids.forEach(id => {
        const block = blocksData[id];
        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.flexDirection = 'column';
        btnWrap.style.alignItems = 'center';

        const btn = document.createElement('button');
        btn.textContent = id;
        btn.style.padding = '4px 6px';
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

    const clearBtn = document.createElement('button');
    clearBtn.textContent = '清除区块';
    clearBtn.style.width = '100px';
    clearBtn.style.marginTop = '12px';
    clearBtn.style.display = 'block';
    clearBtn.style.marginLeft = 'auto';
    clearBtn.style.marginRight = 'auto';
    clearBtn.onclick = () => onSelect('__CLEAR__');

    container.appendChild(normalGrid);
    if (specialGrid.children.length > 0) {
        container.appendChild(specialGrid);
    }
    container.appendChild(exitGrid);
    container.appendChild(clearBtn);

    panel.appendChild(container);
    document.body.appendChild(panel);
}

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
                square.style.backgroundColor = '#D9D9D9';
            }

            const directions = [
                [i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]
            ];
            directions.forEach(([wi, wj]) => {
                const wall = map.cells.get(`${wi},${wj}`);
                if (wall?.dataset.type === 'wall') {
                    wall.style.backgroundColor = '#D9D9D9';
                }
            });
        }
    }
}

function createPreview(block) {
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.width  = '36px';
    table.style.height = '36px';
    table.style.pointerEvents = 'none';

    for (let y = 0; y < 3; y++) {
        const tr = document.createElement('tr');
        for (let x = 0; x < 3; x++) {
            const td = document.createElement('td');
            td.style.width  = '12px';
            td.style.height = '12px';
            td.style.padding = '0';
            td.style.margin  = '0';
            td.style.boxSizing = 'border-box';
            td.style.backgroundColor = '#FFFFFF';

            const info = block.find(b => b.pos.x === x && b.pos.y === y);
            if (info) {
                td.style.backgroundColor = squareOptions.find(([name]) => name === info.ground.type)?.[1] || '#D9D9D9';
            }

            if (info?.top?.wall)    td.style.borderTop    = '2px solid black';
            if (info?.right?.wall)  td.style.borderRight  = '2px solid black';
            if (info?.bottom?.wall) td.style.borderBottom = '2px solid black';
            if (info?.left?.wall)   td.style.borderLeft   = '2px solid black';

            tr.appendChild(td);
        }
        table.appendChild(tr);
    }

    return table;
}

