
// 轨迹记录：按步记录玩家的移动方向，导出为主游戏多步行动可直接使用的上下左右字符串
const TRACK_DIR_TEXT = { up: '上', down: '下', left: '左', right: '右' };

class TrackManager {
    constructor(map) {
        this.map = map;
        this.button = document.getElementById('track-button');
        this.active = false;
        this.segments = [[]];   // 分段记录的方向
        this.exportPopup = null;

        this.banner = this.createBanner();
        this.panel = this.createPanel();

        this.init();
    }

    init() {
        if (!this.button) return;

        this.button.addEventListener('click', () => this.toggle());

        // 快捷键 T：进入 / 退出轨迹模式
        document.addEventListener('keydown', e => {
            if (e.key.toLowerCase() !== 't' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
            if (isTypingTarget(e.target)) return;
            e.preventDefault();
            this.toggle();
        });

        // 放置、清除、读档、编辑模式等都会增删玩家标记，统一在此刷新可用状态
        const touchesMarker = node => node.nodeType === Node.ELEMENT_NODE &&
            (node.classList.contains('marker') || !!node.querySelector('.marker'));
        new MutationObserver(records => {
            if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(touchesMarker))) this.refresh();
        }).observe(this.map.container, { childList: true, subtree: true });

        this.updateButtons();
    }

    isActive() {
        return this.active;
    }

    hasPlayer() {
        return !!window.playerCell?.querySelector('.marker[data-marker-type="player"]');
    }

    toggle() {
        if (this.active) this.exitMode();
        else this.enterMode();
    }

    // 进入轨迹模式：需已放置玩家，锁定撤销与重做（编辑模式禁用）
    enterMode() {
        if (this.active || !this.hasPlayer() || window.editModeManager?.isActive()) return;
        this.active = true;
        this.segments = [[]];
        this.button.classList.add('active');
        this.banner.classList.add('show');
        this.panel.classList.add('show');
        window.historyManager?.setLocked(true);
        this.render();
        this.updateButtons();
    }

    // 退出轨迹模式：清空已记录的全部内容
    exitMode() {
        if (!this.active) return;
        this.closeExport();
        this.active = false;
        this.segments = [[]];
        this.button.classList.remove('active');
        this.banner.classList.remove('show');
        this.panel.classList.remove('show');
        window.historyManager?.setLocked(false);
        this.updateButtons();
    }

    // 玩家每走一步记录一次方向（亚空间内同样计入）
    record(direction) {
        if (!this.active) return;
        this.closeExport();
        this.segments[this.segments.length - 1].push(direction);
        this.render();
    }

    // 重新放置玩家（瞬移）：另起一段，当前段还没有步数时沿用
    startSegment() {
        if (!this.active || this.segments[this.segments.length - 1].length === 0) return;
        this.closeExport();
        this.segments.push([]);
        this.render();
    }

    // 重置起点：清空全部分段，从玩家当前位置重新记录
    resetStart() {
        if (!this.active) return;
        this.closeExport();
        this.segments = [[]];
        this.render();
    }

    // 有步数的分段
    getRecordedSegments() {
        return this.segments.filter(steps => steps.length > 0);
    }

    // 玩家标记被移除时退出轨迹模式
    refresh() {
        if (this.active && !this.hasPlayer()) this.exitMode();
        else this.updateButtons();
    }

    // 只有一段时不显示段数
    render() {
        const recorded = this.getRecordedSegments();
        const steps = recorded.reduce((sum, s) => sum + s.length, 0);
        this.countText.textContent = steps;
        this.segmentCountText.textContent = recorded.length;
        this.segmentInfo.hidden = recorded.length <= 1;
        this.exportButton.disabled = steps === 0;
        this.resetButton.disabled = steps === 0;
    }

    // 轨迹模式与编辑模式互斥，开启一方时禁用另一方的按钮
    updateButtons() {
        if (!this.button) return;
        const editing = !!window.editModeManager?.isActive();
        const hasPlayer = this.hasPlayer();

        this.button.disabled = !this.active && (editing || !hasPlayer);
        if (this.active) this.button.title = '退出轨迹记录 (T)';
        else if (editing) this.button.title = '编辑模式中无法记录轨迹';
        else if (!hasPlayer) this.button.title = '请先放置玩家（右键或双击格子）';
        else this.button.title = '轨迹记录 (T)';

        const editButton = window.editModeManager?.button;
        if (editButton) {
            this.editButtonTitle ??= editButton.title;
            editButton.disabled = this.active;
            editButton.title = this.active ? '轨迹记录中无法使用编辑模式' : this.editButtonTitle;
        }
    }

    // 导出轨迹：使用小弹窗，每段一个导出框与复制按钮，点击标题折叠，点击外部关闭
    showExport() {
        this.closeExport();
        const segments = this.getRecordedSegments();
        if (!segments.length) return;

        const popup = document.createElement('div');
        popup.className = 'color-input-container track-export-popup';

        const titleEl = document.createElement('div');
        titleEl.className = 'track-export-title';

        // 段数多或很长时限高滚动
        const list = document.createElement('div');
        list.className = 'track-export-list';

        const setCollapsed = collapsed => {
            list.hidden = collapsed;
            titleEl.textContent = `导出轨迹 ${collapsed ? '▸' : '▾'}`;
        };
        titleEl.onclick = () => setCollapsed(!list.hidden);
        setCollapsed(false);

        segments.forEach((steps, k) => {
            const text = steps.map(d => TRACK_DIR_TEXT[d]).join('');
            const item = document.createElement('div');

            if (segments.length > 1) {
                const label = document.createElement('div');
                label.className = 'track-export-label';
                label.textContent = `第 ${k + 1} 段 · ${steps.length} 步`;
                item.appendChild(label);
            }

            const row = document.createElement('div');
            row.className = 'color-preview-box';

            const textBox = document.createElement('div');
            textBox.className = 'track-export-text';
            textBox.textContent = text;

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'text-confirm-btn';
            copyBtn.textContent = '复制';
            copyBtn.onclick = async () => {
                const copied = await copyText(text);
                copyBtn.textContent = copied ? '已复制' : '复制失败';
                copyBtn.classList.toggle('copied', copied);
                copyBtn.classList.toggle('copy-failed', !copied);
            };

            row.appendChild(textBox);
            row.appendChild(copyBtn);
            item.appendChild(row);
            list.appendChild(item);
        });

        popup.appendChild(titleEl);
        popup.appendChild(list);
        document.body.appendChild(popup);

        // 电脑端显示在面板下方并与面板右对齐（折叠后仍对齐），移动端由 css 居中
        if (window.innerWidth > 600) {
            const rect = this.panel.getBoundingClientRect();
            popup.style.right = `${document.documentElement.clientWidth - rect.right}px`;
            popup.style.top = `${rect.bottom + 6}px`;
        }

        this.exportPopup = popup;
        const onOutside = e => {
            if (!popup.contains(e.target)) this.closeExport();
        };
        this.onExportOutside = onOutside;
        setTimeout(() => {
            if (this.exportPopup === popup) document.addEventListener('mousedown', onOutside);
        }, 0);
    }

    closeExport() {
        if (!this.exportPopup) return;
        this.exportPopup.remove();
        document.removeEventListener('mousedown', this.onExportOutside);
        this.exportPopup = null;
    }

    createBanner() {
        const banner = document.createElement('div');
        banner.className = 'track-mode-banner';
        banner.textContent = '轨迹记录';
        document.body.appendChild(banner);
        return banner;
    }

    // 右上角面板：已记录段数（多于一段时显示）与步数、导出轨迹、重置起点
    createPanel() {
        const panel = document.createElement('div');
        panel.className = 'track-panel';
        panel.innerHTML = `
            <span class="track-panel-text">已记录 <span class="track-segments" hidden><b class="track-segment-count">0</b> 段，共 </span><b class="track-count">0</b> 步</span>
            <button type="button" class="track-export-btn">导出轨迹</button>
            <button type="button" class="track-reset-btn">重置起点</button>
        `;
        this.countText = panel.querySelector('.track-count');
        this.segmentInfo = panel.querySelector('.track-segments');
        this.segmentCountText = panel.querySelector('.track-segment-count');
        this.exportButton = panel.querySelector('.track-export-btn');
        this.resetButton = panel.querySelector('.track-reset-btn');
        this.exportButton.onclick = () => this.showExport();
        this.resetButton.onclick = () => this.resetStart();

        document.body.appendChild(panel);
        return panel;
    }
}

// 复制文本：剪贴板接口不可用（如非 HTTPS 页面）时退回 execCommand
async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        area.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
    }
}
