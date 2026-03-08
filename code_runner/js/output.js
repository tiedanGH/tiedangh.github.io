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

    // Append a plain text section
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
    function convertSimpleMarkdown(text) {
        let html = text;
        // Headings
        html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
        html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
        html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
        // Bold + italic
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // Unordered lists
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
        // Paragraphs (double newline)
        html = html.replace(/\n\n/g, '</p><p>');
        // Single newlines to <br> only outside html tags
        html = html.replace(/\n/g, '<br>');
        return '<p>' + html + '</p>';
    }

    function renderMarkdownContent(text) {
        const hasHtml = /<(?!br\s*\/?)[a-z][^>]*>/i.test(text);
        if (!hasHtml && text.trim()) {
            return convertSimpleMarkdown(text);
        }
        return text;
    }

    function appendMarkdownSection(container, text) {
        const sec = createSection('stdout', 'Stdout', ICONS.stdout);
        const contentDiv = sec.querySelector('.content');
        contentDiv.classList.add('markdown-rendered');
        contentDiv.innerHTML = renderMarkdownContent(text);
        container.appendChild(sec);
    }

    // --- Image rendering ---
    function appendImageSection(container, text) {
        const url = text.trim();
        if (!GlotUtils.isValidUrl(url)) {
            appendTextSection(container, 'error', '错误', '输出内容不是有效的URL: ' + url);
            return;
        }
        const sec = createSection('stdout', 'Stdout', ICONS.stdout);
        const contentDiv = sec.querySelector('.content');
        contentDiv.classList.add('image-rendered');
        contentDiv.innerHTML = '<div class="image-loading"><i class="fas fa-spinner fa-spin"></i> 图片加载中...</div>';

        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Program output image';
        img.onload = () => { contentDiv.innerHTML = ''; contentDiv.appendChild(img); };
        img.onerror = () => { contentDiv.innerHTML = '<div class="image-error"><i class="fas fa-times-circle"></i> 图片加载失败: ' + GlotUtils.escapeHtml(url) + '</div>'; };

        container.appendChild(sec);
    }

    // --- JSON output parsing ---
    function handleJsonOutput(container, rawText) {
        let json;
        try {
            json = JSON.parse(rawText.trim());
        } catch (e) {
            appendTextSection(container, 'error', '错误', 'JSON解析失败: ' + e.message + '\n\n原始输出:\n' + rawText);
            return;
        }

        const knownFields = new Set(['content', 'format', 'width']);
        const debugLines = [];

        if (json.format) {
            debugLines.push('[DEBUG] format: ' + json.format);
        }

        // Check for width
        if (json.width !== undefined) {
            debugLines.push('[DEBUG] width: ' + json.width);
        }

        // Check for unknown fields
        for (const key of Object.keys(json)) {
            if (!knownFields.has(key)) {
                debugLines.push('[WARN] 不支持的字段：' + key);
            }
        }

        const format = json.format || 'text';
        const content = json.content !== undefined ? String(json.content) : '';

        switch (format) {
            case 'text':
                appendTextSection(container, 'stdout', 'Stdout', content);
                break;
            case 'markdown':
                appendMarkdownSection(container, content);
                break;
            case 'image':
                appendImageSection(container, content);
                break;
            default:
                appendTextSection(container, 'error', '错误', '不支持的输出格式：' + format);
                return; // Don't parse
        }

        // Show debug section if needed
        appendDebugSection(container, debugLines);
    }

    // --- Main display function ---
    function displayResult(result, outputFormat, outputDiv, resultContainer) {
        outputDiv.innerHTML = '';
        resultContainer.style.display = 'block';

        // Error from API
        if (result.error) {
            appendTextSection(outputDiv, 'error', 'Error', result.error);
        }

        // Stdout — render based on format
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
                default: // text
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
