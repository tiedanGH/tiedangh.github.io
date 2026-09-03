
// 拖动判定阈值：位移超过该值视为拖动地图，不触发点选
const EDIT_DRAG_THRESHOLD = 5;

class EditModeManager {
    constructor(map) {
        this.map = map;
        this.button = document.getElementById('edit-mode-button');
        this.active = false;

        this.stage = 'idle'; // idle | selecting | selection-ready | choosing-target | preview-ready
        this.draggingSelection = false;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.selectedRange = null;

        // 区分“拖动地图”与“点击选点”
        this.pointerDownPos = null;
        this.pointerMoved = false;

        this.payload = [];
        this.sourceAnchor = null;
        this.previewAnchor = null;
        this.previewDelta = null;

        this.confirmBar = this.createConfirmBar();
        this.banner = this.createBanner();

        this.init();
    }

    init() {
        if (!this.button) return;

        this.button.addEventListener('click', () => {
            if (this.active) this.exitMode();
            else this.enterMode();
        });

        this.map.container.addEventListener('mousedown', e => this.onMouseDown(e));
        window.addEventListener('mousemove', e => this.onMouseMove(e));
        window.addEventListener('mouseup', e => this.onMouseUp(e));
        this.map.container.addEventListener('click', e => this.onClickTarget(e));

        this.map.container.addEventListener('touchstart', e => this.onTouchStart(e), { passive: false });
        window.addEventListener('touchmove', e => this.onTouchMove(e), { passive: false });
        window.addEventListener('touchend', e => this.onTouchEnd(e));
        window.addEventListener('touchcancel', e => this.onTouchEnd(e));

        document.addEventListener('keydown', e => {
            if (e.key.toLowerCase() === 'm' && !this.isTypingTarget(e.target)) {
                e.preventDefault();
                if (this.active) this.exitMode();
                else this.enterMode();
                return;
            }

            if (!this.active) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.stage === 'preview-ready') {
                    this.cancelTargetPreview();
                } else if (this.stage === 'choosing-target' || this.stage === 'selection-ready') {
                    this.backToSelection();
                } else {
                    this.exitMode();
                }
                return;
            }

            if (e.key === 'Enter') {
                if (this.stage === 'selection-ready') this.confirmSelection();
                else if (this.stage === 'preview-ready') this.confirmMove();
            }
        });
    }

    isActive() {
        return this.active;
    }

    // 仅框选阶段独占指针；其余阶段放行地图拖动
    blocksMapDrag() {
        return this.active && (this.stage === 'selecting' || this.draggingSelection);
    }

    markPointerMoved(x, y) {
        if (!this.pointerDownPos) return;
        if (Math.abs(x - this.pointerDownPos.x) > EDIT_DRAG_THRESHOLD ||
            Math.abs(y - this.pointerDownPos.y) > EDIT_DRAG_THRESHOLD) {
            this.pointerMoved = true;
        }
    }

    // 进入编辑模式：清理弹窗，锁定历史记录，显示横幅
    enterMode() {
        this.clearOtherPopups();
        this.active = true;
        this.stage = 'selecting';
        this.button.classList.add('active');
        this.map.container.classList.add('edit-mode-active');
        this.hideConfirmBar();
        this.banner.classList.add('show');
        if (window.historyManager?.setLocked) {
            window.historyManager.setLocked(true);
        }
    }

    // 退出编辑模式：清理状态，解锁历史记录，隐藏横幅
    exitMode() {
        this.active = false;
        this.stage = 'idle';
        this.draggingSelection = false;
        this.button.classList.remove('active');
        this.map.container.classList.remove('edit-mode-active');

        this.clearPreview();
        this.clearSelection();
        this.hideConfirmBar();
        this.banner.classList.remove('show');

        this.payload = [];
        this.sourceAnchor = null;
        this.previewAnchor = null;
        this.previewDelta = null;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.pointerDownPos = null;
        this.pointerMoved = false;

        if (window.historyManager?.setLocked) {
            window.historyManager.setLocked(false);
        }
    }

    isTypingTarget(target) {
        if (!target) return false;
        const tag = target.tagName?.toLowerCase();
        return tag === 'input' || tag === 'textarea' || target.isContentEditable;
    }

    // 清理其他弹窗
    clearOtherPopups() {
        document.querySelectorAll('.selector, .color-input-container').forEach(el => el.remove());

        const help = document.getElementById('help-container');
        if (help) help.style.display = 'none';

        const saveManager = document.getElementById('save-manager');
        if (saveManager) saveManager.style.display = 'none';

        const customAlert = document.getElementById('custom-alert');
        const customAlertOverlay = document.getElementById('custom-alert-overlay');
        if (customAlert) customAlert.style.display = 'none';
        if (customAlertOverlay) customAlertOverlay.style.display = 'none';
    }

    getCellFromPoint(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        return el?.closest?.('.cell') || null;
    }

    startSelectionFromCell(cell, originalEvent = null) {
        if (!this.active) return;
        if (this.stage !== 'selecting') return;
        if (!cell || cell.classList.contains('center')) return;

        originalEvent?.preventDefault?.();
        originalEvent?.stopPropagation?.();

        this.clearPreview();

        const i = parseInt(cell.dataset.i, 10);
        const j = parseInt(cell.dataset.j, 10);

        this.draggingSelection = true;
        this.selectionStart = { i, j };
        this.selectionEnd = { i, j };
        this.updateSelection();
    }

    updateSelectionFromCell(cell) {
        if (!this.active || !this.draggingSelection) return;
        if (!cell || cell.classList.contains('center')) return;

        const i = parseInt(cell.dataset.i, 10);
        const j = parseInt(cell.dataset.j, 10);

        this.selectionEnd = { i, j };
        this.updateSelection();
    }

    finishSelection(originalEvent = null) {
        if (!this.active || !this.draggingSelection) return;

        this.draggingSelection = false;

        if (!this.selectedRange) return;

        this.capturePayload();

        // 选区内没有有效地形/墙壁可移动
        if (this.payload.length === 0) {
            this.clearSelection();
            this.selectedRange = null;
            this.sourceAnchor = null;
            return;
        }

        this.sourceAnchor = {
            i: this.selectedRange.minI,
            j: this.selectedRange.minJ
        };

        this.stage = 'selection-ready';
        this.showSelectionBar();

        originalEvent?.stopPropagation?.();
    }

    // 鼠标事件处理
    onMouseDown(e) {
        if (!this.active || e.button !== 0) return;
        this.pointerDownPos = { x: e.clientX, y: e.clientY };
        this.pointerMoved = false;
        const cell = e.target.closest?.('.cell');
        this.startSelectionFromCell(cell, e);
    }

    onMouseMove(e) {
        if (!this.active) return;
        if (this.draggingSelection) {
            const cell = e.target.closest?.('.cell');
            this.updateSelectionFromCell(cell);
            return;
        }
        this.markPointerMoved(e.clientX, e.clientY);
    }

    onMouseUp(e) {
        this.finishSelection(e);
    }

    // 触摸事件处理
    onTouchStart(e) {
        if (!this.active) return;
        if (!e.touches || e.touches.length === 0) return;

        const touch = e.touches[0];
        this.pointerDownPos = { x: touch.clientX, y: touch.clientY };
        this.pointerMoved = false;

        // 仅框选阶段独占触摸；其余阶段交给地图拖动，抬手时再判定是否点选
        if (this.stage === 'selecting') {
            e.preventDefault();
            this.startSelectionFromCell(this.getCellFromPoint(touch.clientX, touch.clientY), e);
        }
    }

    onTouchMove(e) {
        if (!this.active) return;
        if (!e.touches || e.touches.length === 0) return;

        const touch = e.touches[0];

        if (this.draggingSelection) {
            e.preventDefault();
            this.updateSelectionFromCell(this.getCellFromPoint(touch.clientX, touch.clientY));
            return;
        }

        this.markPointerMoved(touch.clientX, touch.clientY);
    }

    onTouchEnd(e) {
        if (!this.active) return;

        if (this.draggingSelection) {
            this.finishSelection(e);
            return;
        }

        // 拖动过地图就不当作选点
        const touch = e.changedTouches?.[0];
        if (touch && !this.pointerMoved &&
            (this.stage === 'choosing-target' || this.stage === 'preview-ready')) {
            this.selectTargetFromCell(this.getCellFromPoint(touch.clientX, touch.clientY), e);
        }

        this.pointerDownPos = null;
        this.pointerMoved = false;
    }

    selectTargetFromCell(cell, originalEvent = null) {
        if (!this.active || this.draggingSelection) return;
        if (this.stage !== 'choosing-target' && this.stage !== 'preview-ready') return;
        if (!cell || cell.classList.contains('center')) return;
        if (!this.sourceAnchor) return;

        originalEvent?.preventDefault?.();
        originalEvent?.stopPropagation?.();

        const targetI = parseInt(cell.dataset.i, 10);
        const targetJ = parseInt(cell.dataset.j, 10);
        const deltaI = targetI - this.sourceAnchor.i;
        const deltaJ = targetJ - this.sourceAnchor.j;

        // 位移需为偶数（保证墙壁和地形类型对齐）
        if (deltaI % 2 !== 0 || deltaJ % 2 !== 0) return;

        this.previewDelta = { i: deltaI, j: deltaJ };
        this.previewAnchor = { i: targetI, j: targetJ };
        this.renderPreview();
        this.stage = 'preview-ready';

        this.showConfirmBar({
            text: '已生成目标预览，可拖动地图',
            buttons: [
                { label: '确认并移动', className: 'confirm-btn', onClick: () => this.confirmMove() },
                { label: '确认并复制', className: 'copy-btn', onClick: () => this.confirmCopy() },
                { label: '重选目标', className: 'cancel-btn', onClick: () => this.cancelTargetPreview() }
            ]
        });
    }

    // 确认选区，进入选目标阶段
    confirmSelection() {
        if (this.stage !== 'selection-ready' || this.payload.length === 0) return;
        this.stage = 'choosing-target';
        this.showTargetBar();
    }

    onClickTarget(e) {
        if (this.pointerMoved) return;
        const cell = e.target.closest?.('.cell');
        this.selectTargetFromCell(cell, e);
    }

    updateSelection() {
        this.clearSelection(false);

        const minI = Math.min(this.selectionStart.i, this.selectionEnd.i);
        const maxI = Math.max(this.selectionStart.i, this.selectionEnd.i);
        const minJ = Math.min(this.selectionStart.j, this.selectionEnd.j);
        const maxJ = Math.max(this.selectionStart.j, this.selectionEnd.j);

        this.selectedRange = { minI, maxI, minJ, maxJ };

        const { size, wall } = getCellMetrics();

        for (let i = minI; i <= maxI; i++) {
            for (let j = minJ; j <= maxJ; j++) {
                this.map.ensureCell(i, j, size, wall);
                const cell = this.map.cells.get(`${i},${j}`);
                if (!cell || cell.classList.contains('center')) continue;
                cell.classList.add('move-selected');
            }
        }
    }

    clearSelection(resetRange = true) {
        this.map.container.querySelectorAll('.move-selected').forEach(cell => {
            cell.classList.remove('move-selected');
        });
        if (resetRange) this.selectedRange = null;
    }

    clearPreview() {
        this.map.container.querySelectorAll('.move-preview-target, .move-preview-overwrite, .move-preview-anchor').forEach(cell => {
            cell.classList.remove('move-preview-target');
            cell.classList.remove('move-preview-overwrite');
            cell.classList.remove('move-preview-anchor');
        });
    }

    hasEffectiveCellContent(cell) {
        if (!cell || cell.classList.contains('center')) return false;

        if (cell.dataset.type === 'square') {
            return !this.isUnknownSquare(cell);
        }
        if (cell.dataset.type === 'wall') {
            return !this.isUnknownWall(cell);
        }
        return false;
    }

    // 取消目标预览，回到选目标阶段
    cancelTargetPreview() {
        this.clearPreview();
        this.previewDelta = null;
        this.previewAnchor = null;
        this.stage = 'choosing-target';
        this.showTargetBar();
    }

    backToSelection() {
        this.clearPreview();
        this.clearSelection();
        this.hideConfirmBar();
        this.previewDelta = null;
        this.previewAnchor = null;
        this.payload = [];
        this.sourceAnchor = null;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.stage = 'selecting';
    }

    isUnknownSquare(cell) {
        const bgImage = cell.style.backgroundImage;
        const bgColor = cell.style.backgroundColor;
        const hasMarkers = cell.querySelectorAll('.marker').length > 0;
        const hasAttach = cell.querySelectorAll('.attachment-layer').length > 0;
        const isUnknownImage = !bgImage || bgImage.includes('unknown.png') || bgImage === 'none';
        const hasCustomColor = !!(bgColor && bgColor !== 'transparent');
        return isUnknownImage && !hasCustomColor && !hasMarkers && !hasAttach;
    }

    isUnknownWall(cell) {
        const wallType = getCurrentWallType(cell);
        const hasCustomColor = !!(cell.style.backgroundColor && cell.style.backgroundColor !== 'transparent');
        return wallType === '未知' && !hasCustomColor;
    }

    capturePayload() {
        if (!this.selectedRange) return;
        this.payload = [];

        const { minI, maxI, minJ, maxJ } = this.selectedRange;
        for (let i = minI; i <= maxI; i++) {
            for (let j = minJ; j <= maxJ; j++) {
                const key = `${i},${j}`;
                const cell = this.map.cells.get(key);
                if (!cell || cell.classList.contains('center')) continue;

                if (cell.dataset.type === 'square') {
                    if (this.isUnknownSquare(cell)) continue;
                    this.payload.push({
                        key,
                        type: 'square',
                        i,
                        j,
                        backgroundImage: cell.style.backgroundImage,
                        backgroundColor: cell.style.backgroundColor,
                        markers: this.serializeMarkers(cell),
                        attachment: this.serializeAttachment(cell)
                    });
                } else if (cell.dataset.type === 'wall') {
                    if (this.isUnknownWall(cell)) continue;
                    this.payload.push({
                        key,
                        type: 'wall',
                        i,
                        j,
                        orientation: cell.classList.contains('horizontal') ? 'horizontal' : 'vertical',
                        wallType: getCurrentWallType(cell),
                        backgroundImage: cell.style.backgroundImage,
                        backgroundColor: cell.style.backgroundColor
                    });
                }
            }
        }
    }

    serializeMarkers(cell) {
        const markers = [];
        cell.querySelectorAll('.marker').forEach(marker => {
            markers.push({
                text: marker.textContent,
                color: marker.style.color,
                markerType: marker.dataset.markerType || ''
            });
        });
        return markers;
    }

    serializeAttachment(cell) {
        const layer = cell.querySelector('.attachment-layer');
        if (!layer) return null;

        if (layer.classList.contains('custom-attach-text')) {
            return {
                kind: 'text',
                text: layer.textContent
            };
        }

        if (layer.classList.contains('custom-attach-circle')) {
            return {
                kind: 'custom',
                color: layer.style.backgroundColor
            };
        }

        return {
            kind: 'image',
            backgroundImage: layer.style.backgroundImage
        };
    }

    renderPreview() {
        this.clearPreview();
        if (!this.previewDelta) return;

        const { size, wall } = getCellMetrics();
        const sourceKeys = new Set(this.payload.map(item => `${item.i},${item.j}`));

        this.payload.forEach(item => {
            const ti = item.i + this.previewDelta.i;
            const tj = item.j + this.previewDelta.j;
            this.map.ensureCell(ti, tj, size, wall);
            const targetCell = this.map.cells.get(`${ti},${tj}`);
            if (targetCell && !targetCell.classList.contains('center')) {
                const targetKey = `${ti},${tj}`;
                const willOverwrite = !sourceKeys.has(targetKey) && this.hasEffectiveCellContent(targetCell);
                targetCell.classList.add(willOverwrite ? 'move-preview-overwrite' : 'move-preview-target');
            }
        });

        if (this.previewAnchor) {
            const anchorCell = this.map.cells.get(`${this.previewAnchor.i},${this.previewAnchor.j}`);
            if (anchorCell && !anchorCell.classList.contains('center')) {
                anchorCell.classList.add('move-preview-anchor');
            }
        }
    }

    // 确认栏
    showConfirmBar({ text, buttons }) {
        this.confirmBar.querySelector('.move-confirm-text').textContent = text;

        const actions = this.confirmBar.querySelector('.move-confirm-actions');
        actions.innerHTML = '';
        buttons.forEach(({ label, className, onClick }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = className;
            btn.textContent = label;
            btn.onclick = onClick;
            actions.appendChild(btn);
        });

        this.confirmBar.classList.add('show');
    }

    // 已框选：确认选区 / 删除区域 / 重选
    showSelectionBar() {
        this.showConfirmBar({
            text: '已框选区域，可拖动地图',
            buttons: [
                { label: '确认选区', className: 'confirm-btn', onClick: () => this.confirmSelection() },
                { label: '删除区域', className: 'delete-btn', onClick: () => this.deleteSelection() },
                { label: '重选', className: 'cancel-btn', onClick: () => this.backToSelection() }
            ]
        });
    }

    // 选目标阶段：可拖动地图，点击落点
    showTargetBar() {
        this.showConfirmBar({
            text: '可拖动地图，点击目标位置',
            buttons: [
                { label: '重选', className: 'cancel-btn', onClick: () => this.backToSelection() }
            ]
        });
    }

    hideConfirmBar() {
        this.confirmBar.classList.remove('show');
    }

    createConfirmBar() {
        const bar = document.createElement('div');
        bar.className = 'move-confirm-bar';
        bar.innerHTML = `
            <span class="move-confirm-text">已生成预览</span>
            <div class="move-confirm-actions"></div>
        `;

        document.body.appendChild(bar);
        return bar;
    }

    createBanner() {
        const banner = document.createElement('div');
        banner.className = 'edit-mode-banner';
        banner.textContent = '编辑模式';
        document.body.appendChild(banner);
        return banner;
    }

    resetSquareCell(cell) {
        cell.style.backgroundImage = `url('./img/unknown.png')`;
        cell.style.backgroundColor = '';
        cell.querySelectorAll('.attachment-layer').forEach(layer => layer.remove());
        cell.querySelectorAll('.marker').forEach(marker => marker.remove());
        if (window.playerCell === cell) {
            window.playerCell = null;
        }
    }

    resetWallCell(cell) {
        const orientation = cell.classList.contains('horizontal') ? 'horizontal' : 'vertical';
        cell.style.backgroundColor = '';
        cell.style.backgroundImage = `url('${getWallImage('未知', orientation)}')`;
    }

    // 应用到目标单元格
    applySquareState(cell, state) {
        this.resetSquareCell(cell);
        cell.style.backgroundImage = state.backgroundImage;
        cell.style.backgroundColor = state.backgroundColor;

        if (state.attachment) {
            const layer = getAttachmentLayer(cell);
            if (state.attachment.kind === 'text') {
                layer.classList.add('custom-attach-text');
                layer.style.backgroundImage = 'none';
                layer.style.backgroundColor = '';
                layer.textContent = state.attachment.text || '';
            } else if (state.attachment.kind === 'custom') {
                layer.classList.add('custom-attach-circle');
                layer.style.backgroundImage = 'none';
                layer.style.backgroundColor = state.attachment.color;
            } else {
                layer.classList.remove('custom-attach-circle');
                layer.style.backgroundColor = '';
                layer.style.backgroundImage = state.attachment.backgroundImage;
            }
        }

        if (state.markers?.length) {
            const container = getMarkerContainer(cell);
            state.markers.forEach(markerData => {
                const marker = document.createElement('span');
                marker.className = 'marker';
                marker.textContent = markerData.text;
                marker.style.color = markerData.color;
                if (markerData.markerType) marker.dataset.markerType = markerData.markerType;
                container.appendChild(marker);

                if (markerData.text === '🧍' || markerData.markerType === 'player') {
                    window.playerCell = cell;
                }
            });
        }

        refreshMarkerColors(cell);
    }

    applyWallState(cell, state) {
        this.resetWallCell(cell);
        if (state.backgroundColor && (!state.backgroundImage || state.backgroundImage === 'none')) {
            cell.style.backgroundImage = 'none';
            cell.style.backgroundColor = state.backgroundColor;
        } else {
            cell.style.backgroundColor = '';
            const orientation = cell.classList.contains('horizontal') ? 'horizontal' : 'vertical';
            cell.style.backgroundImage = `url('${getWallImage(state.wallType, orientation)}')`;
        }
    }

    // 删除选区：范围内全部内容（含空白格）重置为未知，然后退出编辑模式
    deleteSelection() {
        if (this.stage !== 'selection-ready' || !this.selectedRange) return;

        const { size, wall } = getCellMetrics();
        const { minI, maxI, minJ, maxJ } = this.selectedRange;

        for (let i = minI; i <= maxI; i++) {
            for (let j = minJ; j <= maxJ; j++) {
                this.map.ensureCell(i, j, size, wall);
                const cell = this.map.cells.get(`${i},${j}`);
                if (!cell || cell.classList.contains('center')) continue;

                if (cell.dataset.type === 'square') this.resetSquareCell(cell);
                else if (cell.dataset.type === 'wall') this.resetWallCell(cell);
            }
        }

        if (window.historyManager) {
            window.historyManager.saveState();
        }

        this.exitMode();
    }

    // 复制时去掉全图唯一的标记（玩家/米诺陶斯/邦邦），避免出现重复
    stripUniqueMarkers(item) {
        if (item.type !== 'square' || !item.markers?.length) return item;

        const uniqueTypes = new Set(Object.values(MARKER_TYPE));
        const markers = item.markers.filter(m => !MARKER_TYPE[m.text] && !uniqueTypes.has(m.markerType));
        return { ...item, markers };
    }

    // 将选区写入目标位置：clearSource 为 true 是移动，false 是复制
    applyPayloadToTarget(clearSource) {
        if (this.stage !== 'preview-ready') return;
        if (!this.previewDelta || this.payload.length === 0) return;

        const { size, wall } = getCellMetrics();

        if (clearSource) {
            this.payload.forEach(item => {
                const sourceCell = this.map.cells.get(item.key);
                if (!sourceCell) return;
                if (item.type === 'square') this.resetSquareCell(sourceCell);
                else this.resetWallCell(sourceCell);
            });
        }

        this.payload.forEach(item => {
            const ti = item.i + this.previewDelta.i;
            const tj = item.j + this.previewDelta.j;
            this.map.ensureCell(ti, tj, size, wall);
            const targetCell = this.map.cells.get(`${ti},${tj}`);
            if (!targetCell) return;

            const state = clearSource ? item : this.stripUniqueMarkers(item);

            if (item.type === 'square' && targetCell.dataset.type === 'square') {
                this.applySquareState(targetCell, state);
            } else if (item.type === 'wall' && targetCell.dataset.type === 'wall') {
                this.applyWallState(targetCell, state);
            }
        });

        if (window.historyManager) {
            window.historyManager.saveState();
        }

        this.exitMode();
    }

    // 确认移动：清空原位置后写入目标位置
    confirmMove() {
        this.applyPayloadToTarget(true);
    }

    // 确认复制：保留原位置内容
    confirmCopy() {
        this.applyPayloadToTarget(false);
    }
}
