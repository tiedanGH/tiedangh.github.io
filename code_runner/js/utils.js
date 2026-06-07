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

    // --- Base64 (data URI) parsing, mirrors bot Base64Processor.mimeTypeToExtension ---
    // Supported types: image / audio / video / text. application(pdf/octet-stream) & unknown -> error.
    const BASE64_MIME_MAP = {
        'image/jpeg': { ext: 'jpg',  type: 'image' },
        'image/png':  { ext: 'png',  type: 'image' },
        'image/gif':  { ext: 'gif',  type: 'image' },
        'image/bmp':  { ext: 'bmp',  type: 'image' },
        'image/webp': { ext: 'webp', type: 'image' },
        'audio/mpeg': { ext: 'mp3',  type: 'audio' },
        'audio/wav':  { ext: 'wav',  type: 'audio' },
        'audio/ogg':  { ext: 'ogg',  type: 'audio' },
        'video/mp4':  { ext: 'mp4',  type: 'video' },
        'video/avi':  { ext: 'avi',  type: 'video' },
        'video/webm': { ext: 'webm', type: 'video' },
        'application/pdf': { ext: 'pdf', type: 'application' },
        'application/octet-stream': { ext: 'octet-stream', type: 'application' },
        'text/plain': { ext: 'txt', type: 'text' }
    };
    const BASE64_SUPPORTED_TYPES = new Set(['text', 'image', 'audio', 'video']);

    /**
     * 解析 base64 / data URI 字符串
     * @returns {{ok:boolean, fileType:string, extension?:string, mime?:string, dataUri?:string, bytes?:Uint8Array, error?:string}}
     */
    function parseBase64(rawText) {
        const input = (rawText || '').trim();
        const commaIndex = input.indexOf(',');
        const mimePrefix = commaIndex >= 0 ? input.slice(0, commaIndex) : '';
        let body = (commaIndex >= 0 ? input.slice(commaIndex + 1) : input).trim();

        // 去除首尾引号与 BOM（与原框架一致）
        if ((body.startsWith('"') && body.endsWith('"')) ||
            (body.startsWith("'") && body.endsWith("'"))) {
            body = body.slice(1, -1);
        }
        body = body.replace(new RegExp(String.fromCharCode(0xFEFF), 'g'), '');

        const mimeMatch = /data:(.*?);base64/i.exec(mimePrefix);
        const mime = mimeMatch ? mimeMatch[1] : '[unknown]';
        const mapped = BASE64_MIME_MAP[mime.toLowerCase()] || { ext: mime, type: 'error' };

        if (!BASE64_SUPPORTED_TYPES.has(mapped.type)) {
            return {
                ok: false,
                fileType: 'error',
                error: `[错误] 当前Base64不支持此文件格式：${mapped.ext}，请确保字符串前包含正确的“data:xxx”用于检测格式`
            };
        }

        // 归一化（url-safe -> 标准，去除非法字符，类似 MimeDecoder 的宽容处理）后再解码
        const illegal = /[^A-Za-z0-9+/=\-_\r\n]/.exec(body);
        const normalized = body.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
        let bytes;
        try {
            const bin = atob(normalized);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } catch (e) {
            return {
                ok: false,
                fileType: 'error',
                error: illegal
                    ? `[错误] Base64解析出错：包含非法字符 '${illegal[0]}'`
                    : `[错误] Base64解析出错：${e.message}`
            };
        }

        return {
            ok: true,
            fileType: mapped.type,
            extension: mapped.ext,
            mime,
            dataUri: `data:${mime};base64,${normalized}`,
            bytes
        };
    }

    function bytesToText(bytes) {
        try { return new TextDecoder('utf-8').decode(bytes); }
        catch { return ''; }
    }

    return { encrypt, decrypt, fetchWithTimeout, getFileName, getCommand, escapeHtml, isValidUrl, parseBase64, bytesToText };
})();
