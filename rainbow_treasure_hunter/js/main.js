import { createBoard, placeItems, calculateCellValues, revealAll, resizeCells } from './board.js';
import { playSound, bgmAudio, bombSound, treasureSound, flagSound, winSound, loseSound, lifeUpSound, toggleBGM, toggleSFX } from './sound.js';

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
