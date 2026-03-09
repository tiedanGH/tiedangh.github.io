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
    function renderMarkdownContent(text) {
        // Use marked library to render markdown
        return marked.parse(text);
    }

    function appendMarkdownSection(container, text, title = 'Stdout') {
        const sec = createSection('stdout', title, ICONS.stdout);
        const contentDiv = sec.querySelector('.content');
        contentDiv.classList.add('markdown-rendered');
        contentDiv.innerHTML = renderMarkdownContent(text);
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
                block.innerHTML = renderMarkdownContent(part.content);
            } else if (part.type === 'image') {
                appendImageContent(block, part.content);
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

    // --- SingleJsonMessage ---
    function renderSingleJsonMessage(container, msg, title, debugLines, errorPrefix = '') {
        const knownFields = new Set(['content', 'format', 'width']);
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

    function handleMessageChain(container, json, title, debugLines, errorPrefix = '') {
        const knownFields = new Set(['format', 'messageList']);
        collectUnknownFieldWarnings(json, knownFields, debugLines);

        if (!Array.isArray(json.messageList)) {
            appendTextSection(container, 'error', '错误', 'messageList 必须是数组');
            return;
        }

        const parts = [];
        json.messageList.forEach(msg => {
            const knownMsgFields = new Set(['content', 'format', 'width']);
            collectUnknownFieldWarnings(msg, knownMsgFields, debugLines);

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

    function handleMultipleMessage(container, json, debugLines) {
        const knownFields = new Set(['format', 'messageList']);
        collectUnknownFieldWarnings(json, knownFields, debugLines);

        if (!Array.isArray(json.messageList)) {
            appendTextSection(container, 'error', '错误', 'JSON解析失败：messageList 必须是数组');
            return;
        }

        json.messageList.forEach((msg, index) => {
            const title = `Stdout ${index + 1}`;
            const format = msg.format || 'text';

            if (format === 'MessageChain') {
                handleMessageChain(container, msg, title, debugLines, `第${index + 1}条：`);
                return;
            }

            renderSingleJsonMessage(container, msg, title, debugLines);
        });
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
        switch (format) {
            case 'text':
            case 'markdown':
            case 'image':
                renderSingleJsonMessage(container, json, 'Stdout', debugLines);
                break;
            case 'MessageChain':
                handleMessageChain(container, json, 'Stdout', debugLines);
                break;
            case 'MultipleMessage':
                handleMultipleMessage(container, json, debugLines);
                break;
            default:
                appendTextSection(container, 'error', '错误', '不支持的输出格式 ' + format);
                break;
        }

        // Show debug section
        appendDebugSection(container, debugLines);
    }

    // --- Main display function ---
    function displayResult(result, outputFormat, outputDiv, resultContainer) {
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
                case 'json':
                    handleJsonOutput(outputDiv, result.stdout);
                    break;
                default:
                    appendTextSection(outputDiv, 'stdout', 'Stdout', result.stdout);
                    break;
            }
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

    return { displayResult, displayError };
})();
