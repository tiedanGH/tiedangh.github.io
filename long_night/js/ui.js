export const squareOptions = [
    ['空地', 'empty.png'],
    ['树丛', 'grass.png'],
    ['水洼', 'water.png'],
    ['传送门', 'portal.png'],
    ['陷阱', 'trap.png'],
    ['热源', 'heat.png'],
    ['箱子', 'box.png'],
    ['按钮', 'button.png'],
    ['逃生舱', 'exit.png'],
    ['未知', 'unknown.png'],
];
export const wallOptions = [
    ['空', '#FFFFFF'],
    ['普通', '#000000'],
    ['门', '#EA68A2'],
    ['未知', '#D9D9D9'],
];

export function uiCellEvents(map) {
    map.container.addEventListener('contextmenu', e => e.preventDefault());
    map.container.addEventListener('mousedown', e => {
        removeSelector();
        const cell = e.target.closest('.cell');
        if (!cell || cell.classList.contains('center')) return;
        const type = cell.dataset.type;

        function togglePlayer() {
            const p = cell.querySelector('.player');
            if (p) {
                p.remove();
            } else {
                const mark = document.createElement('div');
                mark.className = 'player';
                mark.innerText = '🧍';
                mark.style.pointerEvents = 'none';
                mark.style.position = 'absolute';
                mark.style.top = '50%';
                mark.style.left = '50%';
                mark.style.transform = 'translate(-50%, -50%)';
                cell.appendChild(mark);
            }
        }

        // 左键：方块或墙
        if (e.button === 0) {
            if (type === 'square') {
                showSelector(e, squareOptions, imgFile => {
                    cell.style.backgroundImage = `url('./img/${imgFile}')`;
                }, togglePlayer);
            } else if (type === 'wall') {
                showSelector(e, wallOptions, c => {
                    cell.style.backgroundColor = c;
                });
            }
        }
        // 右键：切换人物
        if (e.button === 2 && type === 'square') {
            e.preventDefault();
            togglePlayer();
        }
    });
}

function showSelector(e, options, callback, action) {
    const sel = document.createElement('div');
    sel.className = 'selector';
    sel.style.left = e.clientX + 'px';
    sel.style.top = e.clientY + 'px';

    const ul = document.createElement('ul');
    ul.className = 'option-list';

    options.forEach(([name, val]) => {
        const li = document.createElement('li');
        li.className = 'option-item';

        if (val.endsWith('.png') || val.endsWith('.jpg')) {
            const img = document.createElement('img');
            img.className = 'color-box';
            img.src = `./img/${val}`;
            img.alt = name;
            li.appendChild(img);
        } else {
            const box = document.createElement('span');
            box.className = 'color-box';
            box.style.backgroundColor = val;
            li.appendChild(box);
        }

        li.appendChild(document.createTextNode(name));
        li.onclick = () => {
            callback(val);
            removeSelector();
        };
        ul.appendChild(li);
    });

    if (typeof action === 'function') {
        const li = document.createElement('li');
        li.className = 'option-item';
        const icon = document.createElement('span');
        icon.innerText = '🧍';
        icon.style.marginRight = '4px';
        li.appendChild(icon);
        li.appendChild(document.createTextNode('标记玩家'));
        li.onclick = () => {
            action();
            removeSelector();
        };
        ul.appendChild(li);
    }

    sel.appendChild(ul);
    document.body.appendChild(sel);
}

function removeSelector() {
    const ex = document.querySelector('.selector');
    if (ex) ex.remove();
}
