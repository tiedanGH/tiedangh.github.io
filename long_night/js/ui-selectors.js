// ===== 颜色转换工具 =====
function cpHsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r, g, b;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function cpRgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return [h, max === 0 ? 0 : d / max, max];
}

function cpRgbToHex(rgb) {
    return '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function cpHexToRgb(hex) {
    const s = hex.replace(/^#/, '');
    if (!/^[0-9A-F]{6}$/i.test(s)) return null;
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const cpClamp = (n, min, max) => Math.min(max, Math.max(min, n));

// 通用颜色输入函数：可拖动取色器（SV面板 + 色相条）
function createCustomColorInput(title, onConfirm) {
    let hue = 0, sat = 1, val = 1;
    let currentColor = '#FF0000';

    const inputContainer = document.createElement('div');
    inputContainer.className = 'color-input-container color-picker';

    const titleEl = document.createElement('div');
    titleEl.className = 'cp-title';
    titleEl.textContent = title;

    // 饱和度 / 明度 面板
    const svPanel = document.createElement('div');
    svPanel.className = 'cp-sv';
    const svThumb = document.createElement('div');
    svThumb.className = 'cp-thumb cp-sv-thumb';
    svPanel.appendChild(svThumb);

    // 色相条
    const hueBar = document.createElement('div');
    hueBar.className = 'cp-hue';
    const hueThumb = document.createElement('div');
    hueThumb.className = 'cp-thumb cp-hue-thumb';
    hueBar.appendChild(hueThumb);

    // 底部：当前颜色 + HEX + 确定
    const footer = document.createElement('div');
    footer.className = 'cp-footer';
    const swatch = document.createElement('div');
    swatch.className = 'cp-swatch';
    const hexWrap = document.createElement('div');
    hexWrap.className = 'cp-hex-wrap';
    const hash = document.createElement('span');
    hash.className = 'cp-hash';
    hash.textContent = '#';
    const colorInput = document.createElement('input');
    colorInput.type = 'text';
    colorInput.className = 'cp-hex';
    colorInput.maxLength = 6;
    colorInput.spellcheck = false;
    hexWrap.appendChild(hash);
    hexWrap.appendChild(colorInput);
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'text-confirm-btn';
    confirmBtn.textContent = '确定';
    footer.appendChild(swatch);
    footer.appendChild(hexWrap);
    footer.appendChild(confirmBtn);

    // 同步界面；syncHex=false 时不回写输入框，避免打字时光标跳动
    function render(syncHex = true) {
        currentColor = cpRgbToHex(cpHsvToRgb(hue, sat, val));
        svPanel.style.backgroundColor = cpRgbToHex(cpHsvToRgb(hue, 1, 1));
        svThumb.style.left = (sat * 100) + '%';
        svThumb.style.top = ((1 - val) * 100) + '%';
        svThumb.style.backgroundColor = currentColor;
        hueThumb.style.left = (hue / 360 * 100) + '%';
        swatch.style.backgroundColor = currentColor;
        if (syncHex) colorInput.value = currentColor.slice(1);
    }

    // 拖动：按下即取色，拖动过程实时更新（指针捕获，支持鼠标与触摸）
    function makeDraggable(el, onMove) {
        const apply = (e) => {
            const rect = el.getBoundingClientRect();
            onMove(
                cpClamp((e.clientX - rect.left) / rect.width, 0, 1),
                cpClamp((e.clientY - rect.top) / rect.height, 0, 1)
            );
            render();
        };
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            apply(e);
            // 监听 window，保证指针拖出控件范围后仍能继续取色
            const move = (ev) => { ev.preventDefault(); apply(ev); };
            const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
        });
    }

    makeDraggable(svPanel, (x, y) => { sat = x; val = 1 - y; });
    makeDraggable(hueBar, (x) => { hue = x * 360; });

    // HEX 手动输入
    colorInput.addEventListener('input', () => {
        const cleaned = colorInput.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().slice(0, 6);
        colorInput.value = cleaned;
        const rgb = cpHexToRgb(cleaned);
        if (!rgb) return;
        const hsv = cpRgbToHsv(rgb[0], rgb[1], rgb[2]);
        if (hsv[1] > 0) hue = hsv[0];   // 灰阶时保留当前色相，避免拖动点跳回红色
        sat = hsv[1];
        val = hsv[2];
        render(false);
    });

    const confirm = () => {
        onConfirm(currentColor);
        if (document.body.contains(inputContainer)) {
            document.body.removeChild(inputContainer);
        }
    };
    confirmBtn.onclick = confirm;
    colorInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') confirm();
    });

    inputContainer.appendChild(titleEl);
    inputContainer.appendChild(svPanel);
    inputContainer.appendChild(hueBar);
    inputContainer.appendChild(footer);

    render();

    return {
        container: inputContainer,
        input: colorInput,
        focus: () => colorInput.focus()
    };
}

