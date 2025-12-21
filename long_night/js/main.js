
document.addEventListener('DOMContentLoaded', async () => {
    await loadBlocks();
    const container = document.getElementById('map-container');
    const gameMap = new InfiniteMap(container);

    window.playerCell = null;

    // 历史管理器
    window.historyManager = new HistoryManager(gameMap);

    uiCellEvents(gameMap);
    blockCellEvent(gameMap);

    // 帮助弹窗
    const closeAlertBtn = document.getElementById('close-alert');
    closeAlertBtn.addEventListener('click', () => {
        document.getElementById('help-container').style.display = 'none';
    });

    const helpButton = document.getElementById('help-button');
    helpButton.addEventListener('click', () => {
        document.getElementById('help-container').style.display = 'block';
    });
});
