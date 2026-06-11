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
        // request method (glot api / docker run)
        requestMethod: document.getElementById('requestMethod'),
        glotConfig: document.getElementById('glotConfig'),
        dockerConfig: document.getElementById('dockerConfig'),
        dockerUrl: document.getElementById('dockerUrl'),
        dockerToken: document.getElementById('dockerToken'),
        toggleDockerToken: document.getElementById('toggleDockerToken'),
        securityNotice: document.getElementById('security-notice'),
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
        pmSearch: document.getElementById('pmSearch'),
        // storage feature
        openStorageBtn: document.getElementById('openStorageBtn'),
        openEnvBtn: document.getElementById('openEnvBtn')
    };

    const isHttps = window.location.protocol === 'https:';
    let importMode = 'one';   // 'one' | 'all' — which import the hidden file input is serving
    let pmFilter = '';        // project-manager live search keyword

    // --- Init ---
    GlotProjects.init();
    GlotStore.init();
    initSecurity();
    loadApiKey();
    loadRequestConfig();
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

    // Request method (Glot API / Docker Run): switch UI + persist (browser-only, never exported)
    el.requestMethod.addEventListener('change', () => { updateRequestMethodUI(); persistRequestConfig(); });
    el.dockerUrl.addEventListener('change', persistRequestConfig);
    el.dockerToken.addEventListener('change', persistRequestConfig);
    el.toggleDockerToken.addEventListener('click', () => {
        const isPwd = el.dockerToken.type === 'password';
        el.dockerToken.type = isPwd ? 'text' : 'password';
        const icon = el.toggleDockerToken.querySelector('i');
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
    el.pmSearch.addEventListener('input', () => { pmFilter = el.pmSearch.value.trim(); renderProjectList(); });

    // Storage feature: enable toggle + two modals
    el.storageToggle.addEventListener('change', () => { saveActiveProject(); updateStorageButtons(); });
    GlotStorageModal.init({ showToast: showToast, confirmDialog: confirmDialog });
    GlotEnvModal.init({ showToast: showToast, confirmDialog: confirmDialog, downloadJson: downloadJson });
    el.openStorageBtn.addEventListener('click', () => requireStorageOn() && GlotStorageModal.open());
    el.openEnvBtn.addEventListener('click', () => requireStorageOn() && GlotEnvModal.open());

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
        el.apiKeyHint.style.display = el.apiKey.value.trim() ? 'none' : '';   // '' -> CSS inline-flex
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

    // --- Request method + docker config (one per browser, never exported) ---
    function loadRequestConfig() {
        const cfg = GlotProjects.loadRequestConfig();
        el.requestMethod.value = cfg.method;
        el.dockerUrl.value = cfg.dockerUrl;
        el.dockerToken.value = cfg.dockerToken;
        updateRequestMethodUI();
    }
    function persistRequestConfig() {
        GlotProjects.saveRequestConfig({
            method: el.requestMethod.value,
            dockerUrl: el.dockerUrl.value,
            dockerToken: el.dockerToken.value
        });
    }
    function updateRequestMethodUI() {
        const isDocker = el.requestMethod.value === 'docker';
        el.glotConfig.hidden = isDocker;
        el.dockerConfig.hidden = !isDocker;
        el.securityNotice.style.display = isDocker ? 'none' : '';   // userscript notice only for Glot API
    }

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
        const kw = pmFilter.toLowerCase();
        const items = GlotProjects.list().filter(it => !kw || it.name.toLowerCase().indexOf(kw) !== -1);
        const activeId = GlotProjects.getActiveId();
        if (!items.length) {
            el.projectList.innerHTML = '<li class="pm-empty">未找到匹配“' + GlotUtils.escapeHtml(pmFilter) + '”的项目</li>';
            return;
        }
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

    function openModal() {
        pmFilter = '';
        el.pmSearch.value = '';
        renderProjectList();
        el.modalOverlay.hidden = false;
    }
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
        pmFilter = '';
        el.pmSearch.value = '';   // clear search so the new project is visible for inline rename
        renderProjectList();
        syncProjectSelect();
        // auto-focus inline rename on the freshly created project
        const row = el.projectList.querySelector('.project-row[data-id="' + id + '"]');
        const nameEl = row && row.querySelector('.project-row-name.editable');
        if (nameEl) startInlineRename(nameEl);
    }

    async function onExportAll() {
        saveActiveProject();
        const withStorage = await confirmDialog(
            '同时导出全部存储数据？\n' +
            '包含存储库、备份等全部存储数据，默认项目不导出。\n' +
            '（模拟环境配置不参与项目导出，请单独导出）'
        );
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
            '将丢弃当前的全部项目与存储数据，替换为导入文件的内容，且不可撤销。\n' +
            '（模拟环境配置不参与项目导入，请单独导入）\n\n' +
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

    // ============================ Storage feature entry buttons ============================
    // Disable the two entry buttons (keep their color) when storage is off; hover shows why.
    function updateStorageButtons() {
        const on = el.storageToggle.checked;
        [el.openStorageBtn, el.openEnvBtn].forEach(b => {
            b.classList.toggle('is-disabled', !on);
            if (on) b.removeAttribute('title'); else b.title = '需先开启存储功能';
        });
    }
    // Guard the modal-open buttons: storage must be enabled first.
    function requireStorageOn() {
        if (el.storageToggle.checked) return true;
        showToast('需先开启存储功能', 'error');
        return false;
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
        const data = Object.assign({ apiKey: el.apiKey.value }, collectProjectData(), {
            requestMethod: el.requestMethod.value,
            dockerUrl: el.dockerUrl.value.trim(),
            dockerToken: el.dockerToken.value
        });
        const isDocker = data.requestMethod === 'docker';

        if (!data.language) {
            showToast('请选择编程语言', 'error'); return;
        }
        if (data.language !== 'text') {
            if (isDocker && !data.dockerUrl) { showToast('请填写 Docker Run 请求地址', 'error'); return; }
            if (!isDocker && !data.apiKey) { showToast('请填写 Glot API Token', 'error'); return; }
        }
        if (data.codeSource === 'url' && !data.codeUrl) {
            showToast('请提供代码 URL', 'error'); return;
        }
        if (data.codeSource === 'textarea' && !data.code) {
            showToast('请输入代码', 'error'); return;
        }

        persistApiKey();
        persistRequestConfig();
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
