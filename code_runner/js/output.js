const GlotOutput = (() => {

    function createSection(type, title, icon) {
        const sec = document.createElement('div');
        sec.className = `output-section ${type}`;
        sec.innerHTML = `<h3><i class="fas ${icon}"></i> ${GlotUtils.escapeHtml(title)}</h3><div class="content"></div>`;
        return sec;
    }

    const ICONS = {
        stdout: 'fa-check-circle',
        stderr: 'fa-exclamation-triangle',
        error: 'fa-times-circle',
        info: 'fa-info-circle',
        'debug-output': 'fa-bug',
        duration: 'fa-clock'
    };

    function setSectionHeader(sec, type, title) {
        sec.className = `output-section ${type}`;
        const h3 = sec.querySelector('h3');
        if (h3) {
            h3.innerHTML = `<i class="fas ${ICONS[type] || 'fa-info-circle'}"></i> ${GlotUtils.escapeHtml(title)}`;
        }
    }

    function appendTextSection(container, type, title, text) {
        const sec = createSection(type, title, ICONS[type] || 'fa-info-circle');
        sec.querySelector('.content').textContent = text;
        container.appendChild(sec);
    }

    // Append a debug info section (merge multiple lines)
    function appendDebugSection(container, lines) {
        if (!lines.length) return;
        const sec = createSection('debug-output', 'Debug', ICONS['debug-output']);
        sec.querySelector('.content').textContent = lines.join('\n');
        container.appendChild(sec);
    }

    // --- Markdown rendering ---
    // The bot renders markdown to an image in a headless browser (fully isolated)
    // a Shadow DOM so page CSS cannot bleed in and a program's own <style> stays scoped to its output.
    // Selectors are low-specificity (bare element) so a program's embedded CSS can override the baseline.
    const MD_BASELINE_CSS = `
:host{all:initial;display:block;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:14px;line-height:1.6;color:#2c3e50;word-wrap:break-word;}
h1,h2,h3,h4,h5,h6{margin:8px 0 4px;line-height:1.3;font-weight:600;color:#2c3e50;}
h1{font-size:1.7em;}h2{font-size:1.5em;}h3{font-size:1.3em;}h4{font-size:1.1em;}
p{margin:6px 0;}
ul,ol{margin:4px 0 4px 22px;padding:0;}
li{margin:2px 0;}
a{color:#2980b9;text-decoration:none;}
code{font-family:'Courier New',Courier,monospace;background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:.92em;}
pre{background:#f5f5f5;padding:10px;border-radius:4px;overflow:auto;}
pre code{background:none;padding:0;}
blockquote{margin:6px 0;padding:2px 12px;border-left:4px solid #dfe2e5;color:#6a737d;}
table{border-collapse:collapse;margin:6px 0;}
th,td{border:1px solid #dfe2e5;padding:5px 10px;}
img{max-width:100%;height:auto;}
hr{border:none;border-top:1px solid #eaecef;margin:10px 0;}
`;
    function renderMarkdownContent(text) {
        // Use marked library to render markdown
        return marked.parse(text);
    }
    // Render markdown into an isolated Shadow DOM: neither page CSS nor the program's own CSS crosses the boundary.
    function mountIsolatedMarkdown(targetEl, text) {
        const host = document.createElement('div');
        host.className = 'md-iso-host';
        if (host.attachShadow) {
            const root = host.attachShadow({ mode: 'open' });
            root.innerHTML = '<style>' + MD_BASELINE_CSS + '</style>' + renderMarkdownContent(text);
        } else {
            host.innerHTML = renderMarkdownContent(text);   // legacy fallback (no shadow support)
        }
        targetEl.appendChild(host);
    }

    function appendMarkdownSection(container, text, title = 'Stdout') {
        const sec = createSection('stdout', title, ICONS.stdout);
        const contentDiv = sec.querySelector('.content');
        contentDiv.classList.add('markdown-rendered');
        mountIsolatedMarkdown(contentDiv, text);
        container.appendChild(sec);
    }

    // --- Image rendering ---
    function appendImageContent(target, text) {
        const url = text.trim();
        if (!GlotUtils.isValidUrl(url)) {
            target.innerHTML = '<div class="image-error"><i class="fas fa-times-circle"></i> 输出内容不是有效的URL: ' + GlotUtils.escapeHtml(url) + '</div>';
            return false;
        }

        target.classList.add('image-rendered');
        target.innerHTML = '<div class="image-loading"><i class="fas fa-spinner fa-spin"></i> 图片加载中...</div>';

        const img = document.createElement('img');
        img.src = url;
        img.alt = 'output image';
        img.onload = () => { target.innerHTML = ''; target.appendChild(img); };
        img.onerror = () => { target.innerHTML = '<div class="image-error"><i class="fas fa-times-circle"></i> 图片加载失败: ' + GlotUtils.escapeHtml(url) + '</div>'; };
        return true;
    }

    function appendImageSection(container, text, title = 'Stdout') {
        const url = text.trim();
        if (!GlotUtils.isValidUrl(url)) {
            appendTextSection(container, 'error', '错误', '输出内容不是有效的URL: ' + url);
            return false;
        }

        const sec = createSection('info', '图片加载中', ICONS.info);
        const contentDiv = sec.querySelector('.content');
        contentDiv.classList.add('image-rendered');
        contentDiv.innerHTML = '<div class="image-loading"><i class="fas fa-spinner fa-spin"></i> 图片加载中...</div>';

        const img = document.createElement('img');
        img.src = url;
        img.alt = 'output image';
        img.onload = () => {
            setSectionHeader(sec, 'stdout', title);
            contentDiv.innerHTML = '';
            contentDiv.appendChild(img);
        };
        img.onerror = () => {
            setSectionHeader(sec, 'error', '错误');
            contentDiv.innerHTML = '<div class="image-error"><i class="fas fa-times-circle"></i> 图片加载失败: ' + GlotUtils.escapeHtml(url) + '</div>';
        };

        container.appendChild(sec);
        return true;
    }

    // --- Base64 (data URI) rendering, mirrors bot Base64Processor ---
    // supportAll=false (inside MessageChain) blocks audio/video, matching the bot's fileToMessage
    function mountBase64(targetDiv, rawText, supportAll) {
        const parsed = GlotUtils.parseBase64(rawText);
        if (!parsed.ok) {
            showBase64Error(targetDiv, parsed.error);
            return false;
        }
        if ((parsed.fileType === 'audio' || parsed.fileType === 'video') && !supportAll) {
            showBase64Error(targetDiv, '[错误] base64在MessageChain输出格式下不兼容此文件格式，请更换其他输出格式');
            return false;
        }
        if (parsed.fileType === 'text') {
            targetDiv.classList.add('base64-text');
            targetDiv.textContent = GlotUtils.bytesToText(parsed.bytes);
            return true;
        }
        if (parsed.fileType === 'image') {
            targetDiv.classList.add('image-rendered');
            const img = document.createElement('img');
            img.src = parsed.dataUri;
            img.alt = 'base64 image';
            img.onerror = () => showMediaError(targetDiv, '图片', parsed);
            targetDiv.appendChild(img);
            return true;
        }
        // audio / video
        targetDiv.classList.add('media-rendered');
        const tag = parsed.fileType === 'audio' ? 'audio' : 'video';
        const media = document.createElement(tag);
        media.controls = true;
        media.src = parsed.dataUri;
        media.onerror = () => showMediaError(targetDiv, tag === 'audio' ? '音频' : '视频', parsed);
        targetDiv.appendChild(media);
        return true;
    }

    function showBase64Error(targetDiv, message) {
        targetDiv.innerHTML =
            '<div class="image-error"><i class="fas fa-times-circle"></i> ' +
            GlotUtils.escapeHtml(message) + '</div>';
    }

    function showMediaError(targetDiv, label, parsed) {
        targetDiv.innerHTML = '';
        const err = document.createElement('div');
        err.className = 'image-error';
        err.innerHTML = '<i class="fas fa-times-circle"></i> ' +
            GlotUtils.escapeHtml(label) + '加载失败：浏览器可能不支持此格式（' +
            GlotUtils.escapeHtml(parsed.extension) + '）';
        targetDiv.appendChild(err);
        const a = document.createElement('a');
        a.className = 'base64-download';
        a.href = parsed.dataUri;
        a.download = 'output.' + parsed.extension;
        a.innerHTML = '<i class="fas fa-download"></i> 下载文件';
        targetDiv.appendChild(a);
    }

    function appendBase64Section(container, rawText, title = 'Stdout', supportAll = true) {
        const sec = createSection('stdout', title, ICONS.stdout);
        const ok = mountBase64(sec.querySelector('.content'), rawText, supportAll);
        if (!ok) setSectionHeader(sec, 'error', '错误');
        container.appendChild(sec);
        return ok;
    }

    // --- LaTeX (rendered via CodeCogs image; QuickLaTeX is CORS-blocked, CodeCogs needs no CORS) ---
    function latexImageUrl(latex) {
        return 'https://latex.codecogs.com/png.image?' + encodeURIComponent('\\dpi{200}' + latex);
    }
    function mountLatex(targetDiv, latex, onResult) {
        targetDiv.classList.add('image-rendered');
        targetDiv.innerHTML = '<div class="image-loading"><i class="fas fa-spinner fa-spin"></i> LaTeX 渲染中...</div>';
        const img = document.createElement('img');
        img.alt = 'LaTeX';
        img.onload = () => { targetDiv.innerHTML = ''; targetDiv.appendChild(img); if (onResult) onResult(true); };
        img.onerror = () => {
            targetDiv.innerHTML = '<div class="image-error"><i class="fas fa-times-circle"></i> LaTeX 渲染失败：请检查公式语法或网络</div>';
            if (onResult) onResult(false);
        };
        img.src = latexImageUrl(latex);
    }
    function appendLatexSection(container, latex, title = 'Stdout') {
        const sec = createSection('info', 'LaTeX 渲染中', ICONS.info);
        mountLatex(sec.querySelector('.content'), latex, ok => setSectionHeader(sec, ok ? 'stdout' : 'error', ok ? title : '错误'));
        container.appendChild(sec);
        return true;
    }

    // --- Audio (Baidu TTS via POST form; mirrors bot FreeTextToSpeech) ---
    function audioErr(message) {
        return '<div class="image-error"><i class="fas fa-times-circle"></i> ' + GlotUtils.escapeHtml(message) + '</div>';
    }
    async function renderAudioInto(targetDiv, rawText) {
        let msg;
        try { msg = JSON.parse(rawText.trim()); }
        catch (e) { targetDiv.innerHTML = audioErr('[错误] JSON解析错误：' + e.message); return false; }

        const content = msg.content !== undefined ? String(msg.content) : '';
        if (!content.trim()) { targetDiv.innerHTML = audioErr('生成语音失败：content内容为空'); return false; }
        // AudioMessage 支持 format:"text" 输出文本用于调试
        if (msg.format === 'text') { targetDiv.classList.add('base64-text'); targetDiv.textContent = content; return true; }

        targetDiv.innerHTML = '<div class="image-loading"><i class="fas fa-spinner fa-spin"></i> 语音合成中...</div>';
        const params = new URLSearchParams({
            tex: content, pdt: '301', cuid: 'bake', ctp: '1', lan: 'zh',
            spd: String(msg.speed ?? 5), pit: String(msg.pitch ?? 5),
            vol: String(msg.volume ?? 10), per: String(msg.person ?? 0), aue: '3'
        });
        try {
            // 必须用 POST 表单体；GET+query 会被百度判为 "Not verified user"
            const r = await fetch('https://tts.baidu.com/text2audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });
            const ct = r.headers.get('content-type') || '';
            if (ct.includes('audio')) {
                const url = URL.createObjectURL(await r.blob());
                targetDiv.classList.add('media-rendered');
                targetDiv.innerHTML = '';
                const audio = document.createElement('audio');
                audio.controls = true;
                audio.src = url;
                targetDiv.appendChild(audio);
                return true;
            }
            const txt = await r.text();
            let detail = txt;
            try {
                const j = JSON.parse(txt);
                detail = (j.err_msg || j.err_detail || txt) + (j.err_no !== undefined ? `（err_no=${j.err_no}）` : '');
            } catch (_) { /* keep raw */ }
            targetDiv.innerHTML = audioErr('生成语音失败：' + detail);
            return false;
        } catch (e) {
            targetDiv.innerHTML = audioErr('请求语音接口失败：' + e.message);
            return false;
        }
    }
    function appendAudioSection(container, rawText, title = 'Stdout') {
        const sec = createSection('info', '语音合成中', ICONS.info);
        const contentDiv = sec.querySelector('.content');
        contentDiv.innerHTML = '<div class="image-loading"><i class="fas fa-spinner fa-spin"></i> 语音合成中...</div>';
        container.appendChild(sec);
        renderAudioInto(contentDiv, rawText).then(ok => setSectionHeader(sec, ok ? 'stdout' : 'error', ok ? title : '错误'));
        return true;
    }

    // --- MessageChain ---
    function appendMessageChainSection(container, title, parts) {
        const sec = createSection('stdout', title, ICONS.stdout);
        const contentDiv = sec.querySelector('.content');
        contentDiv.classList.add('message-chain-rendered');
        contentDiv.innerHTML = '';

        parts.forEach((part, index) => {
            const block = document.createElement('div');
            block.className = 'message-chain-block';

            if (part.type === 'text') {
                block.textContent = part.content;
            } else if (part.type === 'markdown') {
                block.classList.add('markdown-rendered');
                mountIsolatedMarkdown(block, part.content);
            } else if (part.type === 'image') {
                appendImageContent(block, part.content);
            } else if (part.type === 'base64') {
                mountBase64(block, part.content, false);
            } else if (part.type === 'latex') {
                mountLatex(block, part.content);
            }

            contentDiv.appendChild(block);
            if (index !== parts.length - 1) {
                contentDiv.appendChild(document.createElement('br'));
            }
        });

        container.appendChild(sec);
    }

    function collectUnknownFieldWarnings(obj, knownFields, debugLines) {
        for (const key of Object.keys(obj)) {
            if (!knownFields.has(key)) {
                debugLines.push('[WARN] 不支持的字段：' + key);
            }
        }
    }

    // debug aid flags genuine typos without warning on legitimate fields.
    const TOP_FIELDS = new Set(['format', 'at', 'width', 'content', 'messageList', 'active', 'storage', 'global', 'bucket', 'error']);  // JsonMessage (top-level / active / ForwardMessage.messages node)
    const CHAIN_NODE_FIELDS = new Set(['format', 'width', 'content', 'messageList']);  // SingleChainMessage (MultipleMessage / MessageChain node)
    const SINGLE_FIELDS = new Set(['format', 'width', 'content']);  // JsonSingleMessage (innermost node)

    // --- at (@) parameter simulation ---
    // Only text / MessageChain / MultipleMessage apply `at`, and only in a group (私聊 never @s).
    function _isGroupContext() {
        try { const f = GlotStore.composeEnvValues().from; return !!f && f !== 'private'; }
        catch (e) { return false; }   // env unavailable → treat as private (no @)
    }
    // Pin a small @ status note to the far right of a Stdout section's title row.
    // section is the rendered .output-section (typically container.lastElementChild after a node renders).
    function attachAtNote(section, supported, atVal, isGroup) {
        if (!section) return;
        const h3 = section.querySelector('h3');
        if (!h3) return;
        const span = document.createElement('span');
        span.className = 'at-note ' + (supported ? 'at-ok' : 'at-no');
        let txt;
        if (!supported)      txt = '此处不支持使用 at 参数（at: ' + atVal + '）';
        else if (!isGroup)   txt = '私聊环境：at 不生效（at: ' + atVal + '）';
        else                 txt = (atVal ? '已 at 发送者' : '未 at 发送者') + '（at: ' + atVal + '）';
        span.innerHTML = '<i class="fas fa-at"></i> ' + GlotUtils.escapeHtml(txt);
        h3.appendChild(span);
    }

    // --- SingleJsonMessage ---
    function renderSingleJsonMessage(container, msg, title, debugLines, errorPrefix = '', knownFields = TOP_FIELDS) {
        collectUnknownFieldWarnings(msg, knownFields, debugLines);

        const format = msg.format || 'text';
        const content = msg.content !== undefined ? String(msg.content) : '';

        switch (format) {
            case 'text':
                appendTextSection(container, 'stdout', title, content);
                return true;
            case 'markdown':
                if (msg.width !== undefined) debugLines.push('[DEBUG] width: ' + msg.width);
                appendMarkdownSection(container, content, title);
                return true;
            case 'image':
                return appendImageSection(container, content, title);
            case 'base64':
                return appendBase64Section(container, content, title, true);
            case 'LaTeX':
                return appendLatexSection(container, content, title);
            case 'Audio':
                return appendAudioSection(container, content, title);
            default: {
                const message = errorPrefix
                    ? `${errorPrefix}不支持在JsonSingleMessage内使用 ${format} 输出格式`
                    : `不支持的输出格式 ${format}`;
                if (errorPrefix) debugLines.push('[ERROR] ' + message);
                else appendTextSection(container, 'error', '错误', message);
                return false;
            }
        }
    }

    function handleMessageChain(container, json, title, debugLines, errorPrefix = '', knownFields = TOP_FIELDS) {
        collectUnknownFieldWarnings(json, knownFields, debugLines);

        if (!Array.isArray(json.messageList)) {
            appendTextSection(container, 'error', '错误', 'messageList 必须是数组');
            return;
        }

        const parts = [];
        json.messageList.forEach(msg => {
            collectUnknownFieldWarnings(msg, SINGLE_FIELDS, debugLines);

            const format = msg.format || 'text';
            const content = msg.content !== undefined ? String(msg.content) : '';

            switch (format) {
                case 'text':
                    parts.push({ type: 'text', content });
                    break;
                case 'markdown':
                    if (msg.width !== undefined) debugLines.push('[DEBUG] width: ' + msg.width);
                    parts.push({ type: 'markdown', content });
                    break;
                case 'image':
                    parts.push({ type: 'image', content });
                    break;
                case 'base64':
                    parts.push({ type: 'base64', content });
                    break;
                case 'LaTeX':
                    parts.push({ type: 'latex', content });
                    break;
                case 'MessageChain':
                    debugLines.push('[ERROR] ' + (errorPrefix || '') + '不支持在JsonSingleMessage内使用 MessageChain 输出格式');
                    break;
                default:
                    debugLines.push('[ERROR] ' + (errorPrefix || '') + `不支持在JsonSingleMessage内使用 ${format} 输出格式`);
                    break;
            }
        });

        appendMessageChainSection(container, title, parts);
    }

    // 解析转义后的 JsonForwardMessage 字符串并渲染（atInfo 仅在顶层 ForwardMessage 携带 at 时传入）
    function renderEscapedForwardMessage(container, content, debugLines, label, atInfo) {
        const raw = content !== undefined ? String(content) : '空消息';   // JsonMessage 的 content 默认值
        let inner;
        try {
            inner = JSON.parse(raw.trim());
        } catch (e) {
            appendTextSection(container, 'error', label || '错误', '[错误] JSON解析错误：\n' + e.message + '\n\n原始content:\n' + raw);
            return;
        }
        if (label) debugLines.push('[DEBUG] ' + label + '：嵌套ForwardMessage');
        renderForwardMessage(container, inner, debugLines, atInfo);
    }

    // Render a list of message nodes as "Stdout N" sections.
    //   'multiple' = MultipleMessage 的 SingleChainMessage 节点（允许嵌套 ForwardMessage，content 再解析）
    //   'forward'  = ForwardMessage.messages 的 JsonMessage 节点（ForwardMessage/json 禁用）
    // atInfo {val,isGroup} (when the top-level json has `at`): pin a per-message @ note
    function renderMessageNodes(container, list, debugLines, context, atInfo) {
        const nodeName = context === 'forward' ? 'JsonMessage' : 'SingleChainMessage';
        // forward node = JsonMessage (full top-level fields); multiple node = SingleChainMessage
        const nodeFields = context === 'forward' ? TOP_FIELDS : CHAIN_NODE_FIELDS;
        list.forEach((msg, index) => {
            const title = `Stdout ${index + 1}`;
            const format = msg.format || 'text';
            // a sub-message applies @ only as a text/MessageChain inside a MultipleMessage (not in a forward card)
            const subSupportsAt = context === 'multiple' && (format === 'text' || format === 'MessageChain');
            const noteAt = () => {
                if (!atInfo) return;
                attachAtNote(container.lastElementChild, subSupportsAt, atInfo.val, atInfo.isGroup);
            };
            if (format === 'MessageChain') {
                handleMessageChain(container, msg, title, debugLines, `第${index + 1}条：`, nodeFields);
                noteAt();
                return;
            }
            if (format === 'ForwardMessage') {
                if (context === 'forward') {
                    appendTextSection(container, 'error', title, '[错误] 不支持在JsonMessage内使用“ForwardMessage”输出格式');
                } else {
                    renderEscapedForwardMessage(container, msg.content, debugLines, title);
                }
                return;
            }
            if (format === 'json' || format === 'MultipleMessage') {
                const where = (format === 'MultipleMessage' && context === 'forward') ? 'ForwardMessage' : nodeName;
                appendTextSection(container, 'error', title, '[错误] 不支持在' + where + '内使用“' + format + '”输出格式');
                return;
            }
            renderSingleJsonMessage(container, msg, title, debugLines, '', nodeFields);
            noteAt();
        });
    }

    function handleMultipleMessage(container, json, debugLines, atInfo) {
        collectUnknownFieldWarnings(json, TOP_FIELDS, debugLines);   // top-level / active MultipleMessage is a JsonMessage

        if (!Array.isArray(json.messageList)) {
            appendTextSection(container, 'error', '错误', 'JSON解析失败：messageList 必须是数组');
            return;
        }
        renderMessageNodes(container, json.messageList, debugLines, 'multiple', atInfo);
    }

    // --- ForwardMessage ---
    // 原框架的转发消息卡片在网页无对应载体，按 MultipleMessage 的 UI 将 messages[] 渲染为 Stdout N 节点；
    // 卡片元信息(title/brief/preview/summary/name)放入 Debug 区域；不支持的格式与 MultipleMessage 一致处理。
    function renderForwardMessage(container, json, debugLines, atInfo) {
        const knownFields = new Set(['title', 'brief', 'preview', 'summary', 'name', 'messages', 'storage', 'global', 'bucket']);
        collectUnknownFieldWarnings(json, knownFields, debugLines);

        ['title', 'brief', 'summary', 'name'].forEach(k => {
            if (json[k] !== undefined) debugLines.push('[DEBUG] ' + k + ': ' + json[k]);
        });
        if (json.preview !== undefined) debugLines.push('[DEBUG] preview: ' + JSON.stringify(json.preview));

        if (!Array.isArray(json.messages)) {
            appendTextSection(container, 'error', '错误', 'JSON解析失败：messages 必须是数组');
            return;
        }
        renderMessageNodes(container, json.messages, debugLines, 'forward', atInfo);
    }

    // 顶层 ForwardMessage 输出格式：解析 JsonForwardMessage 后渲染
    function handleForwardMessageOutput(container, rawText) {
        let json;
        try {
            json = JSON.parse(rawText.trim());
        } catch (e) {
            appendTextSection(container, 'error', '错误', 'JSON解析失败: ' + e.message + '\n\n原始输出:\n' + rawText);
            return;
        }
        const debugLines = ['[DEBUG] format: ForwardMessage'];
        renderForwardMessage(container, json, debugLines);
        appendDebugSection(container, debugLines);
    }

    // --- Active messages (主动消息) ---
    // renders each entry's target + message into a dedicated area placed after all Stdout sections.
    // Sandbox note: no send-failure / private-permission checks (every target assumed reachable).
    function renderActiveContent(wrap, msg, index, debugLines) {
        msg = (msg && typeof msg === 'object') ? msg : {};
        const format = msg.format || 'text';
        const content = msg.content !== undefined ? String(msg.content) : '';
        switch (format) {
            case 'text':    appendTextSection(wrap, 'stdout', '消息内容', content); break;
            case 'markdown': appendMarkdownSection(wrap, content, '消息内容'); break;
            case 'image':   appendImageSection(wrap, content, '消息内容'); break;
            case 'base64':  appendBase64Section(wrap, content, '消息内容', true); break;
            case 'LaTeX':   appendLatexSection(wrap, content, '消息内容'); break;
            case 'Audio':   appendAudioSection(wrap, content, '消息内容'); break;
            case 'MessageChain': handleMessageChain(wrap, msg, '消息内容', debugLines, '主动消息第' + (index + 1) + '条：'); break;
            case 'MultipleMessage': handleMultipleMessage(wrap, msg, debugLines); break;   // renders Stdout N nodes
            case 'ForwardMessage': handleForwardMessageOutput(wrap, content); break;       // content = escaped JSON
            default: appendTextSection(wrap, 'error', '错误', '不支持的输出格式 ' + format);
        }
    }

    function renderActiveEntry(area, active, index, debugLines) {
        active = (active && typeof active === 'object') ? active : {};
        const entry = document.createElement('div');
        entry.className = 'active-entry';
        area.appendChild(entry);

        const hasGroup = active.groupID !== null && active.groupID !== undefined;
        const hasUser = active.userID !== null && active.userID !== undefined;
        if (!hasGroup && !hasUser) {
            const err = document.createElement('div');
            err.className = 'active-error';
            err.textContent = '[(' + (index + 1) + ')参数] 目标无效：groupID和userID均为空';
            entry.appendChild(err);
            return;
        }
        const isGroup = hasGroup;   // group wins when both present (matches bot)
        const targetType = isGroup ? '群聊' : '私信';
        const targetId = String(isGroup ? active.groupID : active.userID);
        const msg = (active.message && typeof active.message === 'object') ? active.message : {};
        const isMultiple = msg.format === 'MultipleMessage';
        const note = isMultiple
            ? '（多条' + targetType + '主动消息，' + (Array.isArray(msg.messageList) ? msg.messageList.length : 0) + ' 条）'
            : '';

        const target = document.createElement('div');
        target.className = 'active-target';
        target.innerHTML = '<i class="fas ' + (isGroup ? 'fa-users' : 'fa-user') + '"></i> ' +
            GlotUtils.escapeHtml('第' + (index + 1) + '条 → ' + targetType + ' ' + targetId + note);
        entry.appendChild(target);

        const wrap = document.createElement('div');
        wrap.className = 'active-msg';
        entry.appendChild(wrap);
        renderActiveContent(wrap, msg, index, debugLines);
    }

    function handleActiveMessages(container, activeArr, debugLines) {
        if (activeArr === null || activeArr === undefined) return;
        if (!Array.isArray(activeArr)) { debugLines.push('[WARN] active字段格式错误：应为数组，已跳过解析'); return; }
        if (activeArr.length === 0) { debugLines.push('[WARN] active字段数组为空，跳过解析'); return; }

        const area = document.createElement('div');
        area.className = 'active-area';
        const head = document.createElement('div');
        head.className = 'active-area-head';
        head.innerHTML = '<i class="fas fa-paper-plane"></i> 主动消息';
        area.appendChild(head);
        container.appendChild(area);

        for (let i = 0; i < activeArr.length; i++) {
            if (i >= 10) {
                const err = document.createElement('div');
                err.className = 'active-entry';
                err.innerHTML = '<div class="active-error">[上限] 执行中断：单次主动消息上限为10条</div>';
                area.appendChild(err);
                break;
            }
            renderActiveEntry(area, activeArr[i], i, debugLines);
        }
    }

    function handleJsonOutput(container, rawText) {
        let json;
        try {
            json = JSON.parse(rawText.trim());
        } catch (e) {
            appendTextSection(container, 'error', '错误', 'JSON解析失败: ' + e.message + '\n\n原始输出:\n' + rawText);
            return;
        }

        const debugLines = [];
        if (json.format) debugLines.push('[DEBUG] format: ' + json.format);

        const format = json.format || 'text';
        // at simulation: only when the program explicitly includes `at`. text/MessageChain/MultipleMessage
        // apply @ (text/MessageChain shown green here, MultipleMessage per sub-message); the rest show 不支持.
        const hasAt = json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'at');
        const atVal = json.at !== false;   // JsonMessage default is true; only explicit false disables
        const atInfo = hasAt ? { val: atVal, isGroup: _isGroupContext() } : null;
        switch (format) {
            case 'text':
            case 'markdown':
            case 'image':
            case 'base64':
            case 'LaTeX':
            case 'Audio':
                renderSingleJsonMessage(container, json, 'Stdout', debugLines);
                break;
            case 'MessageChain':
                handleMessageChain(container, json, 'Stdout', debugLines);
                break;
            case 'MultipleMessage':
                handleMultipleMessage(container, json, debugLines, atInfo);
                break;
            case 'ForwardMessage':
                // json 格式下 content 为转义后的 JsonForwardMessage 字符串（内部再次解析）
                renderEscapedForwardMessage(container, json.content, debugLines, undefined, atInfo);
                break;
            default:
                appendTextSection(container, 'error', '错误', '不支持的输出格式 ' + format);
                break;
        }
        // Single-section top-level formats: pin the @ note to that one Stdout's title row.
        // text/MessageChain support at (green); markdown/image/base64/LaTeX/Audio don't (yellow + Debug warn).
        // MultipleMessage & ForwardMessage notes are attached per sub-message inside their renderers.
        if (atInfo) {
            const supported = (format === 'text' || format === 'MessageChain');
            if (supported || ['markdown', 'image', 'base64', 'LaTeX', 'Audio'].indexOf(format) !== -1) {
                attachAtNote(container.lastElementChild, supported, atInfo.val, atInfo.isGroup);
                if (!supported) debugLines.push('[WARN] 当前输出格式（' + format + '）不支持 at 参数，已忽略');
            } else if (format === 'ForwardMessage') {
                debugLines.push('[WARN] 当前输出格式（ForwardMessage）不支持 at 参数，已忽略');
            }
        }

        // Active (主动消息) area, after all Stdout
        if ('active' in json) handleActiveMessages(container, json.active, debugLines);

        // Show debug section
        appendDebugSection(container, debugLines);
    }

    // --- Storage extraction ---
    // Returns {global,storage,bucket,error}: null fields = unchanged. Independent of media render.
    function _safeParse(s) { try { return JSON.parse(String(s).trim()); } catch (e) { return null; } }
    function _pickStorage(o) {
        return {
            global:  (o && o.global  !== undefined) ? o.global  : null,
            storage: (o && o.storage !== undefined) ? o.storage : null,
            bucket:  (o && Array.isArray(o.bucket)) ? o.bucket  : null
        };
    }
    function extractStorageFromOutput(rawText, outputFormat) {
        const none = { global: null, storage: null, bucket: null, error: '' };
        if (outputFormat === 'json') {
            const j = _safeParse(rawText);
            if (!j) return none;
            if (j.error && String(j.error).length) return { error: String(j.error) };   // abort BEFORE save
            let out = _pickStorage(j);
            const sub = j.format || 'text';
            if (sub === 'ForwardMessage' || sub === 'Audio') {
                const inner = _safeParse(j.content);   // content is an escaped-JSON string
                if (inner) out = _pickStorage(inner);  // inner overrides; parse-fail → no override (no garbage save)
            }
            return Object.assign({ error: '' }, out);
        }
        if (outputFormat === 'ForwardMessage' || outputFormat === 'Audio') {
            const j = _safeParse(rawText);
            return j ? Object.assign({ error: '' }, _pickStorage(j)) : none;
        }
        return none;   // other formats never save
    }

    // --- Main display function ---
    function displayResult(result, outputFormat, outputDiv, resultContainer, onStorage) {
        outputDiv.innerHTML = '';
        resultContainer.style.display = 'block';

        if (result.error) appendTextSection(outputDiv, 'error', 'Error', result.error);

        // Main output format handling
        if (result.stdout) {
            switch (outputFormat) {
                case 'markdown':
                    appendMarkdownSection(outputDiv, result.stdout);
                    break;
                case 'image':
                    appendImageSection(outputDiv, result.stdout);
                    break;
                case 'base64':
                    appendBase64Section(outputDiv, result.stdout, 'Stdout', true);
                    break;
                case 'json':
                    handleJsonOutput(outputDiv, result.stdout);
                    break;
                case 'ForwardMessage':
                    handleForwardMessageOutput(outputDiv, result.stdout);
                    break;
                case 'LaTeX':
                    appendLatexSection(outputDiv, result.stdout);
                    break;
                case 'Audio':
                    appendAudioSection(outputDiv, result.stdout);
                    break;
                default:
                    appendTextSection(outputDiv, 'stdout', 'Stdout', result.stdout);
                    break;
            }
        }

        // Storage extraction/save (synchronous, render-independent). Caller decides whether to persist.
        if (typeof onStorage === 'function' && result.stdout) {
            onStorage(extractStorageFromOutput(result.stdout, outputFormat));
        }

        // Stderr
        if (result.stderr) {
            appendTextSection(outputDiv, 'stderr', 'Stderr', result.stderr);
        }

        // No output
        if (!result.stdout && !result.stderr && !result.error) {
            appendTextSection(outputDiv, 'info', '信息', '程序执行完成，但没有输出。');
        }

        // Duration
        if (result.duration) {
            appendTextSection(outputDiv, 'duration', '执行时间', result.duration + ' 毫秒');
        }

        resultContainer.scrollIntoView({ behavior: 'smooth' });
    }

    function displayError(message, outputDiv, resultContainer) {
        outputDiv.innerHTML = '';
        resultContainer.style.display = 'block';
        const sec = createSection('error', '错误', ICONS.error);
        sec.querySelector('.content').innerHTML = message;
        outputDiv.appendChild(sec);
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    }

    return { displayResult, displayError, extractStorageFromOutput };
})();
