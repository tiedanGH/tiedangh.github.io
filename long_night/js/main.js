import { InfiniteMap } from './map.js';
import { uiCellEvents } from './ui.js';
import { loadBlocks, blockCellEvent } from './block.js';

document.addEventListener('DOMContentLoaded', async () => {
    await loadBlocks();
    const container = document.getElementById('map-container');
    const gameMap = new InfiniteMap(container);

    uiCellEvents(gameMap);
    blockCellEvent(gameMap)

    const closeAlertBtn = document.getElementById('close-alert');
    closeAlertBtn.addEventListener('click', ()=>{
        document.getElementById('mode-change-alert').style.display='none';
    });

    const helpButton = document.getElementById('help-button');
    helpButton.addEventListener('click', ()=>{
        document.getElementById('mode-change-alert').style.display='block';
    });
});