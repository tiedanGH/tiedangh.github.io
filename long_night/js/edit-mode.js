
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

        this.payload = [];
        this.sourceAnchor = null;
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
        this.previewDelta = null;
        this.selectionStart = null;
        this.selectionEnd = null;

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
        this.showConfirmBar({
            text: '已框选区域，先确认选区后再选择目标位置',
            confirmText: '确认选区',
            onConfirm: () => this.confirmSelection(),
            cancelText: '重选',
            onCancel: () => this.backToSelection()
        });

        originalEvent?.stopPropagation?.();
    }

    // 鼠标事件处理
    onMouseDown(e) {
        if (!this.active || e.button !== 0) return;
        const cell = e.target.closest?.('.cell');
        this.startSelectionFromCell(cell, e);
    }

    onMouseMove(e) {
        if (!this.active || !this.draggingSelection) return;
        const cell = e.target.closest?.('.cell');
        this.updateSelectionFromCell(cell);
    }

    onMouseUp(e) {
        this.finishSelection(e);
    }

    // 触摸事件处理
    onTouchStart(e) {
        if (!this.active) return;
        if (!e.touches || e.touches.length === 0) return;

        e.preventDefault();

        const touch = e.touches[0];
        const cell = this.getCellFromPoint(touch.clientX, touch.clientY);

        // 如果当前还在框选阶段，就开始框选
        if (this.stage === 'selecting') {
            this.startSelectionFromCell(cell, e);
            return;
        }

        // 如果已经在选目标阶段，触摸直接当成点目标
        if (this.stage === 'choosing-target' || this.stage === 'preview-ready') {
            this.selectTargetFromCell(cell, e);
        }
    }

    onTouchMove(e) {
        if (!this.active) return;
        if (!e.touches || e.touches.length === 0) return;
        if (!this.draggingSelection) return;

        e.preventDefault();

        const touch = e.touches[0];
        const cell = this.getCellFromPoint(touch.clientX, touch.clientY);
        this.updateSelectionFromCell(cell);
    }

    onTouchEnd(e) {
        if (!this.active) return;
        this.finishSelection(e);
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
        this.renderPreview();
        this.stage = 'preview-ready';

        this.showConfirmBar({
            text: '已生成目标预览，确认后执行移动',
            confirmText: '确认并移动',
            onConfirm: () => this.confirmMove(),
            cancelText: '重选目标',
            onCancel: () => this.cancelTargetPreview()
        });
    }

    // 确认选区，进入选目标阶段
    confirmSelection() {
        if (this.stage !== 'selection-ready' || this.payload.length === 0) return;
        this.stage = 'choosing-target';
        this.hideConfirmBar();
    }

    onClickTarget(e) {
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

        const size = window.innerWidth > 600 ? 40 : 30;
        const wall = window.innerWidth > 600 ? 11 : 9;

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
        this.map.container.querySelectorAll('.move-preview-target, .move-preview-overwrite').forEach(cell => {
            cell.classList.remove('move-preview-target');
            cell.classList.remove('move-preview-overwrite');
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
        this.stage = 'choosing-target';
        this.hideConfirmBar();
    }

    backToSelection() {
        this.clearPreview();
        this.clearSelection();
        this.hideConfirmBar();
        this.previewDelta = null;
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

        const size = window.innerWidth > 600 ? 40 : 30;
        const wall = window.innerWidth > 600 ? 11 : 9;
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
    }

    // 确认栏
    showConfirmBar({ text, confirmText, onConfirm, cancelText, onCancel }) {
        const textEl = this.confirmBar.querySelector('.move-confirm-text');
        const confirmBtn = this.confirmBar.querySelector('.confirm-btn');
        const cancelBtn = this.confirmBar.querySelector('.cancel-btn');

        textEl.textContent = text;
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        confirmBtn.onclick = onConfirm;
        cancelBtn.onclick = onCancel;

        this.confirmBar.classList.add('show');
    }

    hideConfirmBar() {
        this.confirmBar.classList.remove('show');
    }

    createConfirmBar() {
        const bar = document.createElement('div');
        bar.className = 'move-confirm-bar';
        bar.innerHTML = `
            <span class="move-confirm-text">已生成预览</span>
            <button class="confirm-btn" type="button">确认</button>
            <button class="cancel-btn" type="button">取消</button>
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
            if (state.attachment.kind === 'custom') {
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

    // 确认移动：将预览状态应用到地图，并保存历史记录
    confirmMove() {
        if (this.stage !== 'preview-ready') return;
        if (!this.previewDelta || this.payload.length === 0) return;

        const size = window.innerWidth > 600 ? 40 : 30;
        const wall = window.innerWidth > 600 ? 11 : 9;

        this.payload.forEach(item => {
            const sourceCell = this.map.cells.get(item.key);
            if (!sourceCell) return;
            if (item.type === 'square') this.resetSquareCell(sourceCell);
            else this.resetWallCell(sourceCell);
        });

        this.payload.forEach(item => {
            const ti = item.i + this.previewDelta.i;
            const tj = item.j + this.previewDelta.j;
            this.map.ensureCell(ti, tj, size, wall);
            const targetCell = this.map.cells.get(`${ti},${tj}`);
            if (!targetCell) return;

            if (item.type === 'square' && targetCell.dataset.type === 'square') {
                this.applySquareState(targetCell, item);
            } else if (item.type === 'wall' && targetCell.dataset.type === 'wall') {
                this.applyWallState(targetCell, item);
            }
        });

        if (window.historyManager) {
            window.historyManager.saveState();
        }

        this.exitMode();
    }
}
