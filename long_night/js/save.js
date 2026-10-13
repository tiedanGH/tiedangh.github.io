
class SaveManager {
    constructor(map) {
        this.map = map;
        this.saveButton = document.getElementById('save-button');
        this.saveManager = document.getElementById('save-manager');
        this.closeButton = document.getElementById('close-save-manager');
        this.saveSlotsContainer = document.querySelector('.save-slots');
        this.importButton = document.getElementById('import-save');
        this.importFileInput = document.getElementById('import-file');
        this.createNewSaveButton = document.getElementById('create-new-save');
        this.emptySlotMessage = document.getElementById('empty-slot-message');
        this.currentSaveCountElement = document.getElementById('current-save-count');
        this.maxSaveCountElement = document.getElementById('max-save-count');
        this.searchInput = document.getElementById('save-search');

        this.MAX_SAVES = 20;
        this.STORAGE_KEY = 'LongNightSaves';
        this.dragState = null;   // 拖动排序中的存档

        this.customAlert = new CustomAlert();

        this.init();
    }

    init() {
        this.saveButton.addEventListener('click', () => this.showSaveManager());
        this.closeButton.addEventListener('click', () => this.hideSaveManager());
        this.createNewSaveButton.addEventListener('click', () => this.createNewSave());
        this.importButton.addEventListener('click', () => this.importFileInput.click());
        this.importFileInput.addEventListener('change', (e) => this.handleImportFile(e));
        // 搜索：按名称筛选存档
        this.searchInput.addEventListener('input', () => this.renderSaveSlots());
        this.maxSaveCountElement.textContent = this.MAX_SAVES;

        // 快捷键 C：打开 / 关闭存档管理（S 已用于 WASD 移动）
        document.addEventListener('keydown', e => {
            if (e.key.toLowerCase() !== 'c' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
            if (isTypingTarget(e.target)) return;
            e.preventDefault();
            if (this.saveManager.style.display === 'flex') this.hideSaveManager();
            else this.showSaveManager();
        });

        // 初始化存档槽位
        this.renderSaveSlots();
    }

    showSaveManager() {
        this.saveManager.style.display = 'flex';
        this.renderSaveSlots();
    }

    hideSaveManager() {
        this.endSlotDrag();
        this.saveManager.style.display = 'none';
    }

    getAllSaves() {
        const savesJson = localStorage.getItem(this.STORAGE_KEY);
        return savesJson ? JSON.parse(savesJson) : [];
    }

    // 写入失败（如浏览器存储空间不足）时提示并返回 false
    saveSaves(saves) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(saves));
        } catch (e) {
            console.warn('存档保存失败:', e);
            const quota = e?.name === 'QuotaExceededError' || /quota/i.test(e?.message || '');
            this.customAlert.alert(quota
                ? '浏览器存储空间不足，存档未保存。可先导出并删除部分存档后重试。'
                : `存档保存失败：${e?.message || e}`);
            return false;
        }
        this.updateSaveCount();
        return true;
    }

    updateSaveCount() {
        const saves = this.getAllSaves();
        this.currentSaveCountElement.textContent = saves.length.toString();
    }

    getCurrentMapState() {
        const state = {
            cells: {},
            playerPosition: null,
            timestamp: Date.now(),
        };

        // 收集所有非默认状态的单元格
        this.map.cells.forEach((cell, key) => {
            if (this.map.isInitialCell(cell)) return;
            const cellData = {};
            let hasCustomData = false;

            const [i, j] = key.split(',').map(Number);

            // 检查square格子
            if (cell.dataset.type === 'square') {
                // 检查背景图片（非默认unknown.png）
                const bgImage = cell.style.backgroundImage;
                if (bgImage && !bgImage.includes('unknown.png') && !bgImage.includes('none')) {
                    cellData.bg = bgImage.replace(/url\(['"]?(.*?)['"]?\)/, '$1');
                    hasCustomData = true;
                }
                // 检查背景颜色（自定义颜色）
                const bgColor = cell.style.backgroundColor;
                if (bgColor && bgColor !== 'transparent') {
                    cellData.color = bgColor;
                    hasCustomData = true;
                }
                // 检查标记
                const markers = cell.querySelectorAll('.marker');
                if (markers.length > 0) {
                    cellData.markers = [];
                    markers.forEach(marker => {
                        cellData.markers.push({
                            text: marker.textContent,
                            color: marker.style.color,
                            type: marker.dataset.markerType
                        });
                        if (marker.textContent === '🧍') {
                            state.playerPosition = { i, j };
                        }
                    });
                    hasCustomData = true;
                }
                // 区块交互
                const binding = getBlockBinding(cell);
                if (binding) {
                    cellData.binding = binding;
                    hasCustomData = true;
                }
            }

            // 检查墙壁类型
            if (cell.dataset.type === 'wall') {
                const orientation = cell.classList.contains('horizontal') ? 'horizontal' : 'vertical';
                const wallType = getCurrentWallType(cell);
                // 只保存非默认墙壁
                if (wallType !== '未知') {
                    cellData.wallType = wallType;
                    cellData.orientation = orientation;
                    // 自定义颜色墙壁
                    if (cell.style.backgroundColor && !cell.style.backgroundImage.includes('url')) {
                        cellData.color = cell.style.backgroundColor;
                    }
                    hasCustomData = true;
                }
            }

            // 检查附着物（方块与墙壁）
            const attachments = cell.querySelectorAll('.attachment-layer');
            if (attachments.length > 0) {
                attachments.forEach(attachment => {
                    if (attachment.classList.contains('custom-attach-circle')) {
                        // 自定义颜色附着
                        if (!cellData.attachments) cellData.attachments = [];
                        cellData.attachments.push({
                            type: 'custom',
                            color: attachment.style.backgroundColor
                        });
                        hasCustomData = true;
                    } else if (attachment.classList.contains('custom-attach-text')) {
                        // 自定义文本附着
                        if (!cellData.attachments) cellData.attachments = [];
                        cellData.attachments.push({
                            type: 'text',
                            text: attachment.textContent
                        });
                        hasCustomData = true;
                    } else if (attachment.style.backgroundImage && attachment.style.backgroundImage !== 'none') {
                        // 图片附着
                        if (!cellData.attachments) cellData.attachments = [];
                        const imgUrl = attachment.style.backgroundImage.replace(/url\(['"]?(.*?)['"]?\)/, '$1');
                        cellData.attachments.push({
                            type: 'image',
                            url: imgUrl
                        });
                        hasCustomData = true;
                    }
                });
            }

            // 只保存有自定义数据的单元格
            if (hasCustomData) {
                state.cells[key] = cellData;
            }
        });

        state.borders = window.borderManager?.list() || [];   // [边框]

        return state;
    }

    createNewSave() {
        const saves = this.getAllSaves();
        // 检查存档数量限制
        if (saves.length >= this.MAX_SAVES) {
            this.customAlert.alert(`存档数量已达上限（${this.MAX_SAVES}个），请删除不需要的存档后再创建新存档。`);
            return;
        }

        const mapState = this.getCurrentMapState();

        // 创建存档对象并添加到列表
        const save = {
            name: `存档 ${saves.length + 1}`,
            timestamp: Date.now(),
            data: mapState,
            version: '1.0'
        };
        saves.push(save);
        if (!this.saveSaves(saves)) return;

        // 重新渲染存档槽位：清空搜索，新存档可能不符合筛选条件
        this.searchInput.value = '';
        this.renderSaveSlots();

        // 自动进入最后一个存档的编辑模式
        const lastIndex = saves.length - 1;
        const nameElement = this.saveSlotsContainer.querySelector(`.save-slot[data-index="${lastIndex}"] .save-name`);
        if (nameElement) {
            this.enableInlineRename(nameElement, lastIndex);
        }
    }

    enableInlineRename(nameElement, slotIndex) {
        const saves = this.getAllSaves();
        const save = saves[slotIndex];
        if (!save) return;

        // 防止重复创建输入框
        if (nameElement.querySelector('input')) return;

        const originalName = save.name;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalName;
        input.className = 'save-name-input';

        nameElement.textContent = '';
        nameElement.appendChild(input);

        input.focus();
        input.select();

        const saveRename = () => {
            const newName = input.value.trim();

            if (!newName) {
                // 空名称恢复原名
                nameElement.textContent = originalName;
                return;
            }

            save.name = newName;
            saves[slotIndex] = save;
            if (!this.saveSaves(saves)) {
                nameElement.textContent = originalName;
                return;
            }

            nameElement.textContent = newName;
        };

        const cancelRename = () => {
            nameElement.textContent = originalName;
        };

        input.addEventListener('blur', saveRename);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur(); // 触发保存
            } else if (e.key === 'Escape') {
                cancelRename();
            }
        });
    }

    // 加载存档
    loadFromSlot(slotIndex) {
        const saves = this.getAllSaves();
        const save = saves[slotIndex];
        if (!save) return;

        this.customAlert.confirm(
            `是否加载 "${save.name}"？当前地图的部分更改将会被覆盖。`,
            '确认加载',
            () => {
                this.loadSaveData(save.data);
                this.hideSaveManager();
            },
            () => {
                // 取消操作
            }
        );
    }

    // 覆盖保存存档
    overwriteSlot(slotIndex) {
        const saves = this.getAllSaves();
        const save = saves[slotIndex];
        if (!save) return;

        this.customAlert.confirm(
            `确定要用当前地图覆盖存档 "${save.name}" 吗？原存档内容将被替换。`,
            '确认覆盖',
            () => {
                const mapState = this.getCurrentMapState();

                saves[slotIndex] = {
                    ...save,
                    data: mapState,
                    timestamp: Date.now(),
                    version: '1.0'
                };

                if (!this.saveSaves(saves)) return;
                this.renderSaveSlots();
                this.customAlert.alert(`存档 "${save.name}" 已覆盖保存！`);
            },
            () => {
                // 取消操作
            }
        );
    }

    // 删除存档
    deleteFromSlot(slotIndex) {
        const saves = this.getAllSaves();
        if (!saves[slotIndex]) return;

        this.customAlert.confirm(
            `确定要删除 "${saves[slotIndex].name}" 吗？此操作无法撤销。`,
            '确认删除',
            () => {
                saves.splice(slotIndex, 1);
                if (this.saveSaves(saves)) this.renderSaveSlots();
            },
            () => {
                // 取消删除
            }
        );
    }

    loadSaveData(saveData) {
        // 读档重置 [树篱] 冲刺链
        resetPlayerMoveHistory();

        // 清除现有玩家标记
        if (window.playerCell) {
            const playerMarkers = window.playerCell.querySelectorAll('.marker');
            playerMarkers.forEach(marker => {
                if (marker.textContent === '🧍') {
                    marker.remove();
                }
            });
            window.playerCell = null;
        }

        // 加载保存的单元格状态
        if (saveData.cells) {
            Object.keys(saveData.cells).forEach(key => {
                const cellData = saveData.cells[key];
                const [i, j] = key.split(',').map(Number);

                // 确保单元格存在
                const { size, wall } = getCellMetrics();
                this.map.ensureCell(i, j, size, wall);
                const cell = this.map.cells.get(key);

                if (!cell) return;

                // 恢复地形
                if (cellData.bg) {
                    cell.style.backgroundImage = `url(${cellData.bg})`;
                }
                if (cellData.color) {
                    cell.style.backgroundColor = cellData.color;
                    cell.style.backgroundImage = 'none';
                }

                // 恢复标记
                if (cellData.markers) {
                    // 先清除现有标记
                    const existingMarkers = cell.querySelectorAll('.marker');
                    existingMarkers.forEach(marker => marker.remove());

                    cellData.markers.forEach(markerData => {
                        const span = document.createElement('span');
                        span.className = 'marker';
                        span.textContent = markerData.text;
                        if (markerData.color) span.style.color = markerData.color;
                        if (markerData.type) span.dataset.markerType = markerData.type;

                        const container = getMarkerContainer(cell);
                        container.appendChild(span);

                        // 如果是玩家标记，更新全局引用
                        if (markerData.text === '🧍') {
                            window.playerCell = cell;
                        }
                    });
                }

                // 恢复附着物
                const existingAttachments = cell.querySelectorAll('.attachment-layer');
                existingAttachments.forEach(attachment => attachment.remove());
                if (cellData.attachments) {
                    cellData.attachments.forEach(attachmentData => {
                        const layer = document.createElement('div');
                        layer.className = 'attachment-layer';

                        if (attachmentData.type === 'custom') {
                            layer.classList.add('custom-attach-circle');
                            layer.style.backgroundColor = attachmentData.color;
                        } else if (attachmentData.type === 'text') {
                            layer.classList.add('custom-attach-text');
                            layer.textContent = attachmentData.text || '';
                        } else if (attachmentData.type === 'image') {
                            layer.style.backgroundImage = `url(${attachmentData.url})`;
                            layer.style.backgroundSize = 'contain';
                            layer.style.backgroundRepeat = 'no-repeat';
                            layer.style.backgroundPosition = 'center';
                        }

                        cell.appendChild(layer);
                    });
                }

                // 恢复区块交互
                if (cell.dataset.type === 'square') setBlockBinding(cell, cellData.binding);

                // 恢复墙壁
                if (cellData.wallType && cellData.orientation) {
                    if (cellData.color) {
                        // 自定义颜色墙壁
                        cell.style.backgroundColor = cellData.color;
                        cell.style.backgroundImage = 'none';
                    } else {
                        // 预设墙壁图片
                        const wallImage = getWallImage(cellData.wallType, cellData.orientation);
                        cell.style.backgroundImage = `url('${wallImage}')`;
                    }
                }

                refreshMarkerColors(cell);   // 玩家编号的颜色与描边样式刷新
            });
        }

        // [边框] 同一黑点的旧边框被替换；墙壁同步对侧，不一致的边界墙按优先级
        const borderManager = window.borderManager;
        if (borderManager) {
            const placed = (saveData.borders || []).map(({ i, j, w, h }) => borderManager.add(i, j, w, h, false));
            Object.keys(saveData.cells || {}).forEach(key => syncBorderWall(this.map.cells.get(key)));
            placed.forEach(border => borderManager.reconcile(border));
        }

        // 重新渲染视口
        setTimeout(() => {
            this.map.renderViewport();
            if (window.historyManager) {
                window.historyManager.saveState();  // 保存历史
            }
        }, 200);
    }

    // 导出存档
    exportSlot(slotIndex) {
        const saves = this.getAllSaves();
        const save = saves[slotIndex];
        if (!save) return;

        // 创建导出数据
        const exportData = {
            ...save,
            exportDate: new Date().toISOString(),
            appName: '漫漫长夜草稿本',
            appVersion: '1.0'
        };

        // 创建下载链接
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `漫漫长夜存档_${save.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.customAlert.alert(`存档 "${save.name}" 已导出！`);
    }

    // 修改import函数中的弹窗
    handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        // 检查文件大小（限制为10MB）
        if (file.size > 10 * 1024 * 1024) {
            this.customAlert.alert('文件过大！请选择小于10MB的文件。');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importData = JSON.parse(e.target.result.toString());
                this.processImportData(importData);
            } catch (error) {
                this.customAlert.alert('导入失败：文件格式异常！');
                console.error('存档导入错误:', error);
            } finally {
                // 重置文件输入
                event.target.value = '';
            }
        };

        reader.onerror = () => {
            this.customAlert.alert('读取文件失败！');
            event.target.value = '';
        };

        reader.readAsText(file);
    }

    processImportData(importData) {
        // 检查data字段
        if (!importData?.data) {
            this.customAlert.alert('导入失败：无效的存档文件！');
            return;
        }

        const currentSaves = this.getAllSaves();

        // 检查存档数量上限
        if (currentSaves.length >= this.MAX_SAVES) {
            this.customAlert.alert(`导入失败：存档已满（${this.MAX_SAVES}/${this.MAX_SAVES}），请先删除一些存档。`);
            return;
        }

        // 构建存档对象
        const saveToImport = {
            name: importData.name ?? `导入的存档 ${new Date().toLocaleString()}`,
            timestamp: importData.timestamp ?? Date.now(),
            data: importData.data,
            version: importData.version ?? '1.0'
        };
        // 合并并保存
        const updatedSaves = [...currentSaves, saveToImport];

        if (!this.saveSaves(updatedSaves)) return;
        this.searchInput.value = '';
        this.renderSaveSlots();

        this.customAlert.alert('导入存档成功！');
    }


    renderSaveSlots() {
        const saves = this.getAllSaves();
        this.saveSlotsContainer.innerHTML = '';

        // 更新存档计数
        this.updateSaveCount();
        // 如果没有存档，显示空状态提示
        if (saves.length === 0) {
            this.emptySlotMessage.style.display = 'flex';
            this.saveSlotsContainer.appendChild(this.emptySlotMessage);
            return;
        } else {
            this.emptySlotMessage.style.display = 'none';
        }

        // 按名称搜索筛选，序号仍对应完整列表
        const query = this.searchInput.value.trim().toLowerCase();
        const visible = saves.map((save, index) => ({ save, index }))
            .filter(({ save }) => !query || String(save.name).toLowerCase().includes(query));
        if (visible.length === 0) {
            const noMatch = document.createElement('div');
            noMatch.className = 'save-no-match';
            noMatch.textContent = '没有匹配的存档';
            this.saveSlotsContainer.appendChild(noMatch);
            return;
        }

        // 渲染所有存档
        visible.forEach(({ save, index }) => {
            const slot = document.createElement('div');
            slot.className = 'save-slot';
            slot.dataset.index = index;

            // 拖动柄：长按后拖动调整顺序
            const handle = document.createElement('div');
            handle.className = 'save-drag-handle';
            handle.title = '长按拖动调整顺序';
            this.bindSlotDrag(handle, slot);

            const body = document.createElement('div');
            body.className = 'save-body';

            const info = document.createElement('div');
            info.className = 'save-info';

            const name = document.createElement('div');
            name.className = 'save-name';
            name.textContent = save.name;
            name.addEventListener('click', (e) => {
                e.stopPropagation();
                this.enableInlineRename(name, index);
            });

            const meta = document.createElement('div');
            meta.className = 'save-meta';

            const time = document.createElement('div');
            time.textContent = new Date(save.timestamp).toLocaleString();

            meta.appendChild(time);
            info.appendChild(name);
            info.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'save-actions';

            // 加载按钮
            const loadBtn = document.createElement('button');
            loadBtn.className = 'slot-btn load-btn';
            loadBtn.textContent = '加载';
            loadBtn.onclick = (e) => {
                e.stopPropagation();
                this.loadFromSlot(index);
            };
            // 覆盖按钮
            const overwriteBtn = document.createElement('button');
            overwriteBtn.className = 'slot-btn overwrite-btn';
            overwriteBtn.textContent = '覆盖';
            overwriteBtn.onclick = (e) => {
                e.stopPropagation();
                this.overwriteSlot(index);
            };
            // 删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'slot-btn delete-btn';
            deleteBtn.textContent = '删除';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.deleteFromSlot(index);
            };
            // 导出按钮
            const exportBtn = document.createElement('button');
            exportBtn.className = 'slot-btn export-btn';
            exportBtn.textContent = '导出';
            exportBtn.onclick = (e) => {
                e.stopPropagation();
                this.exportSlot(index);
            };

            actions.appendChild(loadBtn);
            actions.appendChild(overwriteBtn);
            actions.appendChild(deleteBtn);
            actions.appendChild(exportBtn);

            body.appendChild(info);
            body.appendChild(actions);
            slot.appendChild(handle);
            slot.appendChild(body);
            this.saveSlotsContainer.appendChild(slot);
        });
    }

    /* ========== 拖动排序 ========== */
    // 长按存档前的拖动柄开始拖动（鼠标按住后移动也可直接拖动）
    bindSlotDrag(handle, slot) {
        const LONG_PRESS_MS = 300;
        let timer = null;
        let startY = 0;
        let lastY = 0;

        const cancelPress = () => {
            clearTimeout(timer);
            timer = null;
            handle.classList.remove('pressing');
        };
        const press = y => {
            startY = lastY = y;
            handle.classList.add('pressing');
            timer = setTimeout(() => {
                cancelPress();
                this.startSlotDrag(slot, lastY);
            }, LONG_PRESS_MS);
        };

        handle.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            e.preventDefault();   // 避免选中文字
            press(e.clientY);
            const move = ev => {
                lastY = ev.clientY;
                if (timer && Math.abs(lastY - startY) > 4) {
                    cancelPress();
                    this.startSlotDrag(slot, lastY);
                }
                this.moveSlotDrag(lastY);
            };
            const up = () => {
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
                cancelPress();
                this.endSlotDrag();
            };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
        });

        // 触摸：长按前滑动视为滚动列表，开始拖动后不再滚动
        handle.addEventListener('touchstart', e => {
            if (e.touches.length === 1) press(e.touches[0].clientY);
        }, { passive: true });
        handle.addEventListener('touchmove', e => {
            lastY = e.touches[0].clientY;
            if (this.dragState) {
                e.preventDefault();
                this.moveSlotDrag(lastY);
            } else if (timer && Math.abs(lastY - startY) > 8) {
                cancelPress();
            }
        }, { passive: false });
        const endTouch = () => {
            cancelPress();
            this.endSlotDrag();
        };
        handle.addEventListener('touchend', endTouch);
        handle.addEventListener('touchcancel', endTouch);
        handle.addEventListener('contextmenu', e => e.preventDefault());
    }

    startSlotDrag(slot, clientY) {
        if (this.dragState) return;
        this.dragState = { slot, lastY: clientY, frame: 0 };
        slot.classList.add('dragging');
        this.saveManager.classList.add('sorting');

        // 拖到列表上下边缘时自动滚动
        const EDGE = 40;
        const step = () => {
            const state = this.dragState;
            if (!state) return;
            const box = this.saveSlotsContainer.getBoundingClientRect();
            let dy = 0;
            if (state.lastY < box.top + EDGE) dy = -Math.ceil((box.top + EDGE - state.lastY) / 4);
            else if (state.lastY > box.bottom - EDGE) dy = Math.ceil((state.lastY - box.bottom + EDGE) / 4);
            if (dy) {
                this.saveSlotsContainer.scrollTop += dy;
                this.placeDraggedSlot(state.lastY);
            }
            state.frame = requestAnimationFrame(step);
        };
        this.dragState.frame = requestAnimationFrame(step);
    }

    moveSlotDrag(clientY) {
        if (!this.dragState) return;
        this.dragState.lastY = clientY;
        this.placeDraggedSlot(clientY);
    }

    // 越过相邻存档的中线时换位
    placeDraggedSlot(clientY) {
        const { slot } = this.dragState;
        const others = [...this.saveSlotsContainer.querySelectorAll('.save-slot')].filter(el => el !== slot);
        const next = others.find(el => {
            const r = el.getBoundingClientRect();
            return clientY < r.top + r.height / 2;
        });
        if (next) {
            if (slot.nextElementSibling !== next) this.saveSlotsContainer.insertBefore(slot, next);
        } else if (others.length && others[others.length - 1].nextElementSibling !== slot) {
            others[others.length - 1].after(slot);
        }
    }

    // 松开后保存顺序：可见存档按新顺序填回它们原来的位置，搜索时未显示的存档不动
    endSlotDrag() {
        const state = this.dragState;
        if (!state) return;
        this.dragState = null;
        cancelAnimationFrame(state.frame);
        state.slot.classList.remove('dragging');
        this.saveManager.classList.remove('sorting');

        const order = [...this.saveSlotsContainer.querySelectorAll('.save-slot')].map(el => Number(el.dataset.index));
        const positions = [...order].sort((a, b) => a - b);
        if (order.every((index, k) => index === positions[k])) return;

        const saves = this.getAllSaves();
        const sorted = [...saves];
        positions.forEach((position, k) => {
            sorted[position] = saves[order[k]];
        });
        this.saveSaves(sorted);
        this.renderSaveSlots();
    }
}

// 自定义弹窗管理器
class CustomAlert {
    constructor() {
        this.overlay = document.getElementById('custom-alert-overlay');
        this.alertDisplay = document.getElementById('custom-alert');
        this.title = document.getElementById('custom-alert-title');
        this.message = document.getElementById('custom-alert-message');
        this.buttons = document.getElementById('custom-alert-buttons');
        this.closeBtn = document.getElementById('custom-alert-close');

        this.init();
    }

    init() {
        this.closeBtn.addEventListener('click', () => this.hide());
        this.overlay.addEventListener('click', () => this.hide());

        // 阻止事件冒泡
        this.alertDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    show(title, message, buttons = []) {
        this.title.textContent = title;
        this.message.textContent = message;
        this.buttons.innerHTML = '';

        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.className = `custom-alert-btn custom-alert-${button.type || 'neutral'}`;
            btn.textContent = button.text;
            btn.onclick = () => {
                this.hide();
                if (button.callback) button.callback();
            };
            this.buttons.appendChild(btn);
        });

        this.alertDisplay.style.display = 'flex';
        this.overlay.style.display = 'block';
    }

    alert(message, title = '提示') {
        this.show(title, message, [
            { text: '确定', type: 'neutral', callback: null }
        ]);
    }

    confirm(message, title = '确认', onConfirm, onCancel) {
        this.show(title, message, [
            { text: '确定', type: 'confirm', callback: onConfirm },
            { text: '取消', type: 'cancel', callback: onCancel }
        ]);
    }

    hide() {
        this.alertDisplay.style.display = 'none';
        this.overlay.style.display = 'none';
    }
}
