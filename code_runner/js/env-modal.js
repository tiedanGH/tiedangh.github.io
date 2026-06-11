// Mock environment modal (模拟环境): per-field value libraries + image input that compose the JsonStorage line.
// Self-contained; depends on GlotStore/GlotProjects/GlotUtils (globals) + showToast/confirmDialog/downloadJson (injected via init).
const GlotEnvModal = (() => {
    let overlay, body, showToast, confirmDialog, downloadJson;
    const ENV_DESC = {
        userID: '用户ID，决定 storage 归属',
        nickname: '用户昵称',
        from: '来源：群名(群号) 或 private',
        platform: '平台，如 qq、kook（platformID 自动生成）',
        avatar: '头像URL'
    };

    function attrEsc(s) { return GlotUtils.escapeHtml(s).replace(/"/g, '&quot;'); }

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

    function render() {
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

        // 配置导入导出独立于项目（项目导入导出不再携带模拟环境）
        const configBar =
            '<div class="env-config-bar">' +
                '<span class="env-config-note">模拟环境配置独立于项目的导入导出</span>' +
                '<button class="btn-import" data-act="env-import-config"><i class="fas fa-file-import"></i> 导入配置</button>' +
                '<button class="btn-export" data-act="env-export-config"><i class="fas fa-upload"></i> 导出配置</button>' +
                '<input type="file" class="env-config-file" accept="application/json,.json" hidden>' +
            '</div>';

        body.innerHTML = configBar +
            '<div class="env-preview-wrap"><div class="env-preview-head">' +
                '<label>JsonStorage 预览（运行时注入程序输入第一行）</label>' +
                '<button class="btn-view" data-act="env-copy-raw"><i class="fas fa-copy"></i> 复制原始数据</button></div>' +
            '<pre class="env-preview" id="envPreview"></pre></div>' + rows + imagesSection;
        updateEnvPreview();
    }

    function onBodyClick(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        if (act === 'env-del') {
            const r = GlotStore.deleteEnvValue(btn.getAttribute('data-field'), btn.getAttribute('data-val'));
            if (!r.ok) { showToast(r.error, 'error'); return; }
            render();
        } else if (act === 'env-select') {
            GlotStore.setEnvCurrent(btn.getAttribute('data-field'), btn.getAttribute('data-val'));
            render();
        } else if (act === 'env-add') {
            const row = btn.closest('.env-field-row');
            const input = row.querySelector('.env-add-input');
            if (input.value === '') { showToast('请输入候选值（空值默认已存在）', 'error'); return; }
            const r = GlotStore.addEnvValue(row.getAttribute('data-field'), input.value);
            if (!r.ok) { showToast(r.error, 'error'); return; }
            render();
        } else if (act === 'env-add-group') {
            const row = btn.closest('.env-field-row');
            const name = row.querySelector('.env-from-name').value.trim();
            const gid = row.querySelector('.env-from-id').value.trim();
            if (!name || !gid) { showToast('请填写群名称和群号', 'error'); return; }
            GlotStore.addEnvValue('from', name + '(' + gid + ')');
            render();
        } else if (act === 'env-add-private') {
            GlotStore.addEnvValue('from', 'private');
            render();
        } else if (act === 'env-copy-raw') {
            copyToClipboard(GlotStore.buildStorageInput(GlotProjects.getActiveId()));
        } else if (act === 'env-image-pick') {
            const inp = btn.closest('.env-field-row').querySelector('.env-image-input');
            if (inp) inp.click();
        } else if (act === 'env-image-del') {
            GlotStore.removeEnvImage(Number(btn.getAttribute('data-index')));
            render();
        } else if (act === 'env-image-clear') {
            GlotStore.clearEnvImages();
            render();
        } else if (act === 'env-export-config') {
            const r = GlotStore.exportEnvConfig();
            downloadJson('code_runner-env-config.json', r.json);
            showToast('已导出模拟环境配置', 'success');
        } else if (act === 'env-import-config') {
            const inp = body.querySelector('.env-config-file');
            if (inp) { inp.value = ''; inp.click(); }   // allow re-importing the same file
        }
    }

    // Config file picked -> validate -> confirm overwrite -> apply
    function onConfigFile(file) {
        const reader = new FileReader();
        reader.onload = async () => {
            let parsed;
            try { parsed = JSON.parse(reader.result); }
            catch (err) { showToast('无法解析文件：不是有效的 JSON', 'error'); return; }
            if (!parsed || parsed.kind !== 'cr-env' || !parsed.env) {
                showToast('导入失败：文件格式不正确（应为模拟环境配置导出文件）', 'error'); return;
            }
            const ok = await confirmDialog('导入将覆盖当前模拟环境配置（全部字段候选值与图片），且不可撤销。确认导入？');
            if (!ok) return;
            const r = GlotStore.importEnvConfig(parsed);
            if (!r.ok) { showToast('导入失败：' + r.error, 'error'); return; }
            render();
            showToast('已导入模拟环境配置', 'success');
        };
        reader.onerror = () => showToast('读取文件失败', 'error');
        reader.readAsText(file);
    }

    // File pickers: env-config import + image upload (base64 -> images[])
    function onBodyChange(e) {
        const cfg = e.target.closest('.env-config-file');
        if (cfg && cfg.files && cfg.files.length) { onConfigFile(cfg.files[0]); return; }

        const input = e.target.closest('.env-image-input');
        if (!input || !input.files || !input.files.length) return;
        const files = Array.prototype.slice.call(input.files);
        let pending = files.length;
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                const r = GlotStore.addEnvImage(file.name, reader.result);
                if (!r.ok) showToast('保存图片失败：' + (r.error || file.name), 'error');
                if (--pending === 0) render();
            };
            reader.onerror = () => { showToast('读取图片失败：' + file.name, 'error'); if (--pending === 0) render(); };
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

    function open() { render(); overlay.hidden = false; }
    function close() { overlay.hidden = true; }

    function init(deps) {
        overlay = document.getElementById('envModalOverlay');
        body = document.getElementById('envModalBody');
        showToast = deps.showToast;
        confirmDialog = deps.confirmDialog;
        downloadJson = deps.downloadJson;
        document.getElementById('emClose').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        body.addEventListener('click', onBodyClick);
        body.addEventListener('change', onBodyChange);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) close(); });
    }

    return { init, open, close };
})();
