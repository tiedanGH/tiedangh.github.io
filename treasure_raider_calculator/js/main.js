
document.addEventListener('DOMContentLoaded', () => {
    const sizeInput = document.getElementById('sizeInput');
    const totalInput = document.getElementById('totalInput');
    const calcBtn = document.getElementById('calcBtn');
    const board = document.getElementById('boardContainer');
    const msg = document.getElementById('message');

    // 初始构建网格
    buildGrid(board, msg, parseInt(sizeInput.value, 10));

    // 适配窗口大小
    window.addEventListener('resize', () => {
        applyBoard(board, parseInt(sizeInput.value, 10));
    });

    // 事件监听
    sizeInput.addEventListener('change', () => {
        buildGrid(board, msg, parseInt(sizeInput.value, 10));
    });

    // 设置计算器
    setupCalculator({
        sizeInput,
        totalInput,
        calcBtn,
        board,
        msg,
        buildGrid: (n) => buildGrid(board, msg, n)
    });
});
