class QBinViewer {
    constructor() {
        this.currentPath = parsePath(window.location.pathname);
        this.clickTimeout = null;
        this.CACHE_KEY = 'qbin/';
        this.buttonBar = document.getElementById('buttonBar');
        this.cherryContainer = document.getElementById('qbin-viewer');
        this.isProcessing = false;
        this.debounceTimeouts = new Map();
        this.init();
    }

    initViewer(content, contentType) {
        if (window.cherry) {
            window.cherry = null;
        }

        function getThemePreference() {
            const savedTheme = localStorage.getItem('qbin-theme') || 'system';
            if (savedTheme === 'dark') return 'dark';
            if (savedTheme === 'light') return 'light';
            return window.matchMedia('(prefers-color-scheme: dark)').matches ?
                'dark' : 'light';
        }

        const currentTheme = getThemePreference();
        if (contentType.startsWith("text/plain")) {
            const cherryConfig = {
                id: 'qbin-viewer',
                value: content,
                editor: {
                    defaultModel: 'editOnly',
                    keepDocumentScrollAfterInit: false,
                    convertWhenPaste: false, // 粘贴时不转换HTML到Markdown
                    showFullWidthMark: false, // 不高亮全角符号
                    showSuggestList: false, // 不显示联想框
                    codemirror: {
                        autofocus: false, // 不自动聚焦
                        readOnly: true, // 设置为只读
                        mode: 'text/plain',
                        lineNumbers: false, // 不显示行号
                        lineWrapping: true, // 启用自动换行
                        theme: 'default',
                        styleActiveLine: false,
                        matchBrackets: false,
                    },

                },
                toolbars: {
                    toolbar: false, // 不显示工具栏
                    showToolbar: false,
                    bubble: false, // 禁用气泡工具栏
                    float: false, // 禁用浮动工具栏
                    sidebar: false,
                    toc: false,
                },
                previewer: {
                    dom: false,
                    enablePreviewerBubble: false, // 禁用预览区域编辑能力
                },
                autoScrollByHashAfterInit: false,
                autoScrollByCursor: false,  // 禁用自动滚动
                height: '100%',
                engine: {
                    global: {
                        classicBr: false,
                        htmlWhiteList: '',
                        flowSessionContext: true,
                    },
                },
                themeSettings: {
                    mainTheme: currentTheme,
                    inlineCodeTheme: 'default',
                    codeBlockTheme: 'default',
                    toolbarTheme: 'default'
                },
            };
            window.cherry = new Cherry(cherryConfig);
            this.contentType = contentType;
        } else {
            Cherry.usePlugin(CherryCodeBlockMermaidPlugin, {
          mermaid: window.mermaid,
          theme: 'default',
          sequence: {
            useMaxWidth: false,
            showSequenceNumbers: true,
            mirrorActors: true,
            messageAlign: 'center'
          },
          flowchart: {
            htmlLabels: true,
            curve: 'linear'
          }
        });
            Cherry.usePlugin(CherryTableEchartsPlugin, {
              mermaid: window.echarts,
            });
            const cherryConfig = {
                id: 'qbin-viewer',
                nameSpace: 'qbin',
                value: content,
                editor: {
                    defaultModel: 'previewOnly',
                },
                toolbars: {
                    toolbar: false, // 不显示工具栏
                    showToolbar: false,
                    bubble: false, // 禁用气泡工具栏
                    float: false, // 禁用浮动工具栏
                    sidebar: false,
                    toc: contentType.includes("markdown") ? {
                        updateLocationHash: false, // 更新URL的hash
                        defaultModel: 'pure', // 完整模式，会展示所有标题
                        position: 'fixed', // 悬浮目录
                        cssText: 'right: 20px;',
                    } : false,
                },
                previewer: {
                    enablePreviewerBubble: false, // 禁用预览区域编辑能力
                },
                autoScrollByHashAfterInit: false,
                externals: {
                    katex: window.katex, // 如果需要使用Katex的话
                },
                engine: {
                    global: {
                        urlProcessor(url, srcType) {
                            return url;
                        },
                        flowSessionContext: true,
                    },
                    syntax: {
                        mathBlock: {
                            engine: 'katex',
                        },
                        inlineMath: {
                            engine: 'katex',
                        },
                        codeBlock: {
                            theme: 'dark',
                            lineNumber: false,
                            copyCode: false,
                        },
                    },
                },
                themeSettings: {
                    mainTheme: currentTheme,
                    codeBlockTheme: 'default',
                },
            };
            window.cherry = new Cherry(cherryConfig);
            this.contentType = contentType;
        }
    }