// 通用自定义文本输入函数
function createCustomTextInput(title, initialValue, onConfirm, options = {}) {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'color-input-container';

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.fontWeight = 'bold';

    const row = document.createElement('div');
    row.className = 'color-preview-box';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'text-attach-input';
    textInput.placeholder = options.placeholder || '输入文本';
    textInput.maxLength = options.maxLength || 12;
    if (options.wide) textInput.classList.add('path-input');
    textInput.value = initialValue || '';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'text-confirm-btn';
    confirmBtn.textContent = '确定';

    const confirm = () => {
        const value = textInput.value.trim();
        if (!value) return;
        onConfirm(value);
        if (document.body.contains(inputContainer)) {
            document.body.removeChild(inputContainer);
        }
    };

    confirmBtn.onclick = confirm;
    textInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') confirm();
    });

    row.appendChild(textInput);
    row.appendChild(confirmBtn);
    inputContainer.appendChild(titleEl);
    inputContainer.appendChild(row);

    return {
        container: inputContainer,
        input: textInput,
        focus: () => textInput.focus()
    };
}

// 选择器位置调整函数：非移动端在点击位置显示，移动端在css强制居中
function positionSelector(container, targetElement, isMobile) {
    if (isMobile) return;

    const rect = targetElement.getBoundingClientRect();
    let left = rect.right + 5;
    let top = rect.top;
    // 确保不超出屏幕
    setTimeout(() => {
        const containerRect = container.getBoundingClientRect();
        if (left + containerRect.width > window.innerWidth) {
            left = rect.left - containerRect.width - 5;
        }
        if (top + containerRect.height > window.innerHeight) {
            top = window.innerHeight - containerRect.height - 10;
        }
        if (top < 10) {
            top = 10;
        }
        container.style.left = left + 'px';
        container.style.top = top + 'px';
        container.style.transform = 'none';
    }, 0);
}

// 创建通用选项列表项
function createOptionItem(name, imageSrc, onClick, imageClass = 'square-box') {
    const li = document.createElement('li');
    li.className = 'option-item';

    const img = document.createElement('img');
    img.className = imageClass;
    img.src = imageSrc;

    li.appendChild(img);
    li.appendChild(document.createTextNode(name));

    li.onclick = onClick;
    return li;
}

// 创建自定义选项
function createCustomOption(cell, event, groupType) {
    const li = document.createElement('li');
    li.className = 'option-item custom-option';

    const customImg = document.createElement('img');
    customImg.className = 'square-box';
    customImg.src = './img/custom.png';

    li.appendChild(customImg);
    li.appendChild(document.createTextNode('自定义'));

    li.onclick = (e) => {
        const title = groupType === 'grid' ? '自定义地形颜色' : (groupType === 'attach' ? '自定义附着颜色' : '自定义墙壁颜色');

        const colorInput = createCustomColorInput(title, (color) => {
            if (groupType === 'grid') {
                // 自定义地形
                cell.style.backgroundImage = 'none';
                cell.style.backgroundColor = color;
            } else if (groupType === 'attach') {
                // 自定义附着
                const layer = getAttachmentLayer(cell);
                layer.classList.add('custom-attach-circle');
                layer.style.backgroundImage = 'none';
                layer.style.backgroundColor = color;
            } else if (groupType === 'wall') {
                // 自定义墙壁
                cell.style.backgroundImage = 'none';
                cell.style.backgroundColor = color;
            }
            refreshMarkerColors(cell);  // 刷新标记颜色
            saveHistory();
            removeSelector();
        });

        positionSelector(colorInput.container, e.target, window.innerWidth <= 600);

        document.body.appendChild(colorInput.container);
        colorInput.focus();

        // 点击外部关闭
        const handleOutsideClick = (event) => {
            if (!colorInput.container.contains(event.target)) {
                if (document.body.contains(colorInput.container)) {
                    document.body.removeChild(colorInput.container);
                }
                document.removeEventListener('mousedown', handleOutsideClick);
            }
        };

        setTimeout(() => {
            document.addEventListener('mousedown', handleOutsideClick);
        }, 0);
    };

    return li;
}

