const GlotExecutor = (() => {
    const ProxyURL = 'https://cors-anywhere.herokuapp.com/';

    async function fetchCodeFromUrl(url) {
        const supportedUrls = [
            'https://pastebin.ubuntu.com/p/',
            'https://glot.io/snippets/',
            'https://pastebin.com/raw/',
            'https://gist.githubusercontent.com/',
            'https://bytebin.lucko.me/',
            'https://pastes.dev/',
            'https://p.ip.fi/'
        ];

        if (!supportedUrls.some(s => url.startsWith(s))) {
            throw new Error('不支持的URL格式');
        }

        let finalUrl = url;
        if (url.startsWith('https://pastes.dev/')) {
            finalUrl = url.replace('pastes', 'api.pastes');
        }
        if (!window.corsFetch) finalUrl = ProxyURL + finalUrl;

        const response = await GlotUtils.fetchWithTimeout(finalUrl, {}, 10000);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP错误: ${response.status} - ${errText}`);
        }

        let content = await response.text();

        // Parse HTML for certain sites
        if (url.startsWith('https://pastebin.ubuntu.com/p/') ||
            url.startsWith('https://glot.io/snippets/') ||
            url.startsWith('https://p.ip.fi/')) {
            const doc = new DOMParser().parseFromString(content, 'text/html');
            let extracted = '';
            if (url.startsWith('https://pastebin.ubuntu.com/p/')) {
                const el = doc.querySelector('#hidden-content');
                if (el) extracted = el.textContent;
            } else if (url.startsWith('https://glot.io/snippets/')) {
                const el = doc.querySelector('#editor-1');
                if (el) extracted = el.textContent || el.value;
            } else if (url.startsWith('https://p.ip.fi/')) {
                const el = doc.querySelector('pre.prettyprint.linenums');
                if (el) extracted = el.textContent;
            }
            if (!extracted) throw new Error('无法从页面中提取代码内容');
            content = extracted;
        }

        return content;
    }

    // glot/<lang> docker image, mirrors GlotAPI.runCode (c/cpp share the clang image)
    function dockerImage(language) {
        return (language === 'c' || language === 'cpp') ? 'glot/clang:latest' : 'glot/' + language + ':latest';
    }

    // --- util helper files (mirror the bot's data/utils) ---
    // auto-detect usage from the code (no config), then add the file to the request's files[].
    const UTIL_FILES = [
        { name: 'json.h',       langs: ['c', 'cpp'], used: code => code.includes('json.h') },
        { name: 'htmlTools.py', langs: ['python'],   used: code => code.includes('htmlTools') }
    ];
    const _utilCache = {};   // name -> file content (fetched once, same-origin static file)
    async function loadUtilFile(name) {
        if (_utilCache[name] === undefined) {
            const resp = await fetch('utils/' + name);   // relative to code_runner/index.html
            if (!resp.ok) throw new Error('加载辅助文件 ' + name + ' 失败：HTTP ' + resp.status);
            _utilCache[name] = await resp.text();
        }
        return _utilCache[name];
    }
    // Returns extra CodeFile[] to append, based on which util files the code references.
    async function detectUtilFiles(language, code) {
        const lang = (language || '').toLowerCase();
        const extra = [];
        for (const u of UTIL_FILES) {
            if (u.langs.indexOf(lang) !== -1 && u.used(code)) {
                extra.push({ name: u.name, content: await loadUtilFile(u.name) });
                console.log('Auto-include util file:', u.name);
            }
        }
        return extra;
    }

    // --- image path schemes ---
    // image:// → images copied into this site (resolved against the deployed page, e.g. .../code_runner/images/)
    // lgtbot:// → the lgtbot GitHub repo (no local copy exists). Simple global replace.
    const LGTBOT_BASE = 'https://raw.githubusercontent.com/tiedanGH/lgtbot/refs/heads/master/games/';
    function replaceImageSchemes(text) {
        if (typeof text !== 'string' || !text) return text;
        const imageBase = new URL('images/', document.baseURI).href;
        return text.replace(/image:\/\//g, imageBase).replace(/lgtbot:\/\//g, LGTBOT_BASE);
    }

    async function execute({ apiKey, language, codeSource, codeUrl, code, stdin, requestMethod, dockerUrl, dockerToken }) {
        let finalCode = code;
        if (codeSource === 'url') {
            finalCode = await fetchCodeFromUrl(codeUrl);
        }

        // Text语言直接返回输入内容，不调用API
        if (language === 'text') {
            return {
                stdout: replaceImageSchemes(finalCode || ''),
                stderr: '',
                error: '',
                duration: 0
            };
        }

        // Shared payload (files + optional stdin/command), same shape as the bot's RunCodeRequest
        const files = [{ name: GlotUtils.getFileName(language), content: finalCode }];
        const utilFiles = await detectUtilFiles(language, finalCode);   // auto-include util files when referenced
        for (const f of utilFiles) files.push(f);
        const utilNames = utilFiles.map(f => f.name);   // surfaced in the Debug area by output.js
        const command = GlotUtils.getCommand(language);

        // Docker Run：自定义请求地址，body 为 {image, payload}，鉴权头 X-Access-Token；无需用户脚本/代理
        if (requestMethod === 'docker') {
            const payload = { language: language.toLowerCase(), files: files };
            if (stdin && stdin.trim()) payload.stdin = stdin;
            if (command) payload.command = command;
            const headers = { 'Content-Type': 'application/json' };
            if (dockerToken) headers['X-Access-Token'] = dockerToken;
            console.log('(Docker Run) Sending request to:', dockerUrl, command ? ('| command: ' + command) : '');
            const response = await GlotUtils.fetchWithTimeout(dockerUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ image: dockerImage(language), payload: payload })
            }, 30000, true);   // true = native fetch, never via userscript
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP错误: ${response.status} - ${errText}`);
            }
            const result = await response.json();
            // glotcode/docker-run reports duration in NANOSECONDS; convert to ms for display
            // (guard: only convert implausibly-large values, leave already-ms values untouched)
            if (typeof result.duration === 'number' && result.duration > 100000) {
                result.duration = Math.round(result.duration / 1e6);
            }
            if (utilNames.length) result.utilFiles = utilNames;
            result.stdout = replaceImageSchemes(result.stdout);
            return result;
        }

        // Glot API（官网，默认）
        const requestData = { files: files };
        if (stdin && stdin.trim()) requestData.stdin = stdin;
        if (command) {
            requestData.command = command;
            console.log('Run Command:', command);
        }

        const targetUrl = `https://glot.io/api/run/${language}/latest`;
        const finalUrl = window.corsFetch ? targetUrl : ProxyURL + targetUrl;
        console.log(window.corsFetch ? '(Userscript)' : '(Proxy)', 'Sending request to:', finalUrl);

        const response = await GlotUtils.fetchWithTimeout(finalUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiKey}`,
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(requestData)
        }, 30000);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP错误: ${response.status} - ${errText}`);
        }

        const result = await response.json();
        if (utilNames.length) result.utilFiles = utilNames;
        result.stdout = replaceImageSchemes(result.stdout);
        return result;
    }

    return { execute };
})();
