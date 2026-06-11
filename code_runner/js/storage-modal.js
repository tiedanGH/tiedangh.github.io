// Storage management modal (存储管理): current-project storage + global buckets + recovery area.
// Self-contained; depends on GlotStore/GlotProjects/GlotUtils (globals) + showToast/confirmDialog (injected via init).
const GlotStorageModal = (() => {
    let overlay, body, showToast, confirmDialog;
    let smTab = 'project';    // active tab: 'project' | 'buckets' | 'recovery'
    let smBucketOpen = {};    // bucketId -> whether its card body (data + backups) is expanded
    let smViewUserID = null;  // which mock userID's storage the viewer is currently showing

    function attrEsc(s) { return GlotUtils.escapeHtml(s).replace(/"/g, '&quot;'); }
    function toastResult(r, okMsg) {
        if (r && r.ok) showToast(okMsg, 'success');
        else showToast((r && r.error) || '操作失败', 'error');
    }
    function formatTime(ms) {
        if (!ms) return '-';
        const d = new Date(ms), p = n => (n < 10 ? '0' + n : '' + n);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function renderBucketCard(b) {
        const esc = GlotUtils.escapeHtml;
        const open = !!smBucketOpen[b.id];
        const backupCount = b.backups.filter(Boolean).length;
        const head =
            '<div class="sm-bucket-head">' +
                '<span class="sm-bucket-id">#' + b.id + '</span>' +
                '<span class="sm-bucket-name editable" title="点击重命名">' + esc(b.name) + '</span>' +
                '<span class="sm-bucket-badge">关联 ' + b.linkedCount + '</span>' +
                '<span class="sm-bucket-size">' + b.content.length + ' 字符</span>' +
                '<button class="btn-switch" data-act="bucket-toggle">' + (open ? '收起' : '查看') + '</button>' +
                '<button class="btn-del" data-act="bucket-del">删除</button></div>';
        if (!open) return '<div class="sm-bucket-card" data-id="' + b.id + '">' + head + '</div>';

        const slots = b.backups.map((bk, i) => {
            if (bk) {
                return '<div class="backup-slot occupied" data-slot="' + i + '">' +
                    '<span class="slot-no">槽' + (i + 1) + '</span>' +
                    '<span class="slot-name editable" title="点击重命名">' + esc(bk.name) + '</span>' +
                    '<span class="slot-meta">' + formatTime(bk.time) + ' · ' + String(bk.content).length + ' 字符</span>' +
                    '<button class="btn-view" data-act="backup-view" data-slot="' + i + '">查看</button>' +
                    '<button class="btn-switch" data-act="backup-rollback" data-slot="' + i + '">回滚</button>' +
                    '<button class="btn-export" data-act="backup-overwrite" data-slot="' + i + '">覆盖备份</button>' +
                    '<button class="btn-del" data-act="backup-del" data-slot="' + i + '">删除</button></div>';
            }
            return '<div class="backup-slot" data-slot="' + i + '">' +
                '<span class="slot-no">槽' + (i + 1) + '</span>' +
                '<span class="slot-empty">空槽位</span>' +
                '<button class="btn-new" data-act="backup-create" data-slot="' + i + '">创建备份</button></div>';
        }).join('');
        const bodyHtml =
            '<div class="sm-bucket-body">' +
                '<input class="sm-bucket-desc" placeholder="描述（可选）" value="' + attrEsc(b.desc) + '">' +
                '<label>主存储区</label>' +
                '<textarea class="sm-bucket-content" rows="6">' + esc(b.content) + '</textarea>' +
                '<div class="sm-row-actions"><button class="btn-save" data-act="bucket-save">保存数据</button></div>' +
                '<div class="sm-backup-area">' +
                    '<div class="sm-backup-head"><span class="sm-backup-title">备份区</span>' +
                    '<span class="sm-backup-count">' + backupCount + '/3</span></div>' +
                    '<div class="sm-backup-slots">' + slots + '</div>' +
                '</div></div>';
        return '<div class="sm-bucket-card open" data-id="' + b.id + '">' + head + bodyHtml + '</div>';
    }

    function render() {
        const esc = GlotUtils.escapeHtml;
        const pid = GlotProjects.getActiveId();
        const proj = GlotProjects.getProject(pid) || {};
        const ps = GlotStore.getProjectStorage(pid);
        // storage viewer: switchable userID across all users that have data + all env userID candidates
        if (!smViewUserID) smViewUserID = String(Number(GlotStore.composeEnvValues().userID) || 10001);
        const userSet = {};
        Object.keys(ps.storage).forEach(u => userSet[u] = 1);
        ((GlotStore.getEnvField('userID') || {}).values || []).forEach(u => userSet[String(u)] = 1);
        userSet[smViewUserID] = 1;
        const userIDs = Object.keys(userSet).sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
        const userOptions = userIDs.map(u =>
            '<option value="' + attrEsc(u) + '"' + (u === smViewUserID ? ' selected' : '') + '>' +
            esc(u) + (ps.storage[u] !== undefined ? ' ●' : '') + '</option>').join('');
        const userVal = GlotStore.getUserStorage(pid, smViewUserID);
        const buckets = GlotStore.listBuckets();
        const recovery = GlotStore.listRecovery();

        const enabledHint = proj.storageOption === 'enabled' ? '' :
            '<p class="sm-note"><i class="fas fa-triangle-exclamation"></i> 当前项目存储功能未开启：运行时不会注入/保存存储（仍可在此管理数据与存储库）。</p>';

        const linkChips = ps.links.length
            ? ps.links.map(id => {
                const b = GlotStore.getBucket(id);
                const nm = b ? ('#' + id + ' ' + b.name) : ('#' + id + ' (已删除)');
                return '<span class="bucket-chip">' + esc(nm) +
                    '<span class="chip-x" data-act="unlink" data-id="' + id + '" title="解除关联">&times;</span></span>';
            }).join('')
            : '<span class="sm-empty-hint">未关联任何存储库</span>';
        const linkable = buckets.filter(b => ps.links.indexOf(b.id) === -1);
        const linkOptions = linkable.map(b => '<option value="' + b.id + '">#' + b.id + ' ' + esc(b.name) + '</option>').join('');

        const bucketCards = buckets.length ? buckets.map(renderBucketCard).join('')
            : '<p class="sm-empty-hint">还没有存储库，点击“新建存储库”创建。</p>';

        const bucketOpts = buckets.map(b => '<option value="' + b.id + '">#' + b.id + ' ' + esc(b.name) + '</option>').join('');
        const recoveryList = recovery.length ? recovery.map(it => {
            const size = (it.data && it.data.content != null) ? String(it.data.content).length : 0;
            return '<div class="recovery-item" data-rid="' + attrEsc(it.rid) + '">' +
                '<div class="recovery-meta"><span class="recovery-source">' + esc(it.source) + '</span>' +
                '<span class="recovery-time">' + formatTime(it.createdAt) + ' · ' + size + ' 字符</span></div>' +
                '<div class="recovery-actions"><button class="btn-view" data-act="recovery-view">查看</button>' +
                (buckets.length ? ('<select class="recovery-target">' + bucketOpts + '</select>' +
                    '<button class="btn-switch" data-act="recovery-apply">复制到存储库</button>') : '') +
                '<button class="btn-del" data-act="recovery-del">删除</button></div></div>';
        }).join('') : '<span class="sm-empty-hint">恢复区为空</span>';

        // tab bar (replaces section headers)
        const tab = (id, label) => '<button class="sm-tab' + (smTab === id ? ' active' : '') +
            '" data-act="tab" data-tab="' + id + '">' + label + '</button>';
        const tabs = '<div class="sm-tabs">' + tab('project', '项目存储管理') + tab('buckets', '全局存储库') + tab('recovery', '恢复区') + '</div>';

        const projectContent =
            '<div class="storage-section"><h3>当前项目存储</h3>' +
                '<div class="sm-field"><label>global（项目全局）</label>' +
                    '<textarea class="sm-global" rows="3">' + esc(ps.global) + '</textarea>' +
                    '<div class="sm-row-actions"><button class="btn-save" data-act="save-global">保存</button></div></div>' +
                '<div class="sm-field"><label>storage（按模拟用户隔离，可切换查看任意用户）</label>' +
                    '<div class="sm-user-row">查看用户：<select class="sm-user-select">' + userOptions + '</select>' +
                        (userVal !== '' ? '<span class="sm-user-has">● 有数据</span>' : '<span class="sm-user-none">无数据</span>') + '</div>' +
                    '<textarea class="sm-storage" rows="3">' + esc(userVal) + '</textarea>' +
                    '<div class="sm-row-actions"><button class="btn-save" data-act="save-storage">保存</button>' +
                    '<button class="btn-del" data-act="clear-storage">清空</button></div></div></div>' +
            '<div class="storage-section"><h3>关联存储库</h3>' +
                '<div class="sm-links">' + linkChips + '</div>' +
                (linkable.length ? ('<div class="sm-link-add"><select class="sm-link-select">' + linkOptions + '</select>' +
                    '<button class="btn-switch" data-act="link">关联</button></div>')
                    : '<span class="sm-empty-hint">没有可关联的存储库</span>') + '</div>';

        const bucketsContent =
            '<div class="storage-section"><div class="sm-section-head"><h3>全局存储库</h3>' +
                '<button class="btn-new" data-act="new-bucket">新建存储库</button></div>' +
                '<div class="sm-bucket-list">' + bucketCards + '</div></div>';

        const recoveryContent =
            '<div class="storage-section"><div class="sm-section-head"><h3>恢复区</h3>' +
                (recovery.length ? '<button class="btn-del" data-act="recovery-clear">清空恢复区</button>' : '') + '</div>' +
                '<p class="sm-note">恢复区数据不会被任何导出功能包含。</p>' +
                '<div class="sm-recovery-list">' + recoveryList + '</div></div>';

        const content = smTab === 'buckets' ? bucketsContent : smTab === 'recovery' ? recoveryContent : projectContent;
        body.innerHTML = tabs + enabledHint + '<div class="sm-tab-content">' + content + '</div>';
    }

    function inlineEdit(spanEl, current, maxLen, commit) {
        if (spanEl.querySelector('input')) return;
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'sm-inline-input'; input.maxLength = maxLen; input.value = current;
        spanEl.textContent = ''; spanEl.appendChild(input); input.focus(); input.select();
        let done = false;
        const finish = apply => {
            if (done) return; done = true;
            const nn = input.value.trim();
            if (apply && nn && nn !== current) commit(nn);
            else render();
        };
        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', ev => {
            ev.stopPropagation();
            if (ev.key === 'Enter') input.blur();
            else if (ev.key === 'Escape') finish(false);
        });
    }
    function startBucketRename(spanEl) {
        const id = Number(spanEl.closest('.sm-bucket-card').getAttribute('data-id'));
        const b = GlotStore.getBucket(id);
        inlineEdit(spanEl, b ? b.name : '', 60, nn => {
            const r = GlotStore.renameBucket(id, nn);
            render();
            if (!r.ok) showToast(r.error, 'error');
        });
    }
    function startBackupRename(spanEl) {
        const card = spanEl.closest('.sm-bucket-card');
        const id = Number(card.getAttribute('data-id'));
        const slot = Number(spanEl.closest('.backup-slot').getAttribute('data-slot'));
        const b = GlotStore.getBucket(id);
        const cur = (b && b.backups[slot]) ? b.backups[slot].name : '';
        inlineEdit(spanEl, cur, 40, nn => { GlotStore.renameBackup(id, slot, nn); render(); });
    }

    async function onBodyClick(e) {
        const bn = e.target.closest('.sm-bucket-name.editable');
        if (bn) { startBucketRename(bn); return; }
        const sn = e.target.closest('.backup-slot .slot-name.editable');
        if (sn) { startBackupRename(sn); return; }

        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        const pid = GlotProjects.getActiveId();
        const card = btn.closest('.sm-bucket-card');
        const bucketId = card ? Number(card.getAttribute('data-id')) : null;
        const slot = btn.hasAttribute('data-slot') ? Number(btn.getAttribute('data-slot')) : null;

        if (act === 'tab') {
            smTab = btn.getAttribute('data-tab');
            render();
        } else if (act === 'bucket-toggle') {
            smBucketOpen[bucketId] = !smBucketOpen[bucketId];
            render();
        } else if (act === 'backup-view') {
            const bk = (GlotStore.getBucket(bucketId) || { backups: [] }).backups[slot];
            if (bk) await confirmDialog('【备份内容】槽' + (slot + 1) + '（' + bk.name + '，' + formatTime(bk.time) + '）\n\n' + bk.content);
        } else if (act === 'save-global') {
            toastResult(GlotStore.setGlobal(pid, body.querySelector('.sm-global').value), 'global 已保存');
        } else if (act === 'save-storage') {
            const r = GlotStore.setUserStorage(pid, smViewUserID, body.querySelector('.sm-storage').value);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            render(); showToast('storage 已保存（用户 ' + smViewUserID + '）', 'success');
        } else if (act === 'clear-storage') {
            if (!await confirmDialog('清空用户 ' + smViewUserID + ' 的 storage？该条目将被删除。')) return;
            GlotStore.setUserStorage(pid, smViewUserID, '');
            render(); showToast('已清空 storage', 'success');
        } else if (act === 'link') {
            const sel = body.querySelector('.sm-link-select');
            if (!sel || !sel.value) return;
            const r = GlotStore.linkBucket(pid, Number(sel.value));
            if (!r.ok) { showToast(r.error, 'error'); return; }
            render(); showToast('已关联存储库', 'success');
        } else if (act === 'unlink') {
            GlotStore.unlinkBucket(pid, Number(btn.getAttribute('data-id')));
            render(); showToast('已解除关联', 'success');
        } else if (act === 'new-bucket') {
            const r = GlotStore.createBucket('新存储库', '');
            if (!r.ok) { showToast(r.error, 'error'); return; }
            render();
            const newCard = body.querySelector('.sm-bucket-card[data-id="' + r.id + '"]');
            const nameEl = newCard && newCard.querySelector('.sm-bucket-name.editable');
            if (nameEl) startBucketRename(nameEl);
            showToast('已创建存储库 #' + r.id, 'success');
        } else if (act === 'bucket-save') {
            GlotStore.setBucketDesc(bucketId, card.querySelector('.sm-bucket-desc').value);
            const r = GlotStore.setBucketContent(bucketId, card.querySelector('.sm-bucket-content').value);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            render(); showToast('已保存存储库内容', 'success');
        } else if (act === 'bucket-del') {
            const b = GlotStore.getBucket(bucketId);
            if (!await confirmDialog('删除存储库 #' + bucketId + ' “' + (b ? b.name : '') + '”？\n所有项目的关联会被解除，备份一并删除，不可恢复。')) return;
            GlotStore.deleteBucket(bucketId);
            render(); showToast('已删除存储库', 'success');
        } else if (act === 'backup-create') {
            const r = GlotStore.createBackup(bucketId, slot);
            if (r.occupied) {
                if (!await confirmDialog('槽' + (slot + 1) + ' 已有备份（' + r.existing.name + '，' + formatTime(r.existing.time) + '）。\n覆盖后旧备份不可恢复，确认覆盖？')) return;
                toastResult(GlotStore.overwriteBackup(bucketId, slot), '已覆盖备份'); render(); return;
            }
            if (!r.ok) { showToast(r.error, 'error'); return; }
            render(); showToast('已创建备份', 'success');
        } else if (act === 'backup-overwrite') {
            if (!await confirmDialog('用当前主存储区内容覆盖槽' + (slot + 1) + ' 的备份？\n旧备份不可恢复。')) return;
            const r = GlotStore.overwriteBackup(bucketId, slot);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            render(); showToast('已覆盖备份', 'success');
        } else if (act === 'backup-del') {
            if (!await confirmDialog('删除槽' + (slot + 1) + ' 的备份？此操作不可恢复。')) return;
            GlotStore.deleteBackup(bucketId, slot);
            render(); showToast('已删除备份', 'success');
        } else if (act === 'backup-rollback') {
            if (!await confirmDialog('回滚：用槽' + (slot + 1) + ' 的备份覆盖存储库 #' + bucketId + ' 的主存储区？')) return;
            if (!await confirmDialog('⚠️ 二次确认：当前主存储区内容将被覆盖且【无法恢复】（不会自动备份当前值）。确认回滚？')) return;
            const r = GlotStore.rollbackBackup(bucketId, slot);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            render(); showToast('已回滚', 'success');
        } else if (act === 'recovery-view') {
            const rid = btn.closest('.recovery-item').getAttribute('data-rid');
            const rec = GlotStore.listRecovery().find(x => x.rid === rid);
            if (rec) await confirmDialog('【恢复区数据】\n来源：' + rec.source + '\n\n内容：\n' + ((rec.data && rec.data.content != null) ? rec.data.content : ''));
        } else if (act === 'recovery-apply') {
            const item = btn.closest('.recovery-item');
            const sel = item.querySelector('.recovery-target');
            if (!sel || !sel.value) { showToast('请选择目标存储库', 'error'); return; }
            const targetId = Number(sel.value);
            const tb = GlotStore.getBucket(targetId);
            if (!await confirmDialog('将此恢复数据复制到存储库 #' + targetId + ' “' + (tb ? tb.name : '') + '” 的主存储区？\n将覆盖该存储库当前内容。')) return;
            const r = GlotStore.applyRecoveryToBucket(item.getAttribute('data-rid'), targetId);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            render(); showToast('已复制到存储库 #' + targetId, 'success');
        } else if (act === 'recovery-del') {
            GlotStore.deleteRecovery(btn.closest('.recovery-item').getAttribute('data-rid'));
            render(); showToast('已删除恢复记录', 'success');
        } else if (act === 'recovery-clear') {
            if (!await confirmDialog('清空恢复区？所有恢复数据将被删除，不可恢复。')) return;
            GlotStore.clearRecovery();
            render(); showToast('已清空恢复区', 'success');
        }
    }

    // Switch which user's storage the viewer shows
    function onBodyChange(e) {
        const sel = e.target.closest('.sm-user-select');
        if (!sel) return;
        smViewUserID = sel.value;
        render();
    }

    function open() {
        smViewUserID = String(Number(GlotStore.composeEnvValues().userID) || 10001);
        smTab = 'project';
        smBucketOpen = {};
        render();
        overlay.hidden = false;
    }
    function close() { overlay.hidden = true; }
    function isOpen() { return overlay && !overlay.hidden; }

    function init(deps) {
        overlay = document.getElementById('storageModalOverlay');
        body = document.getElementById('storageModalBody');
        showToast = deps.showToast;
        confirmDialog = deps.confirmDialog;
        document.getElementById('smClose').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        body.addEventListener('click', onBodyClick);
        body.addEventListener('change', onBodyChange);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) close(); });
    }

    return { init, open, close, isOpen };
})();
