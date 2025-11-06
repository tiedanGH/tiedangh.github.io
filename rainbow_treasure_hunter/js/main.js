// ========== main ==========
document.addEventListener('DOMContentLoaded', () => {
    // DOM 引用
    document.getElementById('grid');
    const livesEl           = document.getElementById('lives');
    const scoreEl           = document.getElementById('score');
    const roundEl           = document.getElementById('round');
    const treasuresEl       = document.getElementById('treasures');
    const bombsEl           = document.getElementById('bombs');
    const gameOverEl        = document.getElementById('game-over');
    const resetBtn          = document.getElementById('reset');
    const resetBtnShow      = document.getElementById('rst-btn');
    const applyBtn          = document.getElementById('apply-settings');
    const livesSet          = document.getElementById('lives-setting');
    const bombsSet          = document.getElementById('bombs-setting');
    const treasuresSet      = document.getElementById('treasures-setting');
    const sizeSet           = document.getElementById('size-setting');
    const markMineBtn       = document.getElementById('mark-mine');
    const markEmptyBtn      = document.getElementById('mark-empty');
    const markUnknownBtn    = document.getElementById('mark-unknown');
    const modeSelect        = document.getElementById('game-mode');
    const bgmBtn            = document.getElementById('bgm-toggle');
    const sfxBtn            = document.getElementById('sfx-toggle');
    const closeAlertBtn     = document.getElementById('close-alert');

    const ruleLives    = document.getElementById('rule-lives');
    const ruleBombs    = document.getElementById('rule-bombs');
    const ruleTreasures= document.getElementById('rule-treasures');
    const ruleSize     = document.getElementById('rule-size');

    // 设置 & 状态
    const settings = { ROWS:0, COLS:0, TOTAL_TREASURES:0, TOTAL_BOMBS:0, SAFE_ROUNDS:2 };
    const state = { lives:0, score:0, round:0, treasuresLeft:0, bombsLeft:0,
        gameOver:false, firstClick:true, cells:[], markMode:null,
        bombProtectionActive:false, treasureCounter:0 };

    function readSettings() {
        settings.ROWS = +sizeSet.value; settings.COLS = settings.ROWS;
        settings.TOTAL_TREASURES = +treasuresSet.value;
        settings.TOTAL_BOMBS = +bombsSet.value;
        state.lives = +livesSet.value;
    }

    function updateRuleText() {
        ruleLives.textContent     = livesSet.value;
        ruleBombs.textContent     = bombsSet.value;
        ruleTreasures.textContent = treasuresSet.value;
        ruleSize.textContent      = `${sizeSet.value}*${sizeSet.value}`;
    }

    function updateStats() {
        livesEl.textContent     = state.lives;
        scoreEl.textContent     = state.score;
        roundEl.textContent     = state.round;
        treasuresEl.textContent = state.treasuresLeft;
        bombsEl.textContent     = state.bombsLeft;
        gameOverEl.style.display = resetBtnShow.style.display = 'none';
    }

    function initGame() {
        // 检查配置
        if (sizeSet.value < 3)  { alert(`棋盘大小不能低于 3!`);  sizeSet.value = 3; }
        if (sizeSet.value > 20) { alert(`棋盘大小不能超过 20!`);  sizeSet.value = 20; }
        if (livesSet.value < 1) { livesSet.value = 1; }
        if (treasuresSet.value < 1) { treasuresSet.value = 1; }
        if (bombsSet.value < 1) { bombsSet.value = 1; }

        // 读取规则
        readSettings();
        updateRuleText();

        const max = settings.ROWS * settings.COLS - 1;
        if (settings.TOTAL_TREASURES + settings.TOTAL_BOMBS > max) {
            alert(`宝藏和炸弹的总数不能超过 ${max}!`);
            return;
        }

        // 状态重置
        Object.assign(state, {
            score:0, round:0, gameOver:false, firstClick:true,
            treasuresLeft:settings.TOTAL_TREASURES, bombsLeft:settings.TOTAL_BOMBS,
            bombProtectionActive:false, treasureCounter:0, markMode:null
        });

        [ markMineBtn, markEmptyBtn, markUnknownBtn ].forEach(b=>b.classList.remove('active'));

        updateStats();
        state.cells = createBoard(settings, state, handleLeftClick, handleRightRight);

        window.addEventListener('resize', () => {
            if (state.firstClick) resizeCells(state.cells, settings);
        });
    }

    function handleLeftClick(r,c) {
        if (state.gameOver) return;
        const cell = state.cells[r][c];
        if (cell.revealed || cell.flagged) return;

        if (state.firstClick) {
            state.firstClick = false;
            placeItems(state.cells, r, c, settings);
        }
        calculateCellValues(state.cells, settings);

        cell.revealed = true;
        cell.element.classList.add('revealed');

        const mode = modeSelect.value;

        if (cell.type==='treasure') {
            playSound(treasureSound);
            cell.element.textContent='⭐';
            state.score += 60; state.treasuresLeft--; state.treasureCounter++;
            if (mode==='survival' && state.treasureCounter%3===0) {
                state.lives++; livesEl.textContent=state.lives;
                playSound(lifeUpSound);
                cell.element.classList.add('life-up');
                setTimeout(()=>cell.element.classList.remove('life-up'),500);
            }
            state.bombProtectionActive = (mode==='survival'?false:state.bombProtectionActive);
            if (state.treasuresLeft===0) {
                state.gameOver=true;
                gameOverEl.textContent='恭喜你找到所有宝藏';
                gameOverEl.style.display=resetBtnShow.style.display='block';
                bgmAudio.pause();
                playSound(winSound);
                revealAll(state.cells, settings);
            }
        }
        else if (cell.type==='bomb') {
            playSound(bombSound);
            cell.element.textContent='💣';
            state.bombsLeft--;
            if (state.round>settings.SAFE_ROUNDS) {
                if (mode==='survival') {
                    if (!state.bombProtectionActive) { state.lives--; state.bombProtectionActive=true; }
                } else state.lives--;
                livesEl.textContent=state.lives;
                if (state.lives<=0) {
                    state.gameOver=true;
                    gameOverEl.textContent='游戏结束';
                    gameOverEl.style.display=resetBtnShow.style.display='block';
                    bgmAudio.pause();
                    playSound(loseSound);
                    revealAll(state.cells, settings);
                }
            }
        }
        else {
            cell.element.textContent=cell.value;
            cell.element.classList.add(`color-${cell.color.toLowerCase()}`);
            if (mode==='survival') state.bombProtectionActive=false;
        }

        if (!state.firstClick) {
            state.round++; roundEl.textContent=state.round;
        }
        scoreEl.textContent=state.score;
        treasuresEl.textContent=state.treasuresLeft;
        bombsEl.textContent=state.bombsLeft;
    }

    function handleRightRight(r,c, fromLeftMark) {
        if (state.gameOver) return;
        const cell = state.cells[r][c];
        if (cell.revealed) return;

        playSound(flagSound);

        if (fromLeftMark) {
            // 来自 “标记” 按钮模式
            const m = state.markMode;
            // 完全和原逻辑保持一致
            if (m==='mine') {
                if (!cell.flagged||cell.flagType!=='mine') {
                    cell.flagged=true; cell.flagType='mine';
                    cell.element.classList.add('flagged-mine');
                    cell.element.classList.remove('flagged-empty','flagged-unknown');
                    cell.element.textContent='🚩'; state.bombsLeft--;
                } else {
                    cell.flagged=false; cell.flagType=null;
                    cell.element.classList.remove('flagged-mine');
                    cell.element.textContent=''; state.bombsLeft++;
                }
            } else if (m==='empty') {
                if (!cell.flagged||cell.flagType!=='empty') {
                    if (cell.flagged&&cell.flagType==='mine') state.bombsLeft++;
                    cell.flagged=true; cell.flagType='empty';
                    cell.element.classList.add('flagged-empty');
                    cell.element.classList.remove('flagged-mine','flagged-unknown');
                    cell.element.textContent='—';
                } else {
                    cell.flagged=false; cell.flagType=null;
                    cell.element.classList.remove('flagged-empty');
                    cell.element.textContent='';
                }
            } else if (m==='unknown') {
                if (!cell.flagged||cell.flagType!=='unknown') {
                    if (cell.flagged&&cell.flagType==='mine') state.bombsLeft++;
                    cell.flagged=true; cell.flagType='unknown';
                    cell.element.classList.add('flagged-unknown');
                    cell.element.classList.remove('flagged-mine','flagged-empty');
                    cell.element.textContent='？';
                } else {
                    cell.flagged=false; cell.flagType=null;
                    cell.element.classList.remove('flagged-unknown');
                    cell.element.textContent='';
                }
            }
        } else {
            // 右键依次循环标记
            if (!cell.flagged) {
                cell.flagged=true; cell.flagType='mine';
                cell.element.classList.add('flagged-mine');
                cell.element.textContent='🚩'; state.bombsLeft--;
            }
            else if (cell.flagType==='mine') {
                cell.flagType='empty';
                cell.element.classList.replace('flagged-mine','flagged-empty');
                cell.element.textContent='—'; state.bombsLeft++;
            }
            else if (cell.flagType==='empty') {
                cell.flagType='unknown';
                cell.element.classList.replace('flagged-empty','flagged-unknown');
                cell.element.textContent='？';
            }
            else {
                cell.flagged=false; cell.flagType=null;
                cell.element.classList.remove('flagged-unknown');
                cell.element.textContent='';
            }
        }
        bombsEl.textContent=state.bombsLeft;
        treasuresEl.textContent=state.treasuresLeft;
    }

    // 标记按钮
    function makeMarkHandler(mode, btn) {
        return () => {
            if (state.markMode===mode) {
                state.markMode=null; btn.classList.remove('active');
            } else {
                state.markMode=mode;
                [markMineBtn,markEmptyBtn,markUnknownBtn].forEach(b=>b.classList.remove('active'));
                btn.classList.add('active');
            }
        };
    }

    // 绑定事件
    applyBtn .addEventListener('click', initGame);
    resetBtn .addEventListener('click', ()=>{ initGame(); });
    markMineBtn     .addEventListener('click', makeMarkHandler('mine',     markMineBtn));
    markEmptyBtn .addEventListener('click', makeMarkHandler('empty', markEmptyBtn));
    markUnknownBtn  .addEventListener('click', makeMarkHandler('unknown',  markUnknownBtn));
    modeSelect      .addEventListener('change', ()=>{
        if (modeSelect.value==='survival') livesSet.value = 1; else livesSet.value = 3;
        document.getElementById('mode-change-alert').style.display='block';
        initGame();
    });
    closeAlertBtn   .addEventListener('click', ()=>{ document.getElementById('mode-change-alert').style.display='none'; });
    bgmBtn          .addEventListener('click', () => toggleBGM(bgmBtn));
    sfxBtn          .addEventListener('click', () => toggleSFX(sfxBtn));

    // 一键地图配置
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sizeSet.value      = btn.dataset.size;
            treasuresSet.value = btn.dataset.treasures;
            bombsSet.value     = btn.dataset.bombs;
            livesSet.value     = btn.dataset.lives;
            if (modeSelect.value==='survival') livesSet.value = 1;
            initGame();
        });
    });

    initGame();
});

// ========== board ==========
function createBoard(settings, state, onLeft, onRight) {
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

function placeItems(cells, firstR, firstC, settings) {
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

function calculateCellValues(cells, settings) {
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
function revealAll(cells, settings) {
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
function resizeCells(cells, settings) {
    for(let r=0;r<settings.ROWS;r++){
        for(let c=0;c<settings.COLS;c++){
            const el=cells[r][c].element;
            const size = Math.min(Math.floor((Math.min(window.innerWidth,600)-40)/settings.COLS),40);
            el.style.width=el.style.height=`${size}px`;
        }
    }
}

// ========== sound ==========
const bgmAudio = new Audio('audio/bgm.mp3');
bgmAudio.loop = true; bgmAudio.volume = 0.2;

const bombSound      = new Audio('audio/bomb.mp3');
const treasureSound  = new Audio('audio/treasure.mp3');
const flagSound      = new Audio('audio/flag.mp3');
const winSound       = new Audio('audio/win.mp3');
const loseSound      = new Audio('audio/lose.mp3');
const lifeUpSound    = new Audio('audio/life_up.mp3');

[ bombSound, treasureSound, flagSound, winSound, loseSound, lifeUpSound ].forEach(s => s.volume = 0.3);

let bgmEnabled = false;
let sfxEnabled = true;

function playSound(sound) {
    if (!sfxEnabled) return;
    sound.currentTime = 0;
    sound.play().catch(() => {});
}

function toggleBGM(btn) {
    if (!bgmEnabled) {
        bgmAudio.play().catch(() => {});
        bgmEnabled = true;
        btn.textContent = '🎵 背景音乐: 开';
    } else {
        bgmAudio.pause();
        bgmEnabled = false;
        btn.textContent = '🎵 背景音乐: 关';
    }
}

function toggleSFX(btn) {
    sfxEnabled = !sfxEnabled;
    btn.textContent = `🔊 音效: ${sfxEnabled ? '开' : '关'}`;
}
