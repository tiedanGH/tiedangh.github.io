document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const codeForm = document.getElementById('codeForm');
    const apiKeyInput = document.getElementById('apiKey');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const languageSelect = document.getElementById('language');
    const codeSourceSelect = document.getElementById('codeSource');
    const urlGroup = document.getElementById('urlGroup');
    const codeGroup = document.getElementById('codeGroup');
    const codeUrlInput = document.getElementById('codeUrl');
    const codeTextarea = document.getElementById('code');
    const stdinTextarea = document.getElementById('stdin');
    const runButton = document.getElementById('runButton');
    const resultContainer = document.getElementById('result');
    const outputDiv = document.getElementById('output');
    const httpsWarning = document.getElementById('httpsWarning');
    const debugModeCheckbox = document.getElementById('debugMode');
    const debugSection = document.getElementById('debugSection');

    // 检查是否为HTTPS
    const isHttps = window.location.protocol === 'https:';

    // 初始化安全设置
    initSecuritySettings();

    // 从localStorage加载上次的数据
    loadStoredData();

    // 确保页面加载时正确显示代码来源对应的UI
    updateCodeSourceUI();

    apiKeyInput.addEventListener('mousedown', function(e) {
        e.stopPropagation();
    });

    apiKeyInput.addEventListener('click', function(e) {
        e.stopPropagation();
        this.focus();
    });

    const passwordContainer = document.querySelector('.password-container');
    passwordContainer.addEventListener('click', function(e) {
        if (e.target === this) {
            apiKeyInput.focus();
        }
    });

    apiKeyInput.addEventListener('keydown', function(e) {
        e.stopPropagation();
    });

    apiKeyInput.addEventListener('keyup', function(e) {
        e.stopPropagation();
    });

    // 切换密码可见性
    togglePasswordBtn.addEventListener('click', function() {
        const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
        apiKeyInput.setAttribute('type', type);

        const icon = this.querySelector('i');
        if (type === 'text') {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });

    // 切换代码来源
    codeSourceSelect.addEventListener('change', function() {
        updateCodeSourceUI();
    });

    // 调试模式变化监听
    debugModeCheckbox.addEventListener('change', function() {
        updateRunButtonState();
    });

    // 初始化安全设置
    function initSecuritySettings() {
        // 显示HTTPS警告（如果不是HTTPS）
        if (!isHttps) {
            httpsWarning.style.display = 'block';
        } else {
            // HTTPS环境下隐藏调试模式区域
            debugSection.classList.add('hidden');
        }
        // 更新执行按钮状态
        updateRunButtonState();
    }

    // 更新执行按钮状态
    function updateRunButtonState() {
        const debugMode = debugModeCheckbox.checked;

        if (!isHttps) {
            if (!debugMode) {
                // 非HTTPS且未开启调试模式，禁用按钮
                runButton.disabled = true;
                runButton.title = '请在HTTPS环境下使用或开启调试模式';
                runButton.style.background = "#95a5a6";
                debugSection.style.background = "#f8f9fa";
            } else {
                // 非HTTPS但开启调试模式，启用按钮并警告
                runButton.disabled = false;
                runButton.title = '[调试模式] API Key可能不安全';
                runButton.style.background = "#f39c12";
                debugSection.style.background = "#fff8e1";
            }
        } else {
            // HTTPS或调试模式开启，启用按钮
            runButton.disabled = false;
            runButton.title = '';
        }
    }

    // 更新代码来源UI显示
    function updateCodeSourceUI() {
        if (codeSourceSelect.value === 'url') {
            urlGroup.style.display = 'block';
            codeGroup.style.display = 'none';
        } else {
            urlGroup.style.display = 'none';
            codeGroup.style.display = 'block';
        }
    }

    // 表单提交事件
    codeForm.addEventListener('submit', function(e) {
        e.preventDefault();

        // 安全检查
        if (!isHttps && !debugModeCheckbox.checked) {
            displayError('当前为非HTTPS环境，为了安全起见，请开启调试模式或使用HTTPS链接：https://page.tiedan.site/code_runner');
            return;
        }

        executeCode();
    });

    // 执行代码函数
    async function executeCode() {
        // 获取表单数据
        const apiKey = apiKeyInput.value;
        const language = languageSelect.value;
        const codeSource = codeSourceSelect.value;
        const codeUrl = codeUrlInput.value;
        const code = codeTextarea.value;
        const stdin = stdinTextarea.value;

        // 验证必填字段
        if (!apiKey || !language) {
            alert('请填写API Key和选择编程语言');
            return;
        }

        if (codeSource === 'url' && !codeUrl) {
            alert('请提供代码URL');
            return;
        }

        if (codeSource === 'textarea' && !code) {
            alert('请输入代码');
            return;
        }

        // 保存数据到localStorage
        saveDataToStorage(apiKey, language, codeSource, codeUrl, code, stdin);

        // 更新UI状态
        setRunningState(true);

        try {
            let finalCode = code;

            // 如果是从URL获取代码
            if (codeSource === 'url') {
                finalCode = await fetchCodeFromUrl(codeUrl);
            }

            // 准备请求数据
            const requestData = {
                files: [
                    {
                        name: getFileName(language),
                        content: finalCode
                    }
                ]
            };

            // 添加stdin（如果有）
            if (stdin.trim()) {
                requestData.stdin = stdin;
            }

            // 添加command（如果需要）
            const command = getCommand(language);
            if (command) {
                requestData.command = command;
                console.log('Run Command:', command);
            }

            // 发送请求到Glot API（通过CORS代理）
            const proxyUrl = 'https://cors-anywhere.herokuapp.com/'; // 公共CORS代理
            const targetUrl = `https://glot.io/api/run/${language}/latest`;

            console.log('Sending request to:', proxyUrl + targetUrl);

            const response = await fetchWithTimeout(
                proxyUrl + targetUrl, // 使用代理
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Token ${apiKey}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify(requestData)
                },
                30000 // 30秒超时
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP错误: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            // 显示结果
            displayResult(result);

        } catch (error) {
            console.error('执行代码时出错:', error);

            // 检查是否是CORS错误
            if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
                displayError('由于浏览器安全限制，无法直接访问Glot API。请修改浏览器扩展禁用CORS限制并重新发送请求。');
            } else {
                displayError(error.message);
            }
        } finally {
            // 恢复UI状态
            setRunningState(false);
        }
    }

    // 从URL获取代码
    async function fetchCodeFromUrl(url) {
        try {
            // 检查URL是否支持
            const supportedUrls = [
                'https://pastebin.ubuntu.com/p/',
                'https://glot.io/snippets/',
                'https://pastebin.com/raw/',
                'https://gist.githubusercontent.com/',
                'https://bytebin.lucko.me/',
                'https://pastes.dev/',
                'https://p.ip.fi/'
            ];

            const isSupported = supportedUrls.some(supportedUrl => url.startsWith(supportedUrl));
            if (!isSupported) {
                throw new Error('不支持的URL格式');
            }

            let finalUrl = url;
            let options = {};

            // 根据URL类型设置不同的请求参数
            if (url.startsWith('https://pastes.dev/')) {
                finalUrl = url.replace('pastes', 'api.pastes');
            }

            // 使用代理避免CORS问题
            const proxyUrl = 'https://cors-anywhere.herokuapp.com/';

            // 发送请求获取代码
            const response = await fetchWithTimeout(
                proxyUrl + finalUrl,
                options,
                10000 // 10秒超时
            );

            if (!response.ok) {
                throw new Error(`获取代码失败: ${response.status}`);
            }

            let content = await response.text();

            // 对于需要解析HTML的网站，提取内容
            if (url.startsWith('https://pastebin.ubuntu.com/p/') ||
                url.startsWith('https://glot.io/snippets/') ||
                url.startsWith('https://p.ip.fi/')) {

                // 创建DOM解析器
                const parser = new DOMParser();
                const doc = parser.parseFromString(content, 'text/html');

                let extractedContent = '';

                if (url.startsWith('https://pastebin.ubuntu.com/p/')) {
                    const hiddenContent = doc.querySelector('#hidden-content');
                    if (hiddenContent) {
                        extractedContent = hiddenContent.textContent;
                    }
                } else if (url.startsWith('https://glot.io/snippets/')) {
                    const editorContent = doc.querySelector('#editor-1');
                    if (editorContent) {
                        extractedContent = editorContent.textContent || editorContent.value;
                    }
                } else if (url.startsWith('https://p.ip.fi/')) {
                    const preContent = doc.querySelector('pre.prettyprint.linenums');
                    if (preContent) {
                        extractedContent = preContent.textContent;
                    }
                }

                if (extractedContent) {
                    content = extractedContent;
                } else {
                    throw new Error('无法从页面中提取代码内容');
                }
            }

            return content;
        } catch (error) {
            throw new Error(`从URL获取代码失败: ${error.message}`);
        }
    }

    // 带超时的fetch
    function fetchWithTimeout(url, options, timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('请求超时'));
            }, timeout);

            fetch(url, options)
                .then(response => {
                    clearTimeout(timer);
                    resolve(response);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    // 获取文件名
    function getFileName(language) {
        const fileNames = {
            python: 'main.py',
            javascript: 'main.js',
            java: 'Main.java',
            c: 'main.c',
            cpp: 'main.cpp',
            go: 'main.go',
            rust: 'main.rs',
            ruby: 'main.rb',
            php: 'main.php',
            swift: 'main.swift',
            typescript: 'main.ts',
            bash: 'script.sh'
        };

        return fileNames[language] || 'main.txt';
    }

    // 获取编译/运行命令
    function getCommand(language) {
        const commands = {
            c: 'clang -O2 main.c && ./a.out',
            cpp: 'clang++ -std=c++17 -O2 main.cpp && ./a.out'
        };

        return commands[language] || null;
    }

    // 显示执行结果
    function displayResult(result) {
        outputDiv.innerHTML = '';
        resultContainer.style.display = 'block';

        // 显示error
        if (result.error) {
            const errorSection = document.createElement('div');
            errorSection.className = 'output-section error';
            errorSection.innerHTML = `
                <h3><i class="fas fa-times-circle"></i> Error</h3>
                <div class="content">${result.error}</div>
            `;
            outputDiv.appendChild(errorSection);
        }

        // 显示stdout、stderr等
        if (result.stdout) {
            const stdoutSection = document.createElement('div');
            stdoutSection.className = 'output-section stdout';
            stdoutSection.innerHTML = `
                <h3><i class="fas fa-check-circle"></i> Stdout</h3>
                <div class="content">${result.stdout}</div>
            `;
            outputDiv.appendChild(stdoutSection);
        }

        if (result.stderr) {
            const stderrSection = document.createElement('div');
            stderrSection.className = 'output-section stderr';
            stderrSection.innerHTML = `
                <h3><i class="fas fa-exclamation-triangle"></i> Stderr</h3>
                <div class="content">${result.stderr}</div>
            `;
            outputDiv.appendChild(stderrSection);
        }

        // 如果没有输出
        if (!result.stdout && !result.stderr) {
            const noOutputSection = document.createElement('div');
            noOutputSection.className = 'output-section';
            noOutputSection.innerHTML = `
                <h3><i class="fas fa-info-circle"></i> 信息</h3>
                <div class="content">程序执行完成，但没有输出。</div>
            `;
            outputDiv.appendChild(noOutputSection);
        }

        // 显示执行时间（如果有）
        if (result.duration) {
            const durationSection = document.createElement('div');
            durationSection.className = 'output-section';
            durationSection.innerHTML = `
                <h3><i class="fas fa-clock"></i> 执行时间</h3>
                <div class="content">${result.duration} 毫秒</div>
            `;
            outputDiv.appendChild(durationSection);
        }

        // 滚动到结果区域
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    }

    // 显示错误信息
    function displayError(message) {
        outputDiv.innerHTML = '';
        resultContainer.style.display = 'block';

        const errorSection = document.createElement('div');
        errorSection.className = 'output-section error';
        errorSection.innerHTML = `
            <h3><i class="fas fa-times-circle"></i> 错误</h3>
            <div class="content">${message}</div>
        `;
        outputDiv.appendChild(errorSection);

        // 滚动到结果区域
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    }

    // 设置运行状态
    function setRunningState(isRunning) {
        if (isRunning) {
            runButton.disabled = true;
            runButton.innerHTML = '<i class="fas fa-spinner pulse"></i> 执行中...';
            runButton.classList.add('loading');
        } else {
            runButton.disabled = false;
            runButton.innerHTML = '<i class="fas fa-play"></i> 执行代码';
            runButton.classList.remove('loading');

            // 更新按钮状态（考虑HTTPS和调试模式）
            updateRunButtonState();
        }
    }

    // 保存数据到localStorage
    function saveDataToStorage(apiKey, language, codeSource, codeUrl, code, stdin) {
        const data = {
            apiKey: apiKey,
            language,
            codeSource,
            codeUrl,
            code,
            stdin
        };
        localStorage.setItem('glotRunnerLastData', JSON.stringify(data));
    }

    // 从localStorage加载数据
    function loadStoredData() {
        const data = localStorage.getItem('glotRunnerLastData');

        if (data) {
            try {
                if (data) {
                    apiKeyInput.value = data.apiKey || '';
                    languageSelect.value = data.language || '';
                    codeSourceSelect.value = data.codeSource || 'textarea';
                    codeUrlInput.value = data.codeUrl || '';
                    codeTextarea.value = data.code || '';
                    stdinTextarea.value = data.stdin || '';
                }
            } catch (error) {
                console.error('加载存储的数据时出错:', error);
            }
        }
    }
});