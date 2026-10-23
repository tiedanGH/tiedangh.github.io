
// 屏幕下方的方向按钮：默认手机布局显示、电脑隐藏（由样式按屏幕宽度决定），触摸过屏幕时自动显示
// 点击切换按钮后按选择显示或隐藏，不再回到默认；状态记录在浏览器中，再次打开页面时沿用
const DIRECTION_STORAGE_KEY = 'LongNightDirectionControls';

let directionMode = readDirectionMode();    // 'default' | 'show' | 'hide'
let touchDetected = false;                  // 本次打开页面后是否触摸过屏幕

function readDirectionMode() {
    try {
        const mode = localStorage.getItem(DIRECTION_STORAGE_KEY);
        return mode === 'show' || mode === 'hide' ? mode : 'default';
    } catch {
        return 'default';
    }
}

// 写入浏览器存储失败时只在本次打开的页面中生效
function setDirectionMode(mode) {
    directionMode = mode;
    try {
        localStorage.setItem(DIRECTION_STORAGE_KEY, mode);
    } catch (e) {
        console.warn('方向按钮状态保存失败:', e);
    }
    applyDirectionMode();
}

// 默认状态不加类名，由样式按屏幕宽度显示或隐藏
function applyDirectionMode() {
    const root = document.documentElement;
    root.classList.toggle('direction-controls-show', directionMode === 'show');
    root.classList.toggle('direction-controls-hide', directionMode === 'hide');
    updateDirectionToggle();
}

function isDirectionControlsVisible() {
    const controls = document.getElementById('direction-controls');
    return !!controls && getComputedStyle(controls).display !== 'none';
}

function hasTouchInput() {
    return touchDetected;
}

// 切换按钮跟随方向按钮当前是否显示：显示时高亮
function updateDirectionToggle() {
    const button = document.getElementById('direction-toggle-button');
    if (!button) return;
    const visible = isDirectionControlsVisible();
    button.classList.toggle('active', visible);
    button.title = visible ? '隐藏方向按钮' : '显示方向按钮';
}

function initDirectionToggle() {
    const button = document.getElementById('direction-toggle-button');
    if (!button) return;
    button.addEventListener('click', () => setDirectionMode(isDirectionControlsVisible() ? 'hide' : 'show'));
    window.addEventListener('resize', updateDirectionToggle);   // 默认状态下随屏幕宽度显示或隐藏
    updateDirectionToggle();
}

// 触摸过屏幕一定是触屏设备：标记为触屏，默认状态下自动显示方向按钮并记录，触摸切换按钮时交给按钮的点击处理
function onTouchInput(e) {
    if (e.type === 'pointerdown' && e.pointerType !== 'touch') return;
    touchDetected = true;
    document.documentElement.classList.add('touch-input');
    if (e.target.closest?.('#direction-toggle-button')) return;
    window.removeEventListener('touchstart', onTouchInput, true);
    window.removeEventListener('pointerdown', onTouchInput, true);
    if (directionMode === 'default') setDirectionMode('show');
}

window.addEventListener('touchstart', onTouchInput, { capture: true, passive: true });
window.addEventListener('pointerdown', onTouchInput, { capture: true, passive: true });
applyDirectionMode();