// 创建自定义文本选项（仅附着组）
function createCustomTextOption(cell, event) {
    const li = document.createElement('li');
    li.className = 'option-item custom-option';

    const box = document.createElement('span');
    box.className = 'text-box';
    box.textContent = 'A';

    li.appendChild(box);
    li.appendChild(document.createTextNode('文本'));

    li.onclick = (e) => {
        const textInput = createCustomTextInput('自定义文本', getCurrentAttachText(cell), (text) => {
            setCustomTextAttachment(cell, text);
            refreshMarkerColors(cell);
            saveHistory();
            removeSelector();
        });

        positionSelector(textInput.container, e.currentTarget, window.innerWidth <= 600);

        document.body.appendChild(textInput.container);
        textInput.focus();

        // 点击外部关闭
        const handleOutsideClick = (event) => {
            if (!textInput.container.contains(event.target)) {
                if (document.body.contains(textInput.container)) {
                    document.body.removeChild(textInput.container);
                }
                document.removeEventListener('mousedown', handleOutsideClick);
            }
        };

        setTimeout(() => {
            document.addEventListener('mousedown', handleOutsideClick);
        }, 0);
    };

    return li;
}

// 创建选项组
function createOptionGroup(titleText, options, cell, event, groupType = 'grid') {
    const group = document.createElement('div');
    group.style.flex = '1';
    group.style.padding = '0 10px';

    const title = document.createElement('div');
    title.textContent = titleText;
    title.className = 'option-title';
    const ul = document.createElement('ul');
    ul.className = 'option-list';

    // 添加常规选项
    options.forEach(([name, val]) => {
        const onClick = () => {
            if (groupType === 'grid') {
                cell.style.backgroundColor = '';
                cell.style.backgroundImage = `url('./img/${val}')`;
            } else if (groupType === 'attach') {
                const layer = getAttachmentLayer(cell);
                layer.style.backgroundColor = '';
                layer.style.backgroundImage = `url('./img/${val}')`;
            }
            refreshMarkerColors(cell);  // 刷新标记颜色
            saveHistory();
            removeSelector();
        };

        const li = createOptionItem(name, `./img/${val}`, onClick);
        ul.appendChild(li);
    });
    // 添加自定义选项
    const customLi = createCustomOption(cell, event, groupType);
    ul.appendChild(customLi);
    // 附着组额外添加“自定义文本”选项（位于最下方）
    if (groupType === 'attach') {
        ul.appendChild(createCustomTextOption(cell, event));
    }

    group.appendChild(title);
    group.appendChild(ul);
    return group;
}

// 地形与附着选择器
function showSquareAttachSelector(e, cell) {
    const sel = document.createElement('div');
    sel.className = 'selector';
    sel.style.left = e.clientX + 'px';
    sel.style.top = e.clientY + 'px';
    sel.style.display = 'flex';

    // 创建地形组
    const gridGroup = createOptionGroup('地形', gridOptions, cell, e, 'grid');
    // 创建附着组
    const attachGroup = createOptionGroup('附着', attachOptions, cell, e, 'attach');

    sel.appendChild(gridGroup);
    sel.appendChild(attachGroup);
    document.body.appendChild(sel);

    setTimeout(() => {
        adjustElementPosition(sel, e);
    }, 0);
}

/* ========== 墙壁快速放置 ========== */
const WALL_QUICK_PATTERNS = [
    { label: '左上', sides: ['left', 'top'] },
    { label: '右上', sides: ['right', 'top'] },
    { label: '左下', sides: ['left', 'bottom'] },
    { label: '右下', sides: ['right', 'bottom'] },
    { label: '上下', sides: ['top', 'bottom'] },
    { label: '左右', sides: ['left', 'right'] },
    { label: '四空', sides: [] },
    { label: '四墙', sides: ['top', 'bottom', 'left', 'right'] },
    { label: '缺上', sides: ['left', 'right', 'bottom'] },
    { label: '缺下', sides: ['left', 'right', 'top'] },
    { label: '缺左', sides: ['top', 'bottom', 'right'] },
    { label: '缺右', sides: ['top', 'bottom', 'left'] },
];

