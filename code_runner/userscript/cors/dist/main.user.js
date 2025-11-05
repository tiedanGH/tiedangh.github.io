// ==UserScript==
// @name               Cors for Tiedan Code Runner
// @namespace          InvFish
// @version            0.1
// @description        为铁蛋Site的Code Runner添加跨域访问Glot API和Pastebin类网站的能力
// @author             InvFish
// @license            GPL-3.0-or-later
// @match              http*://tiedan.site/tiedan/code_runner/*
// @match              http*://github.tiedan.site/tiedan/code_runner/*
// @match              http*://*.tiedan.site/code_runner/*
// @match              http*://127.0.0.1/*
// @connect            pastebin.ubuntu.com
// @connect            glot.io
// @connect            pastebin.com
// @connect            gist.githubusercontent.com
// @connect            bytebin.lucko.me
// @connect            pastes.dev
// @connect            p.ip.fi
// @icon               https://github.tiedan.site/tiedan/code_runner/favicon.ico
// @grant              GM_xmlhttpRequest
// @run-at             document-start
// ==/UserScript==
(function __MAIN__() {
    'use strict';
    var win = typeof unsafeWindow === 'object' ? unsafeWindow : window;
    var AllowedDomains = [
        'pastebin.ubuntu.com',
        'glot.io',
        'pastebin.com',
        'gist.githubusercontent.com',
        'bytebin.lucko.me',
        'pastes.dev',
        'p.ip.fi',
    ];
    AllowedDomains.push(location.host);
    win.corsFetch = corsFetch;
    /**
     * 跨域fetch函数，拥有与原生fetch相同的签名
     * @param input 请求URL或Request对象
     * @param init 可选的请求配置
     * @returns 返回Promise<Response>
     */
    function corsFetch(input, init) {
        return new Promise(function (resolve, reject) {
            // 解析URL
            var url;
            if (typeof input === 'string') {
                url = input;
            }
            else if (input instanceof URL) {
                url = input.toString();
            }
            else {
                url = input.url;
            }
            // 检查域名是否在白名单内
            var requestUrl = new URL(url);
            var domain = requestUrl.hostname;
            if (!AllowedDomains.includes(domain)) {
                reject(new Error("Domain ".concat(domain, " is not in the allowed list for cross-origin requests")));
                return;
            }
            // 准备GM_xmlhttpRequest的配置
            var options = {
                url: url,
                method: 'GET',
                headers: {},
                responseType: 'blob',
                onload: function (response) {
                    // 构建符合Fetch API的Response对象
                    var fetchResponse = new Response(response.response, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: new Headers(parseResponseHeaders(response.responseHeaders))
                    });
                    // 添加一些额外的属性以保持兼容性
                    Object.defineProperty(fetchResponse, 'url', {
                        value: response.finalUrl || url,
                        writable: false
                    });
                    resolve(fetchResponse);
                },
                onerror: function (error) {
                    reject(new Error("GM_xmlhttpRequest failed: ".concat(error.statusText)));
                },
                ontimeout: function () {
                    reject(new Error('Request timeout'));
                }
            };
            // 处理请求方法
            if (init === null || init === void 0 ? void 0 : init.method) {
                options.method = init.method;
            }
            // 处理请求头
            if (init === null || init === void 0 ? void 0 : init.headers) {
                if (init.headers instanceof Headers) {
                    init.headers.forEach(function (value, key) {
                        if (!options.headers)
                            options.headers = {};
                        options.headers[key] = value;
                    });
                }
                else if (Array.isArray(init.headers)) {
                    init.headers.forEach(function (_a) {
                        var key = _a[0], value = _a[1];
                        if (!options.headers)
                            options.headers = {};
                        options.headers[key] = value;
                    });
                }
                else {
                    if (!options.headers)
                        options.headers = {};
                    Object.assign(options.headers, init.headers);
                }
            }
            // 处理请求体
            if (init === null || init === void 0 ? void 0 : init.body) {
                if (init.body instanceof FormData) {
                    options.data = init.body;
                }
                else if (init.body instanceof URLSearchParams) {
                    options.data = init.body.toString();
                    if (!options.headers)
                        options.headers = {};
                    options.headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
                }
                else if (typeof init.body === 'string') {
                    options.data = init.body;
                }
                else if (init.body instanceof Blob) {
                    options.data = init.body;
                }
                else if (init.body instanceof ArrayBuffer) {
                    options.data = new Blob([init.body]);
                }
                else {
                    // 其他类型转换为字符串
                    options.data = String(init.body);
                }
            }
            // 处理超时
            if (init === null || init === void 0 ? void 0 : init.signal) {
                options.timeout = 0; // 由AbortSignal控制
                // 监听abort事件
                if (init.signal.aborted) {
                    reject(new DOMException('Aborted', 'AbortError'));
                    return;
                }
                var abortHandler = function () {
                    // GM_xmlhttpRequest没有直接的abort方法，但我们可以拒绝Promise
                    reject(new DOMException('Aborted', 'AbortError'));
                };
                init.signal.addEventListener('abort', abortHandler);
            }
            // 发送请求
            try {
                GM_xmlhttpRequest(options);
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * 解析响应头字符串为键值对对象
     */
    function parseResponseHeaders(headersString) {
        var headers = {};
        if (!headersString)
            return headers;
        var headerPairs = headersString.split('\r\n');
        for (var _i = 0, headerPairs_1 = headerPairs; _i < headerPairs_1.length; _i++) {
            var pair = headerPairs_1[_i];
            var index = pair.indexOf(': ');
            if (index > 0) {
                var key = pair.substring(0, index).trim();
                var value = pair.substring(index + 1).trim();
                if (key) {
                    headers[key] = value;
                }
            }
        }
        return headers;
    }
})();
//# sourceMappingURL=main.user.js.map