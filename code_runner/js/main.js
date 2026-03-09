document.addEventListener('DOMContentLoaded', function() {

    // DOM elements
    const el = {
        form: document.getElementById('codeForm'),
        apiKey: document.getElementById('apiKey'),
        togglePwd: document.getElementById('togglePassword'),
        language: document.getElementById('language'),
        codeSource: document.getElementById('codeSource'),
        urlGroup: document.getElementById('urlGroup'),
        codeGroup: document.getElementById('codeGroup'),
        codeUrl: document.getElementById('codeUrl'),
        code: document.getElementById('code'),
        stdin: document.getElementById('stdin'),
        outputFormat: document.getElementById('outputFormat'),
        storageOption: document.getElementById('storageOption'),
        runBtn: document.getElementById('runButton'),
        result: document.getElementById('result'),
        output: document.getElementById('output'),
        httpsWarn: document.getElementById('httpsWarning'),
        debugMode: document.getElementById('debugMode'),
        debugSection: document.getElementById('debugSection'),
        apiKeyHint: document.getElementById('apiKeyHint')
    };

    const isHttps = window.location.protocol === 'https:';

    // --- Init ---
    initSecurity();
    loadData();
    updateCodeSourceUI();
    checkApiKeyHint();

    // --- Event listeners ---
    el.apiKey.addEventListener('mousedown', e => e.stopPropagation());
    el.apiKey.addEventListener('click', function(e) { e.stopPropagation(); this.focus(); });
    el.apiKey.addEventListener('keydown', e => e.stopPropagation());
    el.apiKey.addEventListener('keyup', e => { e.stopPropagation(); checkApiKeyHint(); });

    document.querySelector('.password-container').addEventListener('click', function(e) {
        if (e.target === this) el.apiKey.focus();
    });

    el.togglePwd.addEventListener('click', () => {
        const isPwd = el.apiKey.type === 'password';
        el.apiKey.type = isPwd ? 'text' : 'password';
        const icon = el.togglePwd.querySelector('i');
        icon.classList.toggle('fa-eye', !isPwd);
        icon.classList.toggle('fa-eye-slash', isPwd);
    });

    el.codeSource.addEventListener('change', updateCodeSourceUI);
    el.debugMode.addEventListener('change', updateRunBtnState);

    el.form.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!isHttps && !el.debugMode.checked) {
            GlotOutput.displayError(
                '当前为非HTTPS环境，为了安全起见，请开启调试模式或使用HTTPS链接：https://page.tiedan.site/code_runner',
                el.output, el.result
            );
            return;
        }
        await runCode();
    });

    // --- Functions ---
    function initSecurity() {
        if (!isHttps) {
            el.httpsWarn.style.display = 'block';
        } else {
            el.debugSection.classList.add('hidden');
        }
        updateRunBtnState();
        if (window.corsFetch) {
            document.querySelector('#security-notice').classList.add('safe');
            document.querySelector('#security-notice-text').innerText =
                '您已安装用户脚本，请求将通过用户脚本发送而无需经过中间服务器，您的连接是安全的！';
        }
    }

    function updateRunBtnState() {
        if (!isHttps) {
            if (!el.debugMode.checked) {
                el.runBtn.disabled = true;
                el.runBtn.title = '请在HTTPS环境下使用或开启调试模式';
                el.runBtn.style.background = "#95a5a6";
                el.debugSection.style.background = "#f8f9fa";
            } else {
                el.runBtn.disabled = false;
                el.runBtn.title = '[调试模式] API Key可能不安全';
                el.runBtn.style.background = "#f39c12";
                el.debugSection.style.background = "#fff8e1";
            }
        } else {
            el.runBtn.disabled = false;
            el.runBtn.title = '';
        }
    }

    function updateCodeSourceUI() {
        const isUrl = el.codeSource.value === 'url';
        el.urlGroup.style.display = isUrl ? 'block' : 'none';
        el.codeGroup.style.display = isUrl ? 'none' : 'block';
    }

    function checkApiKeyHint() {
        el.apiKeyHint.style.display = el.apiKey.value.trim() ? 'none' : 'block';
    }

    function collectFormData() {
        return {
            apiKey: el.apiKey.value,
            language: el.language.value,
            codeSource: el.codeSource.value,
            codeUrl: el.codeUrl.value,
            code: el.code.value,
            stdin: el.stdin.value,
            outputFormat: el.outputFormat.value,
            storageOption: el.storageOption.value
        };
    }

    function loadData() {
        const d = GlotStorage.load();
        if (!d) return;
        el.apiKey.value = d.apiKey || '';
        el.language.value = d.language || '';
        el.codeSource.value = d.codeSource || 'textarea';
        el.codeUrl.value = d.codeUrl || '';
        el.code.value = d.code || '';
        el.stdin.value = d.stdin || '';
        el.outputFormat.value = d.outputFormat || 'text';
        el.storageOption.value = d.storageOption || 'not-implemented';
    }

    function setRunning(on) {
        if (on) {
            el.runBtn.disabled = true;
            el.runBtn.innerHTML = '<i class="fas fa-spinner pulse"></i> 执行中...';
            el.runBtn.classList.add('loading');
        } else {
            el.runBtn.disabled = false;
            el.runBtn.innerHTML = '<i class="fas fa-play"></i> 执行代码';
            el.runBtn.classList.remove('loading');
            updateRunBtnState();
        }
    }

    async function runCode() {
        const data = collectFormData();

        if (!data.language) {
            alert('请选择编程语言'); return;
        }
        if (data.language !== 'text' && !data.apiKey) {
            alert('请填写API Key'); return;
        }
        if (data.codeSource === 'url' && !data.codeUrl) {
            alert('请提供代码URL'); return;
        }
        if (data.codeSource === 'textarea' && !data.code) {
            alert('请输入代码'); return;
        }

        GlotStorage.save(data);
        setRunning(true);

        try {
            const result = await GlotExecutor.execute(data);
            GlotOutput.displayResult(result, data.outputFormat, el.output, el.result);
        } catch (error) {
            console.error('执行代码时出错:', error);
            let msg = error.message;
            if (msg.includes('Failed to fetch') || msg.includes('CORS')) {
                msg += '\n\n由于 CORS 限制，尝试请求 Glot API 失败。请尝试再次执行，或者安装用户脚本代替公共代理。';
            } else if (msg.includes('corsdemo')) {
                msg += '\n\n第三方CORS代理服务提示需手动激活，请访问'
                    + ' <a href="https://cors-anywhere.herokuapp.com/corsdemo" target="_blank">https://cors-anywhere.herokuapp.com/corsdemo</a> '
                    + '点击 `Request temporary access to the demo server` 按钮获取临时访问权限后，再返回本页面重新请求执行。\n\n或者安装用户脚本代替公共代理。';
            }
            GlotOutput.displayError(msg, el.output, el.result);
        } finally {
            setRunning(false);
        }
    }
});
