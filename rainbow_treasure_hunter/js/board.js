import { bgmEnabled, bgmAudio } from './sound.js';

export function createBoard(settings, state, onLeft, onRight) {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${settings.COLS},1fr)`;
    const cells = [];

    for (let r = 0; r < settings.ROWS; r++) {
        cells[r] = [];
        for (let c = 0; c < settings.COLS; c++) {
            const el = document.createElement('div');
            el.classList.add('cell');
            el.dataset.row = r.toString(); el.dataset.col = c.toString();
            const size = Math.min(Math.floor((Math.min(window.innerWidth,600)-40)/settings.COLS),40);
            el.style.width = el.style.height = `${size}px`;

            el.addEventListener('click', (e) => {
                if (state.markMode) {
                    onRight(r,c,true);
                    e.stopPropagation();
                } else {
                    onLeft(r,c);
                }
            });
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                onRight(r,c,false);
            });

            grid.appendChild(el);
            cells[r][c] = { element: el, type: 'empty', revealed: false, flagged: false, flagType: null, value: '', color: '' };
        }
    }

    // 播放 BGM
    if (bgmEnabled) bgmAudio.play().catch(() => {});
    return cells;
}

export function placeItems(cells, firstR, firstC, settings) {
    const safe = new Set();
    safe.add(`${firstR},${firstC}`)

    let placed=0;
    while (placed<settings.TOTAL_TREASURES) {
        const r=Math.floor(Math.random()*settings.ROWS), c=Math.floor(Math.random()*settings.COLS);
        if (!safe.has(`${r},${c}`) && cells[r][c].type==='empty') {
            cells[r][c].type='treasure'; placed++;
        }
    }
    placed=0;
    while (placed<settings.TOTAL_BOMBS) {
        const r=Math.floor(Math.random()*settings.ROWS), c=Math.floor(Math.random()*settings.COLS);
        if (!safe.has(`${r},${c}`) && cells[r][c].type==='empty') {
            cells[r][c].type='bomb'; placed++;
        }
    }
    calculateCellValues(cells, settings);
}

export function calculateCellValues(cells, settings) {
    for (let r=0; r<settings.ROWS; r++) {
        for (let c=0; c<settings.COLS; c++) {
            const cell=cells[r][c];
            if (cell.type!=='empty') continue;
            const colors=['R','B','Y','P','O','G'];
            const color=colors[Math.floor(Math.random()*colors.length)];
            cell.color=color;
            let v;
            switch(color){
                case 'R': v = countSurroundingBombs(cells,r,c,settings); break;
                case 'B': v = countRowColBombs(cells,r,c,settings); break;
                case 'Y': v = countSurroundingTreasures(cells,r,c,settings); break;
                case 'P': {
                    const red = countSurroundingBombs(cells,r,c,settings);
                    const blue = countRowColBombs(cells,r,c,settings);
                    const rep = countAdjacentBombs(cells,r,c,settings);
                    v = red + blue - rep;
                    break;
                }
                case 'O': {
                    const red = countSurroundingBombs(cells,r,c,settings);
                    const yel = countSurroundingTreasures(cells,r,c,settings);
                    v = red + yel;
                    break;
                }
                case 'G':
                    v = countRowColSurroundingTreasures(cells,r,c,settings);
                    break;
            }
            cell.value = color + v;
        }
    }
}

// 以下各种计数函数（和源代码一致）
function countSurroundingBombs(cells,r,c,settings){
    let cnt=0;
    for(let i=Math.max(0,r-1);i<=Math.min(settings.ROWS-1,r+1);i++)
        for(let j=Math.max(0,c-1);j<=Math.min(settings.COLS-1,c+1);j++)
            if(!(i===r&&j===c)&& cells[i][j].type==='bomb') cnt++;
    return cnt;
}

function countRowColBombs(cells,r,c,settings){
    let cnt=0;
    for(let j=0;j<settings.COLS;j++) if(cells[r][j].type==='bomb') cnt++;
    for(let i=0;i<settings.ROWS;i++) if(cells[i][c].type==='bomb') cnt++;
    if(cells[r][c].type==='bomb') cnt--;
    return cnt;
}

function countSurroundingTreasures(cells,r,c,settings){
    let cnt=0;
    for(let i=Math.max(0,r-1);i<=Math.min(settings.ROWS-1,r+1);i++)
        for(let j=Math.max(0,c-1);j<=Math.min(settings.COLS-1,c+1);j++)
            if(!(i===r&&j===c)&& cells[i][j].type==='treasure') cnt++;
    return cnt;
}

function countAdjacentBombs(cells,r,c,settings){
    let cnt=0;
    const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
    for(let [dr,dc] of dirs){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<settings.ROWS&&nc>=0&&nc<settings.COLS&&cells[nr][nc].type==='bomb') cnt++;
    }
    return cnt;
}

function countRowColSurroundingTreasures(cells,r,c,settings){
    const s=new Set();
    for(let j=0;j<settings.COLS;j++) if(cells[r][j].type==='treasure') s.add(`${r},${j}`);
    for(let i=0;i<settings.ROWS;i++) if(cells[i][c].type==='treasure') s.add(`${i},${c}`);
    for(let i=Math.max(0,r-1);i<=Math.min(settings.ROWS-1,r+1);i++)
        for(let j=Math.max(0,c-1);j<=Math.min(settings.COLS-1,c+1);j++)
            if(!(i===r&&j===c)&& cells[i][j].type==='treasure') s.add(`${i},${j}`);
    return s.size;
}

// 手动揭示所有格子
export function revealAll(cells, settings) {
    for(let r=0;r<settings.ROWS;r++){
        for(let c=0;c<settings.COLS;c++){
            const cell=cells[r][c];
            if(!cell.revealed){
                cell.revealed=true;
                cell.element.classList.add('revealed');
                if(cell.type==='treasure') cell.element.textContent='⭐';
                else if(cell.type==='bomb') cell.element.textContent='💣';
                else {
                    cell.element.textContent=cell.value;
                    cell.element.classList.add(`color-${cell.color.toLowerCase()}`);
                }
            }
        }
    }
}

// 调整单元格尺寸（窗口 resize 时用）
export function resizeCells(cells, settings) {
    for(let r=0;r<settings.ROWS;r++){
        for(let c=0;c<settings.COLS;c++){
            const el=cells[r][c].element;
            const size = Math.min(Math.floor((Math.min(window.innerWidth,600)-40)/settings.COLS),40);
            el.style.width=el.style.height=`${size}px`;
        }
    }
}
