
function buildGrid(board, msg, n) {
    const gap = window.innerWidth > 600 ? 40 : 35;
    msg.textContent = '';
    board.innerHTML = '';
    board.style.gridTemplateColumns = `repeat(${n + 2}, ${gap}px)`;

    for (let row = 0; row < n + 2; row++) {
        for (let col = 0; col < n + 2; col++) {
            const isTop = row === 0;
            const isBottom = row === n + 1;
            const isLeft = col === 0;
            const isRight = col === n + 1;

            const isCorner = (isTop || isBottom) && (isLeft || isRight);
            if (isCorner) {
                const corner = document.createElement('div');
                corner.classList.add('coord-cell');
                board.appendChild(corner);
                continue;
            }
            if (isTop || isBottom) {
                const letter = document.createElement('div');
                letter.textContent = String.fromCharCode(64 + col);
                letter.classList.add('coord-cell');
                board.appendChild(letter);
                continue;
            }
            if (isLeft || isRight) {
                const number = document.createElement('div');
                number.textContent = row.toString();
                number.classList.add('coord-cell');
                board.appendChild(number);
                continue;
            }

            // 中心格子
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.maxLength = 4;
            inp.dataset.index = ((row - 1) * n + (col - 1)).toString();
            inp.addEventListener('click', () => {
                inp.value = '';
                inp.classList.remove('known', 'marked', 'prob', 'highlight');
            });
            inp.addEventListener('input', () => {
                const v = inp.value.toUpperCase();
                inp.value = /^[0-9*]*$/.test(v) ? v : '';
            });

            board.appendChild(inp);
        }
    }
}

function applyBoard(board, n) {
    const gap = window.innerWidth > 600 ? 40 : 35;
    board.style.gridTemplateColumns = `repeat(${n + 2}, ${gap}px)`;
}