// 方块四周墙壁相对方块的坐标偏移
const WALL_SIDE_OFFSET = {
    top:    [0, -1],
    bottom: [0, 1],
    left:   [-1, 0],
    right:  [1, 0],
};

function clearQuickTargetHighlight() {
    document.querySelectorAll('.quick-target-highlight').forEach(cell => {
        cell.classList.remove('quick-target-highlight');
    });
}

// 目标格子：竖墙取右侧，横墙取下方
function getQuickTargetSquare(wallCell) {
    const i = parseInt(wallCell.dataset.i, 10);
    const j = parseInt(wallCell.dataset.j, 10);
    const isVertical = i % 2 === 1;
    const ti = isVertical ? i + 1 : i;
    const tj = isVertical ? j : j + 1;

    const { size, wall } = getCellMetrics();
    currentMap.ensureCell(ti, tj, size, wall);
    const cell = currentMap.cells.get(`${ti},${tj}`);
    return cell?.dataset.type === 'square' ? { cell, i: ti, j: tj } : null;
}

function isUnknownTerrain(cell) {
    const bgColor = cell.style.backgroundColor;
    if (bgColor && bgColor !== 'transparent') return false;   // 自定义地形颜色
    const bgImage = cell.style.backgroundImage;
    return !bgImage || bgImage === 'none' || bgImage.includes('unknown.png');
}

// 按图案设置目标格子四周墙壁：按墙壁优先级保留更高者
function applyWallPattern(target, sides) {
    // 未知地形先变为空地
    if (isUnknownTerrain(target.cell)) {
        target.cell.style.backgroundColor = '';
        target.cell.style.backgroundImage = `url('./img/empty.png')`;
        refreshMarkerColors(target.cell);
    }

    Object.entries(WALL_SIDE_OFFSET).forEach(([side, [di, dj]]) => {
        setWallByPriority(target.i + di, target.j + dj, sides.includes(side) ? '普通' : '空');
    });
}

// 写入墙壁：仅当新墙壁优先级更高时才覆盖
function setWallByPriority(wi, wj, type) {
    const { size, wall } = getCellMetrics();
    currentMap.ensureCell(wi, wj, size, wall);
    const wallCell = currentMap.cells.get(`${wi},${wj}`);
    if (!wallCell || wallCell.dataset.type !== 'wall') return;
    if (compareWallPriority(getCurrentWallType(wallCell), type) !== type) return;

    const orientation = wallCell.classList.contains('horizontal') ? 'horizontal' : 'vertical';
    wallCell.style.backgroundColor = '';
    wallCell.style.backgroundImage = `url('${getWallImage(type, orientation)}')`;
}

function createQuickPatternIcon(sides) {
    const icon = document.createElement('div');
    icon.className = 'quick-icon';
    ['top', 'right', 'bottom', 'left'].forEach(side => {
        const prop = `border${side[0].toUpperCase()}${side.slice(1)}Color`;
        icon.style[prop] = sides.includes(side) ? '#000' : '#e3e3e3';
    });
    return icon;
}

// 二级菜单：快速放置 2墙 / 3墙
function showWallQuickMenu(e, wallCell) {
    document.querySelectorAll('.wall-quick-panel').forEach(el => el.remove());
    clearQuickTargetHighlight();

    const target = getQuickTargetSquare(wallCell);
    if (!target) return;

    // 高亮当前作用的格子，关闭或选择后取消
    target.cell.classList.add('quick-target-highlight');

    const panel = document.createElement('div');
    panel.className = 'selector wall-quick-panel';
    panel.style.left = e.clientX + 'px';
    panel.style.top = e.clientY + 'px';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = '快速放置';
    panel.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'quick-grid';

    WALL_QUICK_PATTERNS.forEach(pattern => {
        const item = document.createElement('div');
        item.className = 'quick-item';

        const label = document.createElement('span');
        label.textContent = pattern.label;

        item.appendChild(createQuickPatternIcon(pattern.sides));
        item.appendChild(label);
        item.onclick = () => {
            applyWallPattern(target, pattern.sides);
            saveHistory();
            removeSelector();
        };

        grid.appendChild(item);
    });

    panel.appendChild(grid);

    document.body.appendChild(panel);

    setTimeout(() => {
        adjustElementPosition(panel, e);
    }, 0);
}

