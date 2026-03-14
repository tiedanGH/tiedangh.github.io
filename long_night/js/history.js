
class HistoryManager {
    constructor(map) {
        this.map = map;
        this.history = [];
        this.currentIndex = -1;
        this.maxHistory = 50;
        this.locked = false;
        this.undoButton = document.getElementById('undo-button');
        this.redoButton = document.getElementById('redo-button');

        this.init();
    }

    init() {
        this.saveState();

        // 绑定按钮事件
        if (this.undoButton) {
            this.undoButton.addEventListener('click', () => this.undo());
        }
        if (this.redoButton) {
            this.redoButton.addEventListener('click', () => this.redo());
        }
        // 绑定键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (this.locked) return;
            const key = e.key.toLowerCase();
            // Ctrl+Z - 撤销
            if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }
            // Ctrl+Y 或 Ctrl+Shift+Z - 重做
            if ((e.ctrlKey && key === 'y') || ((e.ctrlKey || e.metaKey) && key === 'z' && e.shiftKey)) {
                e.preventDefault();
                this.redo();
            }
        });
    }

    // 获取当前地图状态快照
    getStateSnapshot() {
        const snapshot = {
            cells: new Map(),
            playerPosition: null,
            timestamp: Date.now()
        };

        // 查找并保存玩家位置
        let playerCellElement = null;
        this.map.cells.forEach((cell, _) => {
            const markers = cell.querySelectorAll('.marker');
            markers.forEach(marker => {
                if (marker.textContent === '🧍' || marker.dataset.markerType === 'player') {
                    playerCellElement = cell;
                }
            });
        });
        if (playerCellElement) {
            snapshot.playerPosition = {
                i: parseInt(playerCellElement.dataset.i, 10),
                j: parseInt(playerCellElement.dataset.j, 10)
            };
        }

        // 只保存可见区域的格子状态（优化性能）
        this.map.cells.forEach((cell, key) => {
            const cellCopy = {
                element: cell.cloneNode(true),
                i: cell.dataset.i,
                j: cell.dataset.j,
                type: cell.dataset.type,
                style: {
                    backgroundImage: cell.style.backgroundImage,
                    backgroundColor: cell.style.backgroundColor,
                    border: cell.style.border
                },
                markers: [],
                attach: null,
                customAttach: null
            };

            // 保存标记
            const markerContainer = cell.querySelector('.marker-container');
            if (markerContainer) {
                markerContainer.querySelectorAll('.marker').forEach(marker => {
                    cellCopy.markers.push({
                        text: marker.textContent,
                        color: marker.style.color,
                        type: marker.dataset.markerType
                    });
                });
            }

            // 保存附着
            const attachLayer = cell.querySelector('.attachment-layer');
            if (attachLayer) {
                if (attachLayer.classList.contains('custom-attach-circle') || attachLayer.style.backgroundColor) {
                    // 保存自定义附着
                    cellCopy.customAttach = {
                        type: 'custom-circle',
                        color: attachLayer.style.backgroundColor,
                        borderRadius: attachLayer.style.borderRadius,
                        width: attachLayer.style.width,
                        height: attachLayer.style.height,
                        position: attachLayer.style.position,
                        top: attachLayer.style.top,
                        left: attachLayer.style.left,
                        transform: attachLayer.style.transform
                    };
                } else if (attachLayer.style.backgroundImage && attachLayer.style.backgroundImage !== 'none') {
                    // 保存图片附着
                    const match = attachLayer.style.backgroundImage.match(/\/([^\/]+)\.(png|jpg|jpeg)/);
                    if (match) {
                        const fileName = match[1];
                        const attachName = attachOptions.find(([_, file]) => file.startsWith(fileName))?.[0];
                        if (attachName) cellCopy.attach = attachName;
                    }
                }
            }

            snapshot.cells.set(key, cellCopy);
        });

        return snapshot;
    }

    // 保存当前状态到历史记录
    saveState() {
        // 如果有重做历史，清除当前索引之后的历史
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        // 限制历史记录数量
        if (this.history.length >= this.maxHistory) {
            this.history.shift();
            this.currentIndex--;
        }

        const snapshot = this.getStateSnapshot();
        this.history.push(snapshot);
        this.currentIndex++;

        this.updateButtons();
        console.log(`Saving history, currently ${this.history.length}, index ${this.currentIndex}`);
    }

    // 恢复到指定状态
    restoreState(snapshot) {
        // 清除当前所有标记
        document.querySelectorAll('.marker').forEach(marker => marker.remove());

        // 清除当前所有附着层
        document.querySelectorAll('.attachment-layer').forEach(layer => layer.remove());

        // 恢复玩家位置全局变量
        if (snapshot.playerPosition) {
            const playerKey = `${snapshot.playerPosition.i},${snapshot.playerPosition.j}`;
            const playerCell = this.map.cells.get(playerKey);
            window.playerCell = playerCell || null;
        } else {
            window.playerCell = null;
        }

        // 恢复每个单元格的状态
        snapshot.cells.forEach((cellData, key) => {
            const existingCell = this.map.cells.get(key);
            if (existingCell) {
                // 恢复地形
                existingCell.style.backgroundImage = cellData.style.backgroundImage;
                existingCell.style.backgroundColor = cellData.style.backgroundColor;
                existingCell.style.border = cellData.style.border;

                // 恢复附着
                if (cellData.customAttach) {
                    // 恢复自定义附着
                    const layer = document.createElement('div');
                    layer.className = 'attachment-layer custom-attach-circle';
                    layer.style.backgroundColor = cellData.customAttach.color;
                    layer.style.borderRadius    = cellData.customAttach.borderRadius;
                    layer.style.width           = cellData.customAttach.width;
                    layer.style.height          = cellData.customAttach.height;
                    layer.style.position        = cellData.customAttach.position;
                    layer.style.top             = cellData.customAttach.top;
                    layer.style.left            = cellData.customAttach.left;
                    layer.style.transform       = cellData.customAttach.transform;
                    existingCell.appendChild(layer);
                } else if (cellData.attach) {
                    // 恢复图片附着
                    const attImgFile = attachOptions.find(([name]) => name === cellData.attach)?.[1];
                    if (attImgFile) {
                        const layer = document.createElement('div');
                        layer.className = 'attachment-layer';
                        layer.style.backgroundImage     = `url('./img/${attImgFile}')`;
                        layer.style.backgroundSize      = 'contain';
                        layer.style.backgroundRepeat    = 'no-repeat';
                        layer.style.backgroundPosition  = 'center';
                        existingCell.appendChild(layer);
                    }
                }

                // 恢复标记
                if (cellData.markers && cellData.markers.length > 0) {
                    let container = existingCell.querySelector('.marker-container');
                    if (!container) {
                        container = document.createElement('div');
                        container.className = 'marker-container';
                        Object.assign(container.style, {
                            position: 'absolute',
                            top: '0',
                            left: '0',
                            right: '0',
                            bottom: '0',
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '2px',
                            pointerEvents: 'none',
                        });
                        existingCell.appendChild(container);
                    }

                    cellData.markers.forEach(markerData => {
                        const span = document.createElement('span');
                        span.className = 'marker';
                        span.textContent = markerData.text;
                        span.style.color = markerData.color;
                        if (markerData.type) span.dataset.markerType = markerData.type;
                        container.appendChild(span);

                        // 如果是玩家标记，更新全局引用
                        if (markerData.type === 'player') {
                            window.playerCell = existingCell;
                        }
                    });
                }
            }
        });

        this.updateButtons();
    }

    // 撤销操作
    undo() {
        if (this.locked) return;
        if (this.currentIndex <= 0) {
            console.warn('Cannot undo: No more history available.');
            return;
        }

        this.currentIndex--;
        const previousState = this.history[this.currentIndex];
        console.log(`Undo to history ${this.currentIndex}`);
        this.restoreState(previousState);
    }

    // 重做操作
    redo() {
        if (this.locked) return;
        if (this.currentIndex >= this.history.length - 1) {
            console.log('Cannot redo: No more redo records available.');
            return;
        }

        this.currentIndex++;
        const nextState = this.history[this.currentIndex];
        console.log(`Redo to history ${this.currentIndex}`);
        this.restoreState(nextState);
    }

    // 更新按钮状态
    updateButtons() {
        if (this.undoButton) {
            this.undoButton.disabled = this.locked || this.currentIndex <= 0;
            this.undoButton.title = `撤销 (Ctrl+Z) - ${this.currentIndex}/${this.history.length - 1}`;
        }
        if (this.redoButton) {
            this.redoButton.disabled = this.locked || this.currentIndex >= this.history.length - 1;
            this.redoButton.title = `重做 (Ctrl+Y) - ${this.history.length - 1 - this.currentIndex} 步可用`;
        }
    }

    setLocked(locked) {
        this.locked = locked;
        this.updateButtons();
    }

    // 清除历史记录
    // clearHistory() {
    //     this.history = [];
    //     this.currentIndex = -1;
    //     this.saveState();
    // }
}
