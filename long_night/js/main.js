import { InfiniteMap } from './map.js';
import { bindCellEvents } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('map-container');
    const gameMap = new InfiniteMap(container);
    bindCellEvents(gameMap);
});