// 墙壁选择器
function showWallSelector(e, cell, orientation) {
    const sel = document.createElement('div');
    sel.className = 'selector';
    sel.style.left = e.clientX + 'px';
    sel.style.top = e.clientY + 'px';

    const title = document.createElement('div');
    title.className = 'option-title wall-title-row';

    const titleText = document.createElement('span');
    titleText.textContent = '墙壁';

    const quickBtn = document.createElement('button');
    quickBtn.type = 'button';
    quickBtn.className = 'wall-quick-btn';
    quickBtn.textContent = '+';
    quickBtn.title = '快速放置多墙';
    quickBtn.onclick = ev => {
        ev.stopPropagation();
        showWallQuickMenu(ev, cell);
    };

    title.appendChild(titleText);
    title.appendChild(quickBtn);

    const ul = document.createElement('ul');
    ul.className = 'option-list';

    // 添加预设墙壁选项
    wallOptions.forEach(([name, hImg, vImg]) => {
        const li = document.createElement('li');
        li.className = 'option-item';

        const img = document.createElement('img');
        img.className = 'wall-box';
        img.src = `./img/${orientation === 'horizontal' ? hImg : vImg}`;

        li.appendChild(img);
        li.appendChild(document.createTextNode(name));

        li.onclick = () => {
            const wallImage = getWallImage(name, orientation);
            cell.style.backgroundImage = `url('${wallImage}')`;
            cell.style.backgroundColor = '';
            saveHistory();
            removeSelector();
        };

        ul.appendChild(li);
    });
    // 添加自定义墙壁选项
    const customLi = createCustomOption(cell, e, 'wall');
    ul.appendChild(customLi);

    sel.appendChild(title);
    sel.appendChild(ul);
    document.body.appendChild(sel);

    setTimeout(() => {
        adjustElementPosition(sel, e);
    }, 0);
}

/* ========== 快捷路径：按主游戏赛况文本绘制已知信息 ========== */
const PATH_DIR_DELTA = {
    '↑': [0, -2],
    '↓': [0, 2],
    '←': [-2, 0],
    '→': [2, 0],
};

// 解析括号片段：区分移动、撞墙与终点标记
function interpretPathToken(inner) {
    const lead = PATH_DIR_DELTA[inner[0]] ? inner[0] : null;

    if (inner.includes('撞')) return lead ? [{ type: 'hit', dir: lead }] : [];
    if (inner.includes('逃生')) return [{ type: 'mark', terrain: '逃生舱' }];
    if (inner.includes('陷阱')) return [{ type: 'mark', terrain: '陷阱' }];
    if (inner.includes('热源')) return [{ type: 'mark', terrain: '热源' }];

    // [热浪] [传送] (停止) (捕捉) 等不含方向的片段直接忽略
    if (!lead) return [];

    let terrain = null;
    if (inner.includes('浆果丛')) terrain = '浆果丛';
    else if (inner.includes('沙沙')) terrain = '树丛';
    else if (inner.includes('啪嗒') || inner.includes('啪啪')) terrain = '水洼';
    return [{ type: 'move', dir: lead, terrain }];
}

// 从赛况文本中提取全部方向与已知信息
function parsePathRecord(text) {
    const ops = [];
    let i = 0;

    while (i < text.length) {
        const ch = text[i];

        // 方向箭头，支持合并写法 ↑×5（兼容旧版*）
        if (PATH_DIR_DELTA[ch]) {
            const merged = /^[×*](\d+)/.exec(text.slice(i + 1));
            const count = merged ? parseInt(merged[1], 10) : 1;
            for (let k = 0; k < count; k++) ops.push({ type: 'move', dir: ch, terrain: null });
            i += 1 + (merged ? merged[0].length : 0);
            continue;
        }

        // 括号片段，[] 可能嵌套（如 [↑掩盖[沙沙]]）
        if (ch === '[' || ch === '(') {
            const close = ch === '[' ? ']' : ')';
            let depth = 0;
            let j = i;
            for (; j < text.length; j++) {
                if (text[j] === ch) depth++;
                else if (text[j] === close && --depth === 0) break;
            }
            if (j >= text.length) { i++; continue; }   // 括号未闭合
            ops.push(...interpretPathToken(text.slice(i + 1, j)));
            i = j + 1;
            continue;
        }

        i++;    // 回合标题等其余内容跳过
    }

    return ops;
}