    async init() {
        try {
            const {key, pwd} = this.currentPath;
            if (!key) {
                this.hideLoading();
                return;
            }
            const url = `/r/${key}/${pwd}`;
            this.showLoading();
            const headResponse = await fetch(url, {method: 'HEAD'});
            if (!headResponse.ok) {
                const status = headResponse.status;
                if (status === 403) {
                    // 处理密码错误的情况 - 显示密码输入界面
                    this.showPasswordDialog(key, pwd);
                    return;
                } else if (status === 404) {
                    throw new Error('访问内容不存在');
                }
                throw new Error('内容加载失败');
            }
            await this.loadContent(headResponse);
        } catch (error) {
            console.error('Error loading content:', error);
            const debouncedHome = this.debounce(() => this.handleHome());
            const debouncedNew = this.debounce(() => this.handleNew());
            this.buttonBar.innerHTML = '';
            this.buttonBar.appendChild(this.addButton('Home', debouncedHome));
            this.buttonBar.appendChild(this.addButton('New', debouncedNew));
            await this.renderError(error.message || '内容加载失败')
        }
    }

    async loadContent(headResponse) {
        const contentType = headResponse.headers.get('Content-Type');
        const contentLength = headResponse.headers.get('Content-Length');
        this.setupButtons(contentType);

        if (!(['text/', 'image/', 'audio/', 'video/'].some(type => contentType.startsWith(type)))) {
            return await this.renderOtherContent(contentType, contentLength);
        }

        this.showLoading();
        const url = `/r/${this.currentPath.key}/${this.currentPath.pwd}`;
        const response = await API.fetchNet(url);
        if (contentType?.startsWith('text/plain')) {
            await this.renderPlainTextContent(response, contentType, contentLength);
        } else if (contentType?.startsWith('text/')) {
            await this.renderTextContent(response, contentType, contentLength);
        } else if (contentType?.startsWith('image/')) {
            await this.renderImageContent(response, contentType, url, contentLength);
        } else if (contentType?.startsWith('audio/')) {
            await this.renderAudioContent(response, contentType, url, contentLength);
        } else if (contentType?.startsWith('video/')) {
            await this.renderVideoContent(response, contentType, url, contentLength);
        } else {
            await this.renderOtherContent(response, contentType, contentLength);
        }
    }

    async renderImageContent(response, contentType, sourceUrl, contentLength) {
        this.cherryContainer.innerHTML = '';
        const imageMarkdown = `::: center  
![images](${sourceUrl})
:::
`;
        this.initViewer(imageMarkdown, contentType);
        this.hideLoading();
    }

    async renderAudioContent(response, contentType, sourceUrl, contentLength) {
        this.cherryContainer.innerHTML = '';
        const audioMarkdown = `::: center  
<div class="modern-audio-player">
  <div class="audio-player-icon">🎵</div>
  <div class="audio-player-content">
    <div class="audio-title">Audio File</div>
    <audio controls src="${sourceUrl}" class="modern-audio-control"></audio>
  </div>
</div>
:::
`;
        this.initViewer(audioMarkdown, contentType);
        this.hideLoading();
    }

    async renderVideoContent(response, contentType, sourceUrl, contentLength) {
        this.cherryContainer.innerHTML = '';
        const videoMarkdown = `::: center  
!video[视频文件](${sourceUrl})
:::
`;
        this.initViewer(videoMarkdown, contentType);
        this.hideLoading();
    }

    async renderPlainTextContent(response, contentType) {
        const text = await response.text();
        this.initViewer(text, contentType);
        this.hideLoading();
    }

    async renderTextContent(response, contentType) {
        let language = contentType.includes("text/x-")? contentType.substring(7): contentType.substring(5);
        language = language.split("; ")[0];
        const contentText = contentType.includes("markdown")?await response.text():`\`\`\`${language}\n${await response.text()}`;
        this.initViewer(contentText, contentType);
        this.hideLoading();
    }

