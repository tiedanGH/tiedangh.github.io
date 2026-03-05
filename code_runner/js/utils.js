const GlotUtils = (() => {
    const SECRET_KEY = "glot-runner-local-secret-key";

    function encrypt(text) {
        return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
    }

    function decrypt(ciphertext) {
        try {
            const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
            return bytes.toString(CryptoJS.enc.Utf8) || "";
        } catch { return ""; }
    }

    function fetchWithTimeout(url, options, timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('请求超时')), timeout);
            (window.corsFetch ?? fetch)(url, options)
                .then(r => { clearTimeout(timer); resolve(r); })
                .catch(e => { clearTimeout(timer); reject(e); });
        });
    }

    function getFileName(lang) {
        const m = {
            python: 'main.py',
            c: 'main.c',
            cpp: 'main.cpp',
            java: 'Main.java',
            javascript: 'main.js',
            typescript: 'main.ts',
            go: 'main.go',
            rust: 'main.rs',
            ruby: 'main.rb',
            php: 'main.php',
            swift: 'main.swift',
            bash: 'main.sh'
        };
        return m[lang] || 'main.txt';
    }

    function getCommand(lang) {
        const m = {
            c: 'clang -O2 main.c && ./a.out',
            cpp: 'clang++ -std=c++17 -O2 main.cpp && ./a.out'
        };
        return m[lang] || null;
    }

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function isValidUrl(str) {
        try {
            const u = new URL(str.trim());
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch { return false; }
    }

    return { encrypt, decrypt, fetchWithTimeout, getFileName, getCommand, escapeHtml, isValidUrl };
})();
