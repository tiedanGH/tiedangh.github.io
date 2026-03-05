const GlotStorage = (() => {
    const STORAGE_KEY = 'glotRunnerLastData';

    function save(data) {
        const encrypted = data.apiKey ? GlotUtils.encrypt(data.apiKey) : "";
        const payload = {
            apiKey: encrypted,
            language: data.language,
            codeSource: data.codeSource,
            codeUrl: data.codeUrl,
            code: data.code,
            stdin: data.stdin,
            outputFormat: data.outputFormat,
            storageOption: data.storageOption
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function load() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        try {
            const d = JSON.parse(raw);
            if (d.apiKey) d.apiKey = GlotUtils.decrypt(d.apiKey);
            return d;
        } catch (e) {
            console.error('加载存储的数据时出错:', e);
            return null;
        }
    }

    return { save, load };
})();