    async renderOtherContent(contentType, contentLength) {
        this.cherryContainer.innerHTML = '';
        const other = `
::: center  
!17 文件类型: ${contentType}!
!17 大小: ${formatSize(contentLength)}!
:::
`;
        this.initViewer(other, contentType);
        this.hideLoading();
    }

    async renderError(message) {
        this.cherryContainer.innerHTML = '';
        const errorComponent = `
<div class="modern-error-container">
    <div class="error-icon-wrapper">
        <div class="error-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2"/>
                <path d="M12 8V12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <circle cx="12" cy="16" r="1" fill="currentColor"/>
            </svg>
        </div>
    </div>
    <div class="error-content">
        <h3 class="error-title">出错了</h3>
        <p class="error-message">${message}</p>
    </div>
</div>
`;

        this.cherryContainer.innerHTML = errorComponent;
        this.hideLoading();
    }

    debounce(func, wait = 5) {
        const key = func.name; // 使用函数名作为唯一标识
        return async (...args) => {
            // 如果正在处理中，直接返回
            if (this.isProcessing) {
                return;
            }

            // 清除已存在的计时器
            if (this.debounceTimeouts.has(key)) {
                clearTimeout(this.debounceTimeouts.get(key));
            }

            // 创建新的Promise
            return new Promise((resolve) => {
                const timeout = setTimeout(async () => {
                    this.isProcessing = true;
                    try {
                        await func.apply(this, args);
                        resolve();
                    } catch (error) {
                        console.error(error);
                    } finally {
                        this.isProcessing = false;
                        this.debounceTimeouts.delete(key);
                    }
                }, wait);

                this.debounceTimeouts.set(key, timeout);
            });
        };
    }

    setupButtons(contentType) {
        // 创建按钮组
        const primaryGroup = document.createElement('div');
        const secondaryGroup = document.createElement('div');
        primaryGroup.className = 'button-group';
        secondaryGroup.className = 'button-group';

        // 使用防抖包装按钮处理函数
        const debouncedFork = this.debounce(() => this.handleFork());
        const debouncedRaw = this.debounce(() => this.handleRaw());
        const debouncedNew = this.debounce(() => this.handleNew());
        const debouncedDelete = this.debounce(() => this.handleDelete());
        const debouncedDownload = this.debounce(() => this.handleDownload());

        const copyBtn = this.addButton('Copy', () => this.handleCopy());
        primaryGroup.appendChild(copyBtn);

        if (contentType?.startsWith('text/')) {
            primaryGroup.appendChild(this.addButton('Fork', debouncedFork));
            const rawBtn = this.addButton('Raw', debouncedRaw);
            primaryGroup.appendChild(rawBtn);
        } else if (['image/', 'audio/', 'video/'].some(type => contentType.startsWith(type))) {
            const rawBtn = this.addButton('Raw', debouncedRaw);
            primaryGroup.appendChild(rawBtn);
        } else {
            const downBtn = this.addButton('Down', debouncedDownload);
            primaryGroup.appendChild(downBtn);
        }

        primaryGroup.appendChild(this.addButton('New', debouncedNew));
        const HomeBtn = this.addButton('Home', () => this.handleHome());
        secondaryGroup.appendChild(HomeBtn);

        const qrBtn = this.addButton('Share', () => this.showQRCode());
        secondaryGroup.appendChild(qrBtn);

        // 删除按钮放在最后，使用危险样式
        const delBtn = this.addButton('Delete', debouncedDelete);
        delBtn.classList.add('danger');
        secondaryGroup.appendChild(delBtn);

        this.buttonBar.appendChild(primaryGroup);
        this.buttonBar.appendChild(secondaryGroup);
    }

    addButton(text, onClick) {
        const button = document.createElement('button');
        button.className = 'button';
        button.setAttribute('aria-label', text);
        
        // Create icon-text container
        const buttonContent = document.createElement('span');
        buttonContent.className = 'button-content';
        
        // Add icon based on button text
        const iconSvg = this.getButtonIcon(text);
        if (iconSvg) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'button-icon';
            iconSpan.innerHTML = iconSvg;
            buttonContent.appendChild(iconSpan);
        }
        
        // Add text
        const textSpan = document.createElement('span');
        textSpan.className = 'button-text';
        textSpan.textContent = text;
        buttonContent.appendChild(textSpan);
        
        // Add content to button
        button.appendChild(buttonContent);
        
