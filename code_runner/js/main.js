document.addEventListener('DOMContentLoaded', function() {

    // DOM elements
    const el = {
        form: document.getElementById('codeForm'),
        apiKey: document.getElementById('apiKey'),
        togglePwd: document.getElementById('togglePassword'),
        language: document.getElementById('language'),
        codeSource: document.getElementById('codeSource'),
        urlGroup: document.getElementById('urlGroup'),
        codeGroup: document.getElementById('codeGroup'),
        codeUrl: document.getElementById('codeUrl'),
        code: document.getElementById('code'),
        stdin: document.getElementById('stdin'),
        outputFormat: document.getElementById('outputFormat'),
        storageToggle: document.getElementById('storageToggle'),
        runBtn: document.getElementById('runButton'),
        result: document.getElementById('result'),
        output: document.getElementById('output'),
        httpsWarn: document.getElementById('httpsWarning'),
        debugMode: document.getElementById('debugMode'),
        debugSection: document.getElementById('debugSection'),
        apiKeyHint: document.getElementById('apiKeyHint'),
        // project management
        projectSelect: document.getElementById('projectSelect'),
        manageBtn: document.getElementById('manageProjectsBtn'),
        modalOverlay: document.getElementById('projectModalOverlay'),
        projectList: document.getElementById('projectList'),
        importFile: document.getElementById('importFileInput'),
        pmClose: document.getElementById('pmClose'),
        pmNew: document.getElementById('pmNew'),
        pmImportOne: document.getElementById('pmImportOne'),
        pmImportAll: document.getElementById('pmImportAll'),
        pmExportAll: document.getElementById('pmExportAll'),
        // storage feature
        openStorageBtn: document.getElementById('openStorageBtn'),
        openEnvBtn: document.getElementById('openEnvBtn'),
        storageOverlay: document.getElementById('storageModalOverlay'),
        storageBody: document.getElementById('storageModalBody'),
        smClose: document.getElementById('smClose'),
        envOverlay: document.getElementById('envModalOverlay'),
        envBody: document.getElementById('envModalBody'),
        emClose: document.getElementById('emClose')
    };

    const isHttps = window.location.protocol === 'https:';
    let importMode = 'one';   // 'one' | 'all' — which import the hidden file input is serving
    let smViewUserID = null;  // which mock userID's storage the 存储管理 modal is currently viewing
    let smTab = 'project';    // 存储管理 active tab: 'project' | 'buckets' | 'recovery'
    let smBucketOpen = {};    // bucketId -> whether its card body (data + backups) is expanded

    // --- Init ---
    GlotProjects.init();
    GlotStore.init();
    initSecurity();
    loadApiKey();
    applyProjectData(GlotProjects.getProject(GlotProjects.getActiveId()));
    syncProjectSelect();
    setupTooltipClamping();

    // --- Event listeners ---
    el.apiKey.addEventListener('mousedown', e => e.stopPropagation());
    el.apiKey.addEventListener('click', function(e) { e.stopPropagation(); this.focus(); });
    el.apiKey.addEventListener('keydown', e => e.stopPropagation());
    el.apiKey.addEventListener('keyup', e => { e.stopPropagation(); checkApiKeyHint(); });
    el.apiKey.addEventListener('change', persistApiKey);   // shared token persists on blur

    document.querySelector('.password-container').addEventListener('click', function(e) {
        if (e.target === this) el.apiKey.focus();
    });

    el.togglePwd.addEventListener('click', () => {
        const isPwd = el.apiKey.type === 'password';
        el.apiKey.type = isPwd ? 'text' : 'password';
        const icon = el.togglePwd.querySelector('i');
        icon.classList.toggle('fa-eye', !isPwd);
        icon.classList.toggle('fa-eye-slash', isPwd);
    });

    el.codeSource.addEventListener('change', updateCodeSourceUI);
    el.debugMode.addEventListener('change', updateRunBtnState);

    el.form.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!isHttps && !el.debugMode.checked) {
            GlotOutput.displayError(
                '当前为非HTTPS环境，为了安全起见，请开启调试模式或使用HTTPS链接：https://page.tiedan.site/code_runner',
                el.output, el.result
            );
            return;
        }
        await runCode();
    });

    // Project switching + management
    el.projectSelect.addEventListener('change', () => switchTo(el.projectSelect.value));
    el.manageBtn.addEventListener('click', openModal);
    el.pmClose.addEventListener('click', closeModal);
    el.modalOverlay.addEventListener('click', e => { if (e.target === el.modalOverlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.modalOverlay.hidden) closeModal(); });
    el.projectList.addEventListener('click', onListClick);
    el.pmNew.addEventListener('click', onNewProject);
    el.pmExportAll.addEventListener('click', onExportAll);
    el.pmImportOne.addEventListener('click', () => triggerImport('one'));
    el.pmImportAll.addEventListener('click', () => triggerImport('all'));
    el.importFile.addEventListener('change', onImportFile);

    // Storage feature: enable toggle + two modals
    el.storageToggle.addEventListener('change', () => { saveActiveProject(); updateStorageButtons(); });
    el.openStorageBtn.addEventListener('click', openStorageModal);
    el.openEnvBtn.addEventListener('click', openEnvModal);
    el.smClose.addEventListener('click', closeStorageModal);
    el.emClose.addEventListener('click', closeEnvModal);
    el.storageOverlay.addEventListener('click', e => { if (e.target === el.storageOverlay) closeStorageModal(); });
    el.envOverlay.addEventListener('click', e => { if (e.target === el.envOverlay) closeEnvModal(); });
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (!el.envOverlay.hidden) closeEnvModal();
        else if (!el.storageOverlay.hidden) closeStorageModal();
    });
    el.storageBody.addEventListener('click', onStorageBodyClick);
    el.storageBody.addEventListener('change', onStorageBodyChange);
    el.envBody.addEventListener('click', onEnvBodyClick);
    el.envBody.addEventListener('change', onEnvBodyChange);

    // Persist edits when leaving the page (covers edits made without running)
    window.addEventListener('beforeunload', persistAll);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistAll(); });

    // --- Security / UI helpers (unchanged) ---
    function initSecurity() {
        if (!isHttps) {
            el.httpsWarn.style.display = 'block';
        } else {
            el.debugSection.classList.add('hidden');
        }
        updateRunBtnState();
        if (window.corsFetch) {
            document.querySelector('#security-notice').classList.add('safe');
            document.querySelector('#security-notice-text').innerText =
                '您已安装用户脚本，请求将通过用户脚本发送而无需经过中间服务器，您的连接是安全的！';
        }
    }

    function updateRunBtnState() {
        if (!isHttps) {
            if (!el.debugMode.checked) {
                el.runBtn.disabled = true;
                el.runBtn.title = '请在HTTPS环境下使用或开启调试模式';
                el.runBtn.style.background = "#95a5a6";
                el.debugSection.style.background = "#f8f9fa";
            } else {
                el.runBtn.disabled = false;
                el.runBtn.title = '[调试模式] API Key可能不安全';
                el.runBtn.style.background = "#f39c12";
                el.debugSection.style.background = "#fff8e1";
            }
        } else {
            el.runBtn.disabled = false;
            el.runBtn.title = '';
        }
    }

    function updateCodeSourceUI() {
        const isUrl = el.codeSource.value === 'url';
        el.urlGroup.style.display = isUrl ? 'block' : 'none';
        el.codeGroup.style.display = isUrl ? 'none' : 'block';
    }

    function checkApiKeyHint() {
        el.apiKeyHint.style.display = el.apiKey.value.trim() ? 'none' : 'block';
    }

    // Keep hover tooltips fully inside the viewport
    function setupTooltipClamping() {
        const margin = 8;
        document.querySelectorAll('.tooltip').forEach(tip => {
            const content = tip.querySelector('.tooltip-content');
            if (!content) return;
            tip.addEventListener('mouseenter', () => {
                content.style.marginLeft = '0px';   // reset previous nudge before measuring the default position
                const rect = content.getBoundingClientRect();
                const vw = window.innerWidth || document.documentElement.clientWidth;
                let shift = 0;
                if (rect.left < margin) {
                    shift = margin - rect.left;             // overflowing left edge -> move right
                } else if (vw && rect.right > vw - margin) {
                    shift = (vw - margin) - rect.right;     // overflowing right edge -> move left
                }
                if (shift) content.style.marginLeft = shift + 'px';
            });
        });
    }

    // --- Shared token (one per browser, all projects) ---
    function loadApiKey() { el.apiKey.value = GlotProjects.loadToken(); checkApiKeyHint(); }
    function persistApiKey() { GlotProjects.saveToken(el.apiKey.value); }

    // --- Per-project workspace ---
    function collectProjectData() {
        return {
            language: el.language.value,
            codeSource: el.codeSource.value,
            codeUrl: el.codeUrl.value,
            code: el.code.value,
            stdin: el.stdin.value,
            outputFormat: el.outputFormat.value,
            storageOption: el.storageToggle.checked ? 'enabled' : 'disabled'
        };
    }
    function applyProjectData(p) {
        p = p || {};
        el.language.value = p.language || '';
        el.codeSource.value = p.codeSource || 'textarea';
        el.codeUrl.value = p.codeUrl || '';
        el.code.value = p.code || '';
        el.stdin.value = p.stdin || '';
        el.outputFormat.value = p.outputFormat || 'text';
        el.storageToggle.checked = (p.storageOption === 'enabled');
        updateStorageButtons();
        updateCodeSourceUI();
    }
    function saveActiveProject() {
        GlotProjects.saveProjectData(GlotProjects.getActiveId(), collectProjectData());
    }
    function persistAll() { persistApiKey(); saveActiveProject(); }

    function switchTo(id) {
        if (id === GlotProjects.getActiveId()) return;
        saveActiveProject();                       // flush current edits to the outgoing project
        if (!GlotProjects.setActive(id)) { syncProjectSelect(); return; }
        applyProjectData(GlotProjects.getProject(id));
        syncProjectSelect();
    }
    function syncProjectSelect() {
        const items = GlotProjects.list();
        const activeId = GlotProjects.getActiveId();
        el.projectSelect.innerHTML = items
            .map(it => '<option value="' + it.id + '">' + GlotUtils.escapeHtml(it.name) + '</option>')
            .join('');
        el.projectSelect.value = activeId;
    }

    // --- Project management modal ---
    function attrEsc(s) { return GlotUtils.escapeHtml(s).replace(/"/g, '&quot;'); }

    function renderProjectList() {
        const items = GlotProjects.list();
        const activeId = GlotProjects.getActiveId();
        el.projectList.innerHTML = items.map(it => {
            const nm = GlotUtils.escapeHtml(it.name);
            const isActive = it.id === activeId;
            const badge = isActive ? '<span class="project-row-badge">当前</span>' : '';
            const nameCls = it.isDefault ? 'project-row-name' : 'project-row-name editable';
            let actions = '';
            if (!isActive) actions += '<button type="button" class="btn-switch" data-act="switch">切换</button>';
            actions += '<button type="button" class="btn-dup" data-act="duplicate">复制</button>';
            if (!it.isDefault) {
                actions += '<button type="button" class="btn-export" data-act="export">导出</button>'
                         + '<button type="button" class="btn-del" data-act="delete">删除</button>';
            }
            return '<li class="project-row" data-id="' + attrEsc(it.id) + '">'
                 + '<div class="project-row-head">'
                 +   '<span class="' + nameCls + '" title="' + attrEsc(it.name) + '">' + nm + '</span>'
                 +   badge
                 + '</div>'
                 + '<div class="project-row-actions">' + actions + '</div>'
                 + '</li>';
        }).join('');
    }

    function openModal() { renderProjectList(); el.modalOverlay.hidden = false; }
    function closeModal() { el.modalOverlay.hidden = true; }

    // Inline rename: click a (non-default) project name -> input; Enter/blur commits, Esc cancels
    function startInlineRename(nameEl) {
        if (nameEl.querySelector('input')) return;
        const id = nameEl.closest('.project-row').getAttribute('data-id');
        const original = (GlotProjects.getProject(id) || {}).name || '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'project-row-name-input';
        input.maxLength = 60;
        input.value = original;
        nameEl.textContent = '';
        nameEl.appendChild(input);
        input.focus();
        input.select();
        let done = false;
        const commit = () => {
            if (done) return; done = true;
            const nn = input.value.trim();
            if (!nn || nn === original) { renderProjectList(); return; }
            const r = GlotProjects.rename(id, nn);
            renderProjectList();
            syncProjectSelect();
            if (r.ok && r.name !== nn) showToast('名称重复，已重命名为 ' + r.name, 'info');
        };
        const cancel = () => { if (done) return; done = true; renderProjectList(); };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', ev => {
            ev.stopPropagation();   // keep Enter/Esc out of the modal's global key handler
            if (ev.key === 'Enter') input.blur();
            else if (ev.key === 'Escape') cancel();
        });
    }

    async function onListClick(e) {
        // click a project name (non-default) -> inline rename
        const nameEl = e.target.closest('.project-row-name.editable');
        if (nameEl) { startInlineRename(nameEl); return; }

        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.closest('.project-row').getAttribute('data-id');
        const act = btn.getAttribute('data-act');

        if (act === 'switch') {
            switchTo(id);
            closeModal();
        } else if (act === 'duplicate') {
            saveActiveProject();                   // keep active project's data current before copy
            GlotProjects.duplicate(id);
            renderProjectList();
            syncProjectSelect();
            showToast('已复制项目', 'success');
        } else if (act === 'export') {
            saveActiveProject();                   // ensure active project's export reflects current edits
            const r = GlotProjects.exportOne(id);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            const withStorage = await confirmDialog('同时导出此项目的存储数据？\n（包含 global/storage 与关联 bucket 存储库的当前数据，不含备份）');
            let payload = r.json;
            if (withStorage) {
                const obj = JSON.parse(r.json);
                obj.storage = GlotStore.exportProjectStorage(id);
                payload = JSON.stringify(obj, null, 2);
            }
            downloadJson('project-' + safeFile(r.name) + '.json', payload);
            showToast(withStorage ? '已导出项目（含存储数据）' : '已导出项目', 'success');
        } else if (act === 'delete') {
            const p = GlotProjects.getProject(id);
            const ok = await confirmDialog('确定删除项目 “' + (p ? p.name : id) + '”？此操作不可撤销。');
            if (!ok) return;
            const r = GlotProjects.remove(id);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            GlotStore.removeProjectStorage(id);    // clear this project's global/storage/links
            applyProjectData(GlotProjects.getProject(GlotProjects.getActiveId()));   // reload (may have fallen back to default)
            renderProjectList();
            syncProjectSelect();
            showToast('已删除项目', 'success');
        }
    }

    function onNewProject() {
        saveActiveProject();
        const id = GlotProjects.create('新项目');
        GlotProjects.setActive(id);
        applyProjectData(GlotProjects.getProject(id));
        renderProjectList();
        syncProjectSelect();
        // auto-focus inline rename on the freshly created project
        const row = el.projectList.querySelector('.project-row[data-id="' + id + '"]');
        const nameEl = row && row.querySelector('.project-row-name.editable');
        if (nameEl) startInlineRename(nameEl);
    }

    async function onExportAll() {
        saveActiveProject();
        const withStorage = await confirmDialog('同时导出全部存储数据？\n（包含存储库、备份、模拟环境等全部数据；默认项目不导出）');
        const full = GlotStore.buildFullExport({ includeDefault: false, includeStorage: withStorage });
        const count = Object.keys((full.projects && full.projects.projects) || {}).length;
        if (count === 0) { showToast('没有可导出的项目（默认项目不导出）', 'error'); return; }
        downloadJson('code_runner-projects-all.json', JSON.stringify(full, null, 2));
        showToast('已导出 ' + count + ' 个项目' + (withStorage ? '（含全部存储数据）' : ''), 'success');
    }

    function triggerImport(mode) {
        importMode = mode;
        el.importFile.value = '';   // allow re-importing the same file
        el.importFile.click();
    }

    function onImportFile(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            let parsed;
            try { parsed = JSON.parse(reader.result); }
            catch (err) { showToast('无法解析文件：不是有效的 JSON', 'error'); return; }
            if (importMode === 'all') await importAllFlow(parsed);
            else await importOneFlow(parsed);
        };
        reader.onerror = () => showToast('读取文件失败', 'error');
        reader.readAsText(file);
    }

    async function importOneFlow(parsed) {
        const r = GlotProjects.importOne(parsed);
        if (!r.ok) { showToast('导入失败：' + r.error, 'error'); return; }
        let extra = '';
        if (parsed && parsed.storage && typeof parsed.storage === 'object') {
            const conflicts = GlotStore.planStorageConflicts(parsed.storage);
            let overwrite = false;
            if (conflicts.length) {
                overwrite = await confirmDialog(
                    '导入的存储库 ID [' + conflicts.join(', ') + '] 与本地已有存储库冲突。\n\n' +
                    '“确定”：用导入数据覆盖本地存储库内容（旧内容移入恢复区）\n' +
                    '“取消”：保留本地内容（未采用的导入数据移入恢复区）'
                );
                extra = '（含存储数据，冲突已' + (overwrite ? '覆盖，旧数据' : '保留，新数据') + '移入恢复区）';
            } else {
                extra = '（含存储数据）';
            }
            GlotStore.applyStorageImport(r.id, parsed.storage, overwrite);
        }
        renderProjectList();
        syncProjectSelect();
        showToast('成功导入项目：' + r.name + extra, 'success');
    }

    async function importAllFlow(parsed) {
        const isFull = parsed && parsed.kind === 'cr-full';
        const isLegacy = parsed && parsed.kind === 'cr-projects' && Array.isArray(parsed.projects);
        if (!isFull && !isLegacy) { showToast('导入失败：文件格式不正确（应为「全部」导出文件）', 'error'); return; }
        const ok = await confirmDialog(
            '【导入全部 = 全盘替换】\n\n' +
            '将丢弃当前的全部项目与存储数据，替换为导入文件的内容，且不可撤销。\n\n' +
            '点“确定”后会先自动下载当前全部数据的备份文件，随后执行替换。'
        );
        if (!ok) return;
        // 1) auto-download a full backup of CURRENT data first; abort import if it throws
        try {
            const backup = GlotStore.buildFullExport({ includeDefault: true, includeStorage: true });
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            downloadJson('code_runner-backup-' + ts + '.json', JSON.stringify(backup, null, 2));
        } catch (err) {
            showToast('自动备份失败，已中止导入：' + ((err && err.message) || err), 'error');
            return;
        }
        // 2) full replace (cr_recovery is intentionally left untouched)
        if (isFull) {
            GlotStore.fullReplace(parsed);
        } else {
            GlotProjects.replaceAllFromArray(parsed.projects);
            GlotStore.fullReplace({ projects: GlotProjects.snapshot(true) });   // reset storage/buckets/env, keep imported projects
        }
        applyProjectData(GlotProjects.getProject(GlotProjects.getActiveId()));
        renderProjectList();
        syncProjectSelect();
        closeModal();
        showToast('已全盘替换为导入数据（旧数据已自动备份下载）', 'success');
    }

    // --- In-page toast + confirm (replace window.alert / window.confirm) ---
    let toastWrap = null;
    function showToast(message, type) {
        if (!toastWrap) {
            toastWrap = document.createElement('div');
            toastWrap.className = 'cr-toast-wrap';
            document.body.appendChild(toastWrap);
        }
        const t = document.createElement('div');
        t.className = 'cr-toast' + (type ? ' ' + type : '');
        t.textContent = message;
        toastWrap.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
    }

    function confirmDialog(message) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'cr-confirm-overlay';
            overlay.innerHTML =
                '<div class="cr-confirm" role="dialog" aria-modal="true">'
              +   '<div class="cr-confirm-msg"></div>'
              +   '<div class="cr-confirm-btns">'
              +     '<button type="button" class="cr-confirm-cancel">取消</button>'
              +     '<button type="button" class="cr-confirm-ok">确定</button>'
              +   '</div>'
              + '</div>';
            overlay.querySelector('.cr-confirm-msg').textContent = message;
            const onKey = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(false); } };
            const close = val => { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(val); };
            overlay.querySelector('.cr-confirm-ok').addEventListener('click', () => close(true));
            overlay.querySelector('.cr-confirm-cancel').addEventListener('click', () => close(false));
            overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
            document.body.appendChild(overlay);
            document.addEventListener('keydown', onKey, true);
            overlay.querySelector('.cr-confirm-ok').focus();
        });
    }

    function safeFile(name) {
        return (String(name || 'project').replace(/[^\w一-龥.-]+/g, '_') || 'project').slice(0, 40);
    }
    function downloadJson(filename, jsonString) {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    }

    // ============================ Storage management modal ============================
    // Disable the two entry buttons (keep their color) when storage is off; hover shows why.
    function updateStorageButtons() {
        const on = el.storageToggle.checked;
        [el.openStorageBtn, el.openEnvBtn].forEach(b => {
            b.classList.toggle('is-disabled', !on);
            if (on) b.removeAttribute('title'); else b.title = '需先开启存储功能';
        });
    }
    function openStorageModal() {
        if (!el.storageToggle.checked) { showToast('需先开启存储功能', 'error'); return; }
        smViewUserID = String(Number(GlotStore.composeEnvValues().userID) || 10001);
        smTab = 'project';
        smBucketOpen = {};
        renderStorageModal(); el.storageOverlay.hidden = false;
    }
    function closeStorageModal() { el.storageOverlay.hidden = true; }

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
                    '<span class="slot-meta">' + formatTime(bk.time) + ' · ' + String(bk.content).length + ' 字</span>' +
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
        const body =
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
        return '<div class="sm-bucket-card open" data-id="' + b.id + '">' + head + body + '</div>';
    }

    function renderStorageModal() {
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

        // --- tab bar (replaces section headers) ---
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
        el.storageBody.innerHTML = tabs + enabledHint + '<div class="sm-tab-content">' + content + '</div>';
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
            else renderStorageModal();
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
            renderStorageModal();
            if (!r.ok) showToast(r.error, 'error');
        });
    }
    function startBackupRename(spanEl) {
        const card = spanEl.closest('.sm-bucket-card');
        const id = Number(card.getAttribute('data-id'));
        const slot = Number(spanEl.closest('.backup-slot').getAttribute('data-slot'));
        const b = GlotStore.getBucket(id);
        const cur = (b && b.backups[slot]) ? b.backups[slot].name : '';
        inlineEdit(spanEl, cur, 40, nn => { GlotStore.renameBackup(id, slot, nn); renderStorageModal(); });
    }

    async function onStorageBodyClick(e) {
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
            renderStorageModal();
        } else if (act === 'bucket-toggle') {
            smBucketOpen[bucketId] = !smBucketOpen[bucketId];
            renderStorageModal();
        } else if (act === 'backup-view') {
            const bk = (GlotStore.getBucket(bucketId) || { backups: [] }).backups[slot];
            if (bk) await confirmDialog('【备份内容】槽' + (slot + 1) + '（' + bk.name + '，' + formatTime(bk.time) + '）\n\n' + bk.content);
        } else if (act === 'save-global') {
            toastResult(GlotStore.setGlobal(pid, el.storageBody.querySelector('.sm-global').value), 'global 已保存');
        } else if (act === 'save-storage') {
            const r = GlotStore.setUserStorage(pid, smViewUserID, el.storageBody.querySelector('.sm-storage').value);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            renderStorageModal(); showToast('storage 已保存（用户 ' + smViewUserID + '）', 'success');
        } else if (act === 'clear-storage') {
            if (!await confirmDialog('清空用户 ' + smViewUserID + ' 的 storage？该条目将被删除。')) return;
            GlotStore.setUserStorage(pid, smViewUserID, '');
            renderStorageModal(); showToast('已清空 storage', 'success');
        } else if (act === 'link') {
            const sel = el.storageBody.querySelector('.sm-link-select');
            if (!sel || !sel.value) return;
            const r = GlotStore.linkBucket(pid, Number(sel.value));
            if (!r.ok) { showToast(r.error, 'error'); return; }
            renderStorageModal(); showToast('已关联存储库', 'success');
        } else if (act === 'unlink') {
            GlotStore.unlinkBucket(pid, Number(btn.getAttribute('data-id')));
            renderStorageModal(); showToast('已解除关联', 'success');
        } else if (act === 'new-bucket') {
            const r = GlotStore.createBucket('新存储库', '');
            if (!r.ok) { showToast(r.error, 'error'); return; }
            renderStorageModal();
            const newCard = el.storageBody.querySelector('.sm-bucket-card[data-id="' + r.id + '"]');
            const nameEl = newCard && newCard.querySelector('.sm-bucket-name.editable');
            if (nameEl) startBucketRename(nameEl);
            showToast('已创建存储库 #' + r.id, 'success');
        } else if (act === 'bucket-save') {
            GlotStore.setBucketDesc(bucketId, card.querySelector('.sm-bucket-desc').value);
            const r = GlotStore.setBucketContent(bucketId, card.querySelector('.sm-bucket-content').value);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            renderStorageModal(); showToast('已保存存储库内容', 'success');
        } else if (act === 'bucket-del') {
            const b = GlotStore.getBucket(bucketId);
            if (!await confirmDialog('删除存储库 #' + bucketId + ' “' + (b ? b.name : '') + '”？\n所有项目的关联会被解除，备份一并删除，不可恢复。')) return;
            GlotStore.deleteBucket(bucketId);
            renderStorageModal(); showToast('已删除存储库', 'success');
        } else if (act === 'backup-create') {
            const r = GlotStore.createBackup(bucketId, slot);
            if (r.occupied) {
                if (!await confirmDialog('槽' + (slot + 1) + ' 已有备份（' + r.existing.name + '，' + formatTime(r.existing.time) + '）。\n覆盖后旧备份不可恢复，确认覆盖？')) return;
                toastResult(GlotStore.overwriteBackup(bucketId, slot), '已覆盖备份'); renderStorageModal(); return;
            }
            if (!r.ok) { showToast(r.error, 'error'); return; }
            renderStorageModal(); showToast('已创建备份', 'success');
        } else if (act === 'backup-overwrite') {
            if (!await confirmDialog('用当前主存储区内容覆盖槽' + (slot + 1) + ' 的备份？\n旧备份不可恢复。')) return;
            const r = GlotStore.overwriteBackup(bucketId, slot);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            renderStorageModal(); showToast('已覆盖备份', 'success');
        } else if (act === 'backup-del') {
            if (!await confirmDialog('删除槽' + (slot + 1) + ' 的备份？此操作不可恢复。')) return;
            GlotStore.deleteBackup(bucketId, slot);
            renderStorageModal(); showToast('已删除备份', 'success');
        } else if (act === 'backup-rollback') {
            if (!await confirmDialog('回滚：用槽' + (slot + 1) + ' 的备份覆盖存储库 #' + bucketId + ' 的主存储区？')) return;
            if (!await confirmDialog('⚠️ 二次确认：当前主存储区内容将被覆盖且【无法恢复】（不会自动备份当前值）。确认回滚？')) return;
            const r = GlotStore.rollbackBackup(bucketId, slot);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            renderStorageModal(); showToast('已回滚', 'success');
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
            renderStorageModal(); showToast('已复制到存储库 #' + targetId, 'success');
        } else if (act === 'recovery-del') {
            GlotStore.deleteRecovery(btn.closest('.recovery-item').getAttribute('data-rid'));
            renderStorageModal(); showToast('已删除恢复记录', 'success');
        } else if (act === 'recovery-clear') {
            if (!await confirmDialog('清空恢复区？所有恢复数据将被删除，不可恢复。')) return;
            GlotStore.clearRecovery();
            renderStorageModal(); showToast('已清空恢复区', 'success');
        }
    }

    // Switch which user's storage the viewer shows
    function onStorageBodyChange(e) {
        const sel = e.target.closest('.sm-user-select');
        if (!sel) return;
        smViewUserID = sel.value;
        renderStorageModal();
    }

    // ============================ Mock environment modal ============================
    const ENV_DESC = {
        userID: '用户ID，决定 storage 归属',
        nickname: '用户昵称',
        from: '来源：群名(群号) 或 private',
        platform: '平台，如 qq、kook（platformID 自动生成）',
        avatar: '头像URL'
    };
    function openEnvModal() {
        if (!el.storageToggle.checked) { showToast('需先开启存储功能', 'error'); return; }
        renderEnvModal(); el.envOverlay.hidden = false;
    }
    function closeEnvModal() {
        el.envOverlay.hidden = true;
        if (!el.storageOverlay.hidden) renderStorageModal();   // reflect any userID change behind it
    }
    // Debug-style summary (mirrors the bot log): global/storage as lengths, bucket as [id](contentLen).
    function updateEnvPreview() {
        const pre = document.getElementById('envPreview');
        if (!pre) return;
        const raw = GlotStore.buildStorageInput(GlotProjects.getActiveId());
        let o; try { o = JSON.parse(raw); } catch (e) { pre.textContent = raw; return; }
        const bucketStr = (o.bucket || []).map(b => '[' + b.id + '](' + String(b.content == null ? '' : b.content).length + ')').join(' ');
        const imgCount = (o.images || []).length;
        pre.textContent =
            'global{' + String(o.global || '').length + '}  storage{' + String(o.storage || '').length + '}\n' +
            'bucket{ ' + bucketStr + ' }\n' +
            'userID: ' + o.userID + '    platformID: ' + o.platformID + '\n' +
            'nickname: ' + o.nickname + '\n' +
            'from: ' + o.from + '    platform: ' + o.platform + '\n' +
            'images: ' + (imgCount ? '[' + imgCount + ' 张]' : '[]');
    }
    function renderEnvModal() {
        const esc = GlotUtils.escapeHtml;
        const env = GlotStore.getEnv();
        const rows = GlotStore.ENV_FIELDS.map(f => {
            const fd = env.fields[f];
            const vals = fd.values.map(v => {
                const label = v === '' ? '(空)' : esc(v);
                const active = v === fd.current ? ' active' : '';
                return '<button class="env-val' + active + '" data-act="env-select" data-field="' + f + '" data-val="' + attrEsc(v) + '">' +
                    label + '<i class="env-val-del" data-act="env-del" data-field="' + f + '" data-val="' + attrEsc(v) + '">&times;</i></button>';
            }).join('');
            const compose = f === 'from'
                ? '<div class="env-from-compose"><input class="env-from-name" placeholder="群名称"><input class="env-from-id" placeholder="群号">' +
                  '<button class="btn-new" data-act="env-add-group">添加群聊</button>' +
                  '<button class="btn-switch" data-act="env-add-private">添加 private</button></div>'
                : '';
            const note = f === 'platform'
                ? '<div class="env-platformid-note">自动生成 platformID：<code>' + esc(GlotStore.composeEnvValues().platformID) + '</code></div>'
                : '';
            return '<div class="env-field-row" data-field="' + f + '">' +
                '<div><span class="env-field-name">' + esc(f) + '</span><span class="env-field-sub">' + esc(ENV_DESC[f]) + '</span></div>' +
                '<div class="env-values">' + vals + '</div>' +
                '<div class="env-add"><input class="env-add-input" placeholder="新增候选值"><button class="btn-new" data-act="env-add">添加</button></div>' +
                compose + note + '</div>';
        }).join('');
        const images = GlotStore.getEnvImages();
        const imageList = images.length
            ? images.map((im, i) =>
                '<div class="env-image-item"><img src="' + attrEsc(im.base64) + '" alt="">' +
                '<span class="env-image-name" title="' + attrEsc(im.name) + '">' + esc(im.name) + '</span>' +
                '<span class="env-image-size">≈' + Math.max(1, Math.round(im.base64.length / 1024)) + ' KB</span>' +
                '<button class="btn-del" data-act="env-image-del" data-index="' + i + '">删除</button></div>').join('')
            : '<span class="sm-empty-hint">未上传图片</span>';
        const imagesSection =
            '<div class="env-field-row env-images-row">' +
                '<div><span class="env-field-name">images</span><span class="env-field-sub">图片输入（url 字段暂不支持，仅传输 base64）</span></div>' +
                '<div class="env-image-list">' + imageList + '</div>' +
                '<div class="env-add"><button class="btn-new" data-act="env-image-pick">上传图片</button>' +
                '<input type="file" class="env-image-input" accept="image/*" multiple hidden>' +
                (images.length ? '<button class="btn-del" data-act="env-image-clear">清空</button>' : '') + '</div></div>';

        el.envBody.innerHTML =
            '<div class="env-preview-wrap"><div class="env-preview-head">' +
                '<label>JsonStorage 预览（运行时注入程序输入第一行）</label>' +
                '<button class="btn-view" data-act="env-copy-raw"><i class="fas fa-copy"></i> 复制原始数据</button></div>' +
            '<pre class="env-preview" id="envPreview"></pre></div>' + rows + imagesSection;
        updateEnvPreview();
    }
    function onEnvBodyClick(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        if (act === 'env-del') {
            const r = GlotStore.deleteEnvValue(btn.getAttribute('data-field'), btn.getAttribute('data-val'));
            if (!r.ok) { showToast(r.error, 'error'); return; }
            renderEnvModal();
        } else if (act === 'env-select') {
            GlotStore.setEnvCurrent(btn.getAttribute('data-field'), btn.getAttribute('data-val'));
            renderEnvModal();
        } else if (act === 'env-add') {
            const row = btn.closest('.env-field-row');
            const input = row.querySelector('.env-add-input');
            if (input.value === '') { showToast('请输入候选值（空值默认已存在）', 'error'); return; }
            const r = GlotStore.addEnvValue(row.getAttribute('data-field'), input.value);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            renderEnvModal();
        } else if (act === 'env-add-group') {
            const row = btn.closest('.env-field-row');
            const name = row.querySelector('.env-from-name').value.trim();
            const gid = row.querySelector('.env-from-id').value.trim();
            if (!name || !gid) { showToast('请填写群名称和群号', 'error'); return; }
            GlotStore.addEnvValue('from', name + '(' + gid + ')');
            renderEnvModal();
        } else if (act === 'env-add-private') {
            GlotStore.addEnvValue('from', 'private');
            renderEnvModal();
        } else if (act === 'env-copy-raw') {
            copyToClipboard(GlotStore.buildStorageInput(GlotProjects.getActiveId()));
        } else if (act === 'env-image-pick') {
            const inp = btn.closest('.env-field-row').querySelector('.env-image-input');
            if (inp) inp.click();
        } else if (act === 'env-image-del') {
            GlotStore.removeEnvImage(Number(btn.getAttribute('data-index')));
            renderEnvModal();
        } else if (act === 'env-image-clear') {
            GlotStore.clearEnvImages();
            renderEnvModal();
        }
    }
    // File picker -> base64 -> images[]
    function onEnvBodyChange(e) {
        const input = e.target.closest('.env-image-input');
        if (!input || !input.files || !input.files.length) return;
        const files = Array.prototype.slice.call(input.files);
        let pending = files.length;
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                const r = GlotStore.addEnvImage(file.name, reader.result);
                if (!r.ok) showToast('保存图片失败：' + (r.error || file.name), 'error');
                if (--pending === 0) renderEnvModal();
            };
            reader.onerror = () => { showToast('读取图片失败：' + file.name, 'error'); if (--pending === 0) renderEnvModal(); };
            reader.readAsDataURL(file);
        });
    }
    function copyToClipboard(text) {
        const done = () => showToast('已复制原始数据', 'success');
        const fallback = () => {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { showToast('复制失败，请手动复制', 'error'); }
            ta.remove();
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
        else fallback();
    }

    function setRunning(on) {
        if (on) {
            el.runBtn.disabled = true;
            el.runBtn.innerHTML = '<i class="fas fa-spinner pulse"></i> 执行中...';
            el.runBtn.classList.add('loading');
        } else {
            el.runBtn.disabled = false;
            el.runBtn.innerHTML = '<i class="fas fa-play"></i> 执行代码';
            el.runBtn.classList.remove('loading');
            updateRunBtnState();
        }
    }

    async function runCode() {
        const data = Object.assign({ apiKey: el.apiKey.value }, collectProjectData());

        if (!data.language) {
            alert('请选择编程语言'); return;
        }
        if (data.language !== 'text' && !data.apiKey) {
            alert('请填写API Key'); return;
        }
        if (data.codeSource === 'url' && !data.codeUrl) {
            alert('请提供代码URL'); return;
        }
        if (data.codeSource === 'textarea' && !data.code) {
            alert('请输入代码'); return;
        }

        persistApiKey();
        saveActiveProject();
        setRunning(true);

        // Storage feature: inject JsonStorage as stdin first line; extract+save after run.
        const activeId = GlotProjects.getActiveId();
        const storageOn = GlotStore.isEnabled(activeId);
        const saveGate = ['json', 'ForwardMessage', 'Audio'].indexOf(data.outputFormat) !== -1;
        if (storageOn) {
            data.stdin = GlotStore.buildStorageInput(activeId) + '\n' + (data.stdin || '');
            console.log('[存储] 程序完整输入:\n' + data.stdin);
        }

        try {
            const result = await GlotExecutor.execute(data);
            GlotOutput.displayResult(result, data.outputFormat, el.output, el.result, function (parsed) {
                if (!result.stdout) return;
                if (parsed && parsed.error) { showToast('存储未保存：' + parsed.error, 'error'); return; }
                if (!storageOn || !saveGate) return;
                const r = GlotStore.applyStorageOutput(activeId, parsed);
                if (r.errors && r.errors.length) {
                    showToast('【存储错误】\n' + r.errors.join('\n'), 'error');
                }
            });
        } catch (error) {
            console.error('执行代码时出错:', error);
            let msg = error.message;
            if (msg.includes('Failed to fetch') || msg.includes('CORS')) {
                msg += '\n\n由于 CORS 限制，尝试请求 Glot API 失败。请尝试再次执行，或者安装用户脚本代替公共代理。';
            } else if (msg.includes('corsdemo')) {
                msg += '\n\n第三方CORS代理服务提示需手动激活，请访问'
                    + ' <a href="https://cors-anywhere.herokuapp.com/corsdemo" target="_blank">https://cors-anywhere.herokuapp.com/corsdemo</a> '
                    + '点击 `Request temporary access to the demo server` 按钮获取临时访问权限后，再返回本页面重新请求执行。\n\n或者安装用户脚本代替公共代理。';
            }
            GlotOutput.displayError(msg, el.output, el.result);
        } finally {
            setRunning(false);
        }
    }
});
