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
function createCustomTextInput(title, initialValue, onConfirm) {
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
    textInput.placeholder = '输入文本';
    textInput.maxLength = 12;
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

// 墙壁选择器
function showWallSelector(e, cell, orientation) {
    const sel = document.createElement('div');
    sel.className = 'selector';
    sel.style.left = e.clientX + 'px';
    sel.style.top = e.clientY + 'px';

    const title = document.createElement('div');
    title.textContent = '墙壁类型';
    title.className = 'option-title';

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

// 玩家标记选择器
function showPlayerSelector(e, onSelect) {
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
    document.body.appendChild(panel);

    setTimeout(() => {
        adjustElementPosition(panel, e);
    }, 0);
}

function removeSelector() {
    const ex = document.querySelector('.selector');
    if (ex) ex.remove();
}
