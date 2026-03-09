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

    async function execute({ apiKey, language, codeSource, codeUrl, code, stdin }) {
        let finalCode = code;
        if (codeSource === 'url') {
            finalCode = await fetchCodeFromUrl(codeUrl);
        }

        // Text语言直接返回输入内容，不调用API
        if (language === 'text') {
            return {
                stdout: finalCode || '',
                stderr: '',
                error: '',
                duration: 0
            };
        }

        const requestData = {
            files: [{ name: GlotUtils.getFileName(language), content: finalCode }]
        };
        if (stdin && stdin.trim()) requestData.stdin = stdin;

        const command = GlotUtils.getCommand(language);
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

        return await response.json();
    }

    return { execute };
})();
