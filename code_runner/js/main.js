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
        storageOption: document.getElementById('storageOption'),
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
        pmExportAll: document.getElementById('pmExportAll')
    };

    const isHttps = window.location.protocol === 'https:';
    let importMode = 'one';   // 'one' | 'all' — which import the hidden file input is serving

    // --- Init ---
    GlotProjects.init();
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
            storageOption: el.storageOption.value
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
        el.storageOption.value = p.storageOption || 'not-implemented';
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
            downloadJson('project-' + safeFile(r.name) + '.json', r.json);
        } else if (act === 'delete') {
            const p = GlotProjects.getProject(id);
            const ok = await confirmDialog('确定删除项目 “' + (p ? p.name : id) + '”？此操作不可撤销。');
            if (!ok) return;
            const r = GlotProjects.remove(id);
            if (!r.ok) { showToast(r.error, 'error'); return; }
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

    function onExportAll() {
        const r = GlotProjects.exportAll();
        if (r.count === 0) { showToast('没有可导出的项目（默认项目不会被导出）', 'error'); return; }
        downloadJson('projects-all.json', r.json);
        showToast('已导出 ' + r.count + ' 个项目', 'success');
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
        reader.onload = () => {
            let parsed;
            try { parsed = JSON.parse(reader.result); }
            catch (err) { showToast('无法解析文件：不是有效的 JSON', 'error'); return; }
            const r = importMode === 'all' ? GlotProjects.importAll(parsed) : GlotProjects.importOne(parsed);
            if (!r.ok) { showToast('导入失败：' + r.error, 'error'); return; }
            renderProjectList();
            syncProjectSelect();
            showToast(importMode === 'all' ? ('成功导入 ' + r.added.length + ' 个项目') : ('成功导入项目：' + r.name), 'success');
        };
        reader.onerror = () => showToast('读取文件失败', 'error');
        reader.readAsText(file);
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

        try {
            const result = await GlotExecutor.execute(data);
            GlotOutput.displayResult(result, data.outputFormat, el.output, el.result);
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