function setPathTerrain(i, j, name, onlyIfUnknown) {
    const { size, wall } = getCellMetrics();
    currentMap.ensureCell(i, j, size, wall);
    const cell = currentMap.cells.get(`${i},${j}`);
    if (!cell || cell.dataset.type !== 'square') return;
    if (onlyIfUnknown && !isUnknownTerrain(cell)) return;

    const file = gridOptions.find(([n]) => n === name)?.[1];
    if (!file) return;
    cell.style.backgroundColor = '';
    cell.style.backgroundImage = `url('./img/${file}')`;
    refreshMarkerColors(cell);
}

// 以选中格为起点绘制整条路径
function applyPathRecord(startCell, ops) {
    let i = parseInt(startCell.dataset.i, 10);
    let j = parseInt(startCell.dataset.j, 10);

    setPathTerrain(i, j, '空地', true);

    ops.forEach(op => {
        const delta = PATH_DIR_DELTA[op.dir];

        if (op.type === 'hit') {
            // 撞墙：原地不动，在该方向补一堵普通墙
            setWallByPriority(i + delta[0] / 2, j + delta[1] / 2, '普通');
            return;
        }
        if (op.type === 'mark') {
            setPathTerrain(i, j, op.terrain, false);
            return;
        }

        setWallByPriority(i + delta[0] / 2, j + delta[1] / 2, '空');
        i += delta[0];
        j += delta[1];
        setPathTerrain(i, j, op.terrain || '空地', !op.terrain);
    });
}

// 玩家菜单中的“赛况快捷路径”入口
function showPathInput(e, cell) {
    const input = createCustomTextInput('赛况快捷路径', '', text => {
        const ops = parsePathRecord(text);
        if (ops.length) {
            applyPathRecord(cell, ops);
            saveHistory();
        }
        removeSelector();
    }, { maxLength: 4000, wide: true, placeholder: '粘贴赛况，例：→→↓↑[↑沙沙]↑(逃生)' });

    positionSelector(input.container, e.target, window.innerWidth <= 600);
    document.body.appendChild(input.container);
    input.focus();

    const handleOutsideClick = ev => {
        if (!input.container.contains(ev.target)) {
            input.container.remove();
            document.removeEventListener('mousedown', handleOutsideClick);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', handleOutsideClick), 0);
}

// 玩家标记选择器
function showPlayerSelector(e, onSelect, cell) {
    const panel = document.createElement('div');
    panel.className = 'selector';
    panel.style.left = `${e.clientX}px`;
    panel.style.top = `${e.clientY}px`;

    function createGrid(marginTop = '0px') {
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
        grid.style.gap = '4px';
        grid.style.marginTop = marginTop;
        return grid;
    }

    const title = document.createElement('div');
    title.textContent = '标记玩家';
    title.className = 'option-title';

    // emoji标记
    const special = createGrid('10px');
    markerEmojis.forEach(({emoji, color, name}) => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.style.color = color;
        btn.title = name; // 悬停提示
        btn.onclick = () => {
            onSelect(emoji, color);
            saveHistory(); // 保存历史
        };
        special.appendChild(btn);
    });

    const numbers = createGrid('10px');
    for (let i = 0; i <= 7; i++) {
        const ch = num[i];
        const btn = document.createElement('button');
        btn.textContent = ch;
        btn.onclick = () => {
            onSelect(ch);
            saveHistory(); // 保存历史
        };
        numbers.appendChild(btn);
    }

    const clearBtn = document.createElement('button');
    clearBtn.textContent = '清除标记';
    clearBtn.className = 'clear-btn';
    clearBtn.style.width = '100px';
    clearBtn.onclick = () => {
        onSelect('__CLEAR__');
        saveHistory(); // 保存历史
    };

    panel.appendChild(title);
    panel.appendChild(special);
    panel.appendChild(numbers);

    panel.appendChild(clearBtn);

    // 赛况快捷路径：按主游戏赛况文本绘制路径
    if (cell) {
        const pathBtn = document.createElement('button');
        pathBtn.textContent = '赛况快捷路径';
        pathBtn.className = 'path-btn';
        pathBtn.onclick = ev => {
            ev.stopPropagation();
            showPathInput(ev, cell);
        };
        panel.appendChild(pathBtn);
    }
    document.body.appendChild(panel);

    setTimeout(() => {
        adjustElementPosition(panel, e);
    }, 0);
}

function removeSelector() {
    document.querySelectorAll('.selector').forEach(el => el.remove());
    clearQuickTargetHighlight();
}