        button.onclick = async (e) => {
            const btn = e.currentTarget;
            if (btn.disabled) return;
            btn.disabled = true;
            try {
                await onClick();
            } finally {
                btn.disabled = false;
            }
        };
        return button;
    }

    getButtonIcon(buttonType) {
        // Return appropriate SVG icon based on button type
        const icons = {
            'Home': '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-home"><path d="M2 10l10-7 10 7M4.5 10.5V20a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-9.5"/><path d="M10 21v-6h4v6"/></svg>',
            'Copy': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
            'Fork': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="4"><path d="M37 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8Zm-26 0a4 4 0 1 0 0-8a4 4 0 0 0 0 8Zm13 32a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z"/><path stroke-linecap="round" d="M11 12v3c0 7 13 10 13 17v4v-4c0-7 13-10 13-17v-3"/></g></svg>',
            'Raw': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 22v-9m0 9l-2.5-2m2.5 2l2.5-2M5.034 9.117A4.002 4.002 0 0 0 6 17h1"/><path d="M15.83 7.138a5.5 5.5 0 0 0-10.796 1.98S5.187 10 5.5 10.5"/><path d="M17 17a5 5 0 1 0-1.17-9.862L14.5 7.5"/></g></svg>',
            'Share': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none"><path d="M22 10.981L15.027 2v4.99C3.075 6.99 1.711 16.678 2.043 22l.007-.041c.502-2.685.712-6.986 12.977-6.986v4.99L22 10.98z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>',
            'New': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>',
            'Delete': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16l-1.58 14.22A2 2 0 0 1 16.432 22H7.568a2 2 0 0 1-1.988-1.78zm3.345-2.853A2 2 0 0 1 9.154 2h5.692a2 2 0 0 1 1.81 1.147L18 6H6zM2 6h20m-12 5v5m4-5v5"/></svg>',
            'Down': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.877a2 2 0 0 0 1.94-1.515L22 17"/></svg>'
        };
        
        return icons[buttonType] || null;
    }

    handleRaw() {
        window.location.assign(`/r/${this.currentPath.key}/${this.currentPath.pwd}`);
    }

    handleFork() {
        try {
            // 如果使用cherry-markdown，从实例中获取内容
            let content = '';
            if (window.cherry) {
                content = window.cherry.getMarkdown();
                if (!(this.contentType?.startsWith('text/plain') || this.contentType?.includes('markdown'))) {
                    content = content.substring(content.indexOf('\n') + 1);
                }
            } else {
                // 兼容以前的方式，尝试从textarea获取内容
                const viewer = document.getElementById('viewer');
                if (viewer) {
                    content = viewer.value;
                }
            }

            const cacheData = {
                content,
                timestamp: getTimestamp(),
                path: this.currentPath.key,
                hash: cyrb53(content)
            };
            storage.setCache(this.CACHE_KEY + this.currentPath.key, cacheData);
            sessionStorage.setItem(this.CACHE_KEY + 'last', JSON.stringify(this.currentPath));
        } catch (e) {
            console.error('Fork处理失败:', e);
        }
        const originalEditor = getCookie('qbin-editor') || 'm';
        window.location.assign(`/${originalEditor}`);
    }

    async handleNew() {
        sessionStorage.removeItem(this.CACHE_KEY + 'last');
        const originalEditor = getCookie('qbin-editor') || 'm';
        window.location.assign(`/${originalEditor}`);
    }

    handleHome() {
        window.location.assign(`/home`);
    }

    handleCopy() {
        if (this.clickTimeout) {
            // 双击检测
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
            this.copyLink();
        } else {
            // 单击处理
            this.clickTimeout = setTimeout(() => {
                this.copyContent();
                this.clickTimeout = null;
            }, 250);
        }
    }

    async copyLink() {
        const url = window.location.href.replace("/p/", "/r/");
        ClipboardUtil.copyToClipboard(url)
            .then(result => {
                if (result.success) {
                    this.showToast('链接已复制到剪贴板', {type: 'info'});
                } else {
                    this.showToast('复制失败，请手动复制', {type: 'error'});
                    const modal = ClipboardUtil.createManualCopyUI(url);
                    document.body.appendChild(modal);
                    modal.addEventListener('manualCopy', () => {
                        this.showToast("已手动复制");
                    });
                }
            });
    }

    async copyContent() {
        let content = window.cherry.getMarkdown();
        if (!(this.contentType?.startsWith('text/plain') || this.contentType?.includes('markdown'))) {
            content = content.substring(content.indexOf('\n') + 1);
        }
        let tips = "";
        if (this.contentType.startsWith("image/")) {
            const firstImage = document.querySelector('.cherry-markdown img');
            if (!firstImage) {
                console.error('未找到图片元素');
                return;
            }
            if (!firstImage.complete) {
                await new Promise(resolve => {
                    firstImage.onload = resolve;
                });
            }
            if (navigator.clipboard && navigator.clipboard.write) {
                try {
                    // 创建可分享的文件对象
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = firstImage.naturalWidth;
                    canvas.height = firstImage.naturalHeight;
                    ctx.drawImage(firstImage, 0, 0);
                    const blob = await new Promise(resolve => {
                        canvas.toBlob(resolve, 'image/png');
                    });
                    await navigator.clipboard.write([
                        new ClipboardItem({
                            [blob.type]: blob
                        })
                    ]);
                    this.showToast('图片已复制到剪贴板', {type: 'info'});
                    return;
                } catch (err) {
                    console.warn('复制图片失败:', err);
                }
            }
            content = window.location.href.replace("/p/", "/r/");
            tips = '已复制图片直链';
        } else if (this.contentType.startsWith("text/")) {
            tips = '内容已复制到剪贴板';
        } else {
            content = window.location.href.replace('/p/', '/r/');
            tips = '直链已复制到剪贴板';
        }
        ClipboardUtil.copyToClipboard(content)
            .then(result => {
                if (result.success) {
                    this.showToast(tips, {type: 'info'});
                } else {
                    this.showToast('复制失败，请手动复制', {type: 'error'});
                    const modal = ClipboardUtil.createManualCopyUI(content);
                    document.body.appendChild(modal);
                    modal.addEventListener('manualCopy', () => {
                        this.showToast("已手动复制");
                    });
                }
            });
    }

    showToast(message, options = {}) {
        const {
            type = 'info',
            duration = 3000
        } = options;

        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.setAttribute('data-status', type);
        toast.textContent = message;

        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('visible');
            });
        });
        toast.timeoutId = setTimeout(() => {
            toast.classList.remove('visible');

            // Remove from DOM after animation completes
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
        return toast;
    }

    async handleDelete() {
        const path = `/d/${this.currentPath.key}/${this.currentPath.pwd}`;
        try {
            const response = await fetch(path, {method: 'DELETE'});
            if (response.ok) {
                await this.clearLocalCache();
                const originalEditor = getCookie('qbin-editor') || 'm';
                window.location.assign(`/${originalEditor}`);
            } else {
                const result = await response.json();
                this.showToast(result.message || '上传失败', {type: 'error'});
            }
        } catch (error) {
            this.showToast(error.message, {type: 'error'});
        }
    }

    handleDownload() {
        window.location.assign(window.location.pathname.replace('/p/', '/r/'));
    }

    async clearLocalCache() {
        await storage.removeCache(this.CACHE_KEY + this.currentPath.key);
    }

    async showQRCode() {
        try {
            const currentUrl = window.location.href;
            const existingModal = document.querySelector('.qr-modal');
            if (existingModal) {
                existingModal.remove();
            }
            const template = document.getElementById('qrModalTemplate');
            const modal = document.importNode(template.content, true).firstElementChild;
            const urlText = modal.querySelector('.url-text');
            urlText.textContent = currentUrl;
            document.body.appendChild(modal);
            const closeBtn = modal.querySelector('.qr-close');
            closeBtn.onclick = () => {
                modal.classList.add('fadeOut');
                setTimeout(() => modal.remove(), 200);
            };
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.classList.add('fadeOut');
                    setTimeout(() => modal.remove(), 200);
                }
            };
            const urlContainer = modal.querySelector('.url-container');
            const copyHint = urlContainer.querySelector('.copy-hint');
            urlContainer.onclick = async () => {
                ClipboardUtil.copyToClipboard(currentUrl)
                    .then(result => {
                        if (result.success) {
                            this.showToast("链接已复制", {type: 'info'});
                            urlContainer.classList.add('copied');
                            copyHint.textContent = '已复制';
                            this.showToast('链接已复制', {type: 'info'});
                            setTimeout(() => {
                                urlContainer.classList.remove('copied');
                                copyHint.textContent = '点击复制';
                            }, 2000);
                        } else {
                            this.showToast('复制失败，请手动复制', {type: 'error'});
                            const modal = ClipboardUtil.createManualCopyUI(currentUrl);
                            document.body.appendChild(modal);
                            modal.addEventListener('manualCopy', () => {
                                this.showToast("已手动复制");
                            });
                        }
                    });
            };

            if (typeof qrcode === 'undefined') {
                throw new Error('QR码库未加载，请稍后再试');
            }
            const qr = qrcode(0, 'M');
            qr.addData(currentUrl);
            qr.make();
            const qrImg = document.createElement('img');
            qrImg.src = qr.createDataURL(5, 4);
            qrImg.alt = 'QR Code';
            const qrcodeContent = modal.querySelector('.qrcode-content');
            qrcodeContent.appendChild(qrImg);
        } catch (error) {
            console.error('QR码生成失败:', error);
            this.showToast('QR码生成失败', {type: 'error'});
        }
    }

    showPasswordDialog(key, currentPwd = '') {
        this.hideLoading();
        this.cherryContainer.innerHTML = '';
        this.buttonBar.innerHTML = '';

        // Get the password dialog
        const passwordDialog = document.getElementById('passwordDialog');
        const passwordInput = document.getElementById('passwordInput');
        const passwordError = document.getElementById('passwordError');

        // Reset and configure
        passwordInput.value = currentPwd || '';
        passwordError.textContent = '';
        passwordError.classList.remove('visible');

        // Make it visible in the container
        passwordDialog.style.display = 'block';
        this.cherryContainer.appendChild(passwordDialog);

        // Show New button
        const newButton = this.addButton('New', this.debounce(() => this.handleNew()));
        this.buttonBar.appendChild(newButton);

        // Handle form submission
        const form = document.getElementById('passwordForm');
        form.onsubmit = async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('submitPasswordBtn');
            const submitBtnText = document.getElementById('submitBtnText');
            const submitBtnSpinner = document.getElementById('submitBtnSpinner');
            const password = passwordInput.value.trim();

            if (!password) {
                passwordError.textContent = '请输入密码';
                passwordError.classList.add('visible');
                return;
            }

            submitBtn.disabled = true;
            submitBtnText.style.visibility = 'hidden';
            submitBtnSpinner.style.display = 'block';
            passwordError.classList.remove('visible');

            try {
                // Validate password
                const validationResult = await this.validatePassword(key, password);
                if (validationResult.valid) {
                    // Success - update path and URL
                    this.currentPath.pwd = password;

                    if (history.pushState) {
                        const newUrl = `/p/${key}/${password}`;
                        history.pushState({path: newUrl}, '', newUrl);
                    }

                    // Reset dialog display
                    passwordDialog.style.display = 'none';

                    // Re-fetch content
                    this.showLoading();
                    await this.loadContent(validationResult.headResponse);
                } else {
                    // Failed validation
                    passwordError.textContent = '密码错误，请重试';
                    passwordError.classList.add('visible');
                    passwordInput.focus();
                }
            } catch (error) {
                passwordError.textContent = error.message || '验证过程中出现错误';
                passwordError.classList.add('visible');
            } finally {
                submitBtn.disabled = false;
                submitBtnText.style.visibility = 'visible';
                submitBtnSpinner.style.display = 'none';
            }
        };

        // Focus on password input
        setTimeout(() => {
            passwordInput.focus();
            if (currentPwd) {
                passwordInput.select();
            }
        }, 100);
    }

    async validatePassword(key, password) {
        const url = `/r/${key}/${password}`;
        const headResponse = await fetch(url, {method: 'HEAD'});
        return {
            valid: headResponse.ok,
            headResponse: headResponse
        };
    }

    showLoading() {
        this.cherryContainer.innerHTML = '';
        const template = document.getElementById('loadingTemplate');
        const loadingEl = document.importNode(template.content, true).firstElementChild;
        this.cherryContainer.appendChild(loadingEl);
    }

    hideLoading() {
        const loadingEls = this.cherryContainer.querySelectorAll('.loading-container');
        loadingEls.forEach(el => el.remove());
    }
}

new QBinViewer();