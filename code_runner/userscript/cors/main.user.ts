// ==UserScript==
// @name               Cors for Tiedan Code Runner
// @namespace          InvFish
// @version            0.1
// @description        为铁蛋Site的Code Runner添加跨域访问Glot API和Pastebin类网站的能力
// @author             InvFish
// @license            GPL-3.0-or-later
// @match              http*://github.tiedan.site/tiedan/code_runner/*
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

/**
 * # 使用方法
 * 1. 引导用户安装本脚本并刷新页面使脚本生效
 * 2. 在代码中可以直接调用window.corsFetch或者corsFetch函数，调用方法同原生fetch函数，即可直接访问Glot等网站，无需cors-anywhere中间件
 * 
 * # 开发指南
 * ## 获取typescript源代码
 * 脚本采用typescript开发，最好以typescript进行编辑再编译
 * 
 * ## 添加网站连接
 * 1. 将域名添加到 AllowedDomains 数组中
 * 2. 在脚本头中添加对应的@connect标签
 */

/* eslint-disable no-multi-spaces */
/* eslint-disable no-return-assign */

// 扩展Window属性
interface Window {
  corsFetch: Function;
}

// 用户脚本API 类型声明
declare const unsafeWindow: WindowProxy;

interface UserscriptRequestOptions {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'PATCH';
    headers?: Record<string, string>;
    data?: string | ArrayBuffer | Blob | FormData | URLSearchParams;
    binary?: boolean;
    timeout?: number;
    responseType?: 'arraybuffer' | 'blob' | 'json' | 'text' | 'document';
    overrideMimeType?: string;
    anonymous?: boolean;
    user?: string;
    password?: string;
    
    // 事件回调
    onload?: (response: UserscriptResponse) => void;
    onerror?: (response: UserscriptResponse) => void;
    ontimeout?: (response: UserscriptResponse) => void;
    onreadystatechange?: (response: UserscriptResponse) => void;
    onprogress?: (response: UserscriptProgressResponse) => void;
}

interface UserscriptResponse {
    readonly readyState: number;
    readonly response: any;
    readonly responseText: string;
    readonly responseXML: Document | null;
    readonly responseURL: string;
    readonly status: number;
    readonly statusText: string;
    readonly finalUrl: string;
    readonly responseHeaders: string;
}

interface UserscriptProgressResponse extends UserscriptResponse {
    readonly lengthComputable: boolean;
    readonly loaded: number;
    readonly total: number;
}

// 声明 GM_xmlhttpRequest 函数
declare function GM_xmlhttpRequest(details: UserscriptRequestOptions): { abort: () => void };

(function __MAIN__() {
    'use strict';

    const win = typeof unsafeWindow === 'object' ? unsafeWindow : window;
    const AllowedDomains = [
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
    function corsFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        return new Promise((resolve, reject) => {
            // 解析URL
            let url: string;
            if (typeof input === 'string') {
                url = input;
            } else if (input instanceof URL) {
                url = input.toString();
            } else {
                url = input.url;
            }

            // 检查域名是否在白名单内
            const requestUrl = new URL(url);
            const domain = requestUrl.hostname;
            
            if (!AllowedDomains.includes(domain)) {
                reject(new Error(`Domain ${domain} is not in the allowed list for cross-origin requests`));
                return;
            }

            // 准备GM_xmlhttpRequest的配置
            const options: UserscriptRequestOptions = {
                url: url,
                method: 'GET',
                headers: {},
                responseType: 'blob',
                onload: (response: UserscriptResponse) => {
                    // 构建符合Fetch API的Response对象
                    const fetchResponse = new Response(response.response, {
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
                onerror: (error: UserscriptResponse) => {
                    reject(new Error(`GM_xmlhttpRequest failed: ${error.statusText}`));
                },
                ontimeout: () => {
                    reject(new Error('Request timeout'));
                }
            };

            // 处理请求方法
            if (init?.method) {
                options.method = init.method as UserscriptRequestOptions['method'];
            }

            // 处理请求头
            if (init?.headers) {
                if (init.headers instanceof Headers) {
                    init.headers.forEach((value, key) => {
                        if (!options.headers) options.headers = {};
                        options.headers[key] = value;
                    });
                } else if (Array.isArray(init.headers)) {
                    init.headers.forEach(([key, value]) => {
                        if (!options.headers) options.headers = {};
                        options.headers[key] = value;
                    });
                } else {
                    if (!options.headers) options.headers = {};
                    Object.assign(options.headers, init.headers);
                }
            }

            // 处理请求体
            if (init?.body) {
                if (init.body instanceof FormData) {
                    options.data = init.body;
                } else if (init.body instanceof URLSearchParams) {
                    options.data = init.body.toString();
                    if (!options.headers) options.headers = {};
                    options.headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
                } else if (typeof init.body === 'string') {
                    options.data = init.body;
                } else if (init.body instanceof Blob) {
                    options.data = init.body;
                } else if (init.body instanceof ArrayBuffer) {
                    options.data = new Blob([init.body]);
                } else {
                    // 其他类型转换为字符串
                    options.data = String(init.body);
                }
            }

            // 处理超时
            if (init?.signal) {
                options.timeout = 0; // 由AbortSignal控制
                
                // 监听abort事件
                if (init.signal.aborted) {
                    reject(new DOMException('Aborted', 'AbortError'));
                    return;
                }

                const abortHandler = () => {
                    // GM_xmlhttpRequest没有直接的abort方法，但我们可以拒绝Promise
                    reject(new DOMException('Aborted', 'AbortError'));
                };

                init.signal.addEventListener('abort', abortHandler);
            }

            // 发送请求
            try {
                GM_xmlhttpRequest(options);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 解析响应头字符串为键值对对象
     */
    function parseResponseHeaders(headersString: string): Record<string, string> {
        const headers: Record<string, string> = {};
        if (!headersString) return headers;
        
        const headerPairs = headersString.split('\r\n');
        for (const pair of headerPairs) {
            const index = pair.indexOf(': ');
            if (index > 0) {
                const key = pair.substring(0, index).trim();
                const value = pair.substring(index + 1).trim();
                if (key) {
                    headers[key] = value;
                }
            }
        }
        return headers;
    }
}) ();