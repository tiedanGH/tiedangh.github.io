const GlotExecutor = (() => {
    const ProxyURL = 'https://cors-anywhere.herokuapp.com/';
    const GLOT_MUX_URL = 'https://glot.io/api/mux';   // the new site's run endpoint, no API Token

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

    // --- glot run config, mirrors GlotLanguages.kt (data from glotcode/glot-languages) ---
    // /api/mux requires explicit runInstructions.
    // {file} = main file name, {stem} = that name without its extension, first letter capitalized (java).
    const GLOT_LANGUAGES = {
        bash:       { image: 'glot/bash:latest',       run: 'bash {file}' },
        c:          { image: 'glot/clang:latest',      build: ['clang -O2 -o a.out -lm {file}'], run: './a.out' },
        cpp:        { image: 'glot/clang:latest',      build: ['clang++ -std=c++17 -O2 -o a.out {file}'], run: './a.out' },
        go:         { image: 'glot/golang:latest',     build: ['go build -o a.out {file}'], run: './a.out' },
        java:       { image: 'glot/java:latest',       build: ['javac {file}'], run: 'java {stem}' },
        javascript: { image: 'glot/javascript:latest', run: 'node {file}' },
        php:        { image: 'glot/php:latest',        run: 'php {file}' },
        python:     { image: 'glot/python:latest',     run: 'python {file}' },
        ruby:       { image: 'glot/ruby:latest',       run: 'ruby {file}' },
        rust:       { image: 'glot/rust:latest',       build: ['rustc -o a.out {file}'], run: './a.out' },
        swift:      { image: 'glot/swift:latest',      run: 'swift {file}' },
        typescript: { image: 'glot/typescript:latest', build: ['tsc {file}'], run: 'node {js}' }
    };

    // glot docker image, shared by /api/mux and Docker Run (image name is not always the language name)
    function glotImage(language) {
        const cfg = GLOT_LANGUAGES[language];
        return cfg ? cfg.image : 'glot/' + language + ':latest';
    }

    function fillCommand(cmd, mainFile) {
        const stem = mainFile.replace(/\.[^.]*$/, '');
        return cmd.replaceAll('{file}', mainFile)
            .replaceAll('{stem}', stem.charAt(0).toUpperCase() + stem.slice(1))
            .replaceAll('{js}', stem + '.js');
    }

    function runInstructions(language, mainFile) {
        const cfg = GLOT_LANGUAGES[language];
        if (!cfg) throw new Error('不支持的语言 ' + language);
        return {
            buildCommands: (cfg.build || []).map(c => fillCommand(c, mainFile)),
            runCommand: fillCommand(cfg.run, mainFile)
        };
    }

    // glot reports duration in NANOSECONDS (docker-run and /api/mux alike); convert to ms for display
    // (guard: only convert implausibly-large values, leave already-ms values untouched)
    function nsToMs(duration) {
        return (typeof duration === 'number' && duration > 100000) ? Math.round(duration / 1e6) : duration;
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

    async function execute({ language, codeSource, codeUrl, code, stdin, requestMethod, dockerUrl, dockerToken }) {
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

        // Shared files[] (main file first, then util files), used by both request methods
        const lang = language.toLowerCase();
        const files = [{ name: GlotUtils.getFileName(language), content: finalCode }];
        const utilFiles = await detectUtilFiles(language, finalCode);   // auto-include util files when referenced
        for (const f of utilFiles) files.push(f);
        const utilNames = utilFiles.map(f => f.name);   // surfaced in the Debug area by output.js

        // Docker Run：自定义请求地址，body 为 {image, payload}，鉴权头 X-Access-Token；无需用户脚本/代理
        if (requestMethod === 'docker') {
            const command = GlotUtils.getCommand(language);
            const payload = { language: lang, files: files };
            if (stdin && stdin.trim()) payload.stdin = stdin;
            if (command) payload.command = command;
            const headers = { 'Content-Type': 'application/json' };
            if (dockerToken) headers['X-Access-Token'] = dockerToken;
            console.log('(Docker Run) Sending request to:', dockerUrl, command ? ('| command: ' + command) : '');
            const response = await GlotUtils.fetchWithTimeout(dockerUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ image: glotImage(lang), payload: payload })
            }, 30000, true);   // true = native fetch, never via userscript
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP错误: ${response.status} - ${errText}`);
            }
            const result = await response.json();
            result.duration = nsToMs(result.duration);
            if (utilNames.length) result.utilFiles = utilNames;
            result.stdout = replaceImageSchemes(result.stdout);
            return result;
        }

        // Glot（新版官网 /api/mux，默认），mirrors GlotAPI.runOnGlot：无需注册与 API Token
        const instructions = runInstructions(lang, files[0].name);
        const request = {
            action: 'run',
            data: {
                image: glotImage(lang),
                payload: { runInstructions: instructions, files: files, stdin: (stdin && stdin.trim()) ? stdin : null }
            }
        };

        const finalUrl = window.corsFetch ? GLOT_MUX_URL : ProxyURL + GLOT_MUX_URL;
        console.log(window.corsFetch ? '(Userscript)' : '(Proxy)', 'Sending request to:', finalUrl,
            '| image:', request.data.image, '| run:', instructions.buildCommands.concat(instructions.runCommand).join(' && '));

        const response = await GlotUtils.fetchWithTimeout(finalUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://glot.io',    // Page headers only the userscript can set them
                'Referer': 'https://glot.io/new/' + lang
            },
            body: JSON.stringify(request)
        }, 30000);

        // HTTP 400 carries { error: { code, message, requestId } } in the body; other failures stop here
        if (!response.ok && response.status !== 400) {
            const errText = await response.text();
            throw new Error(`HTTP错误: ${response.status} - ${errText}`);
        }
        const body = await response.json();
        if (!body.data) {
            const err = body.error;
            throw new Error((err ? `[${err.code}] ${err.message}` : '未获取到任何数据'));
        }

        const result = body.data;
        result.duration = nsToMs(result.duration);
        if (utilNames.length) result.utilFiles = utilNames;
        result.stdout = replaceImageSchemes(result.stdout);
        return result;
    }

    return { execute };
})();
