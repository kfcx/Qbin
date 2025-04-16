class QBinMDEditor extends QBinEditorBase {
    constructor() {
        super();
        this.currentEditor = "md";
        this.saveDebounceTimeout = null;
        this.uploadDebounceTimeout = null;
        this.passwordPanelInitialized = false;
        this.currentTheme = this.getThemePreference();
        this.initialize();
    }

    getThemePreference() {
        const savedTheme = localStorage.getItem('qbin-theme') || 'system';
        if (savedTheme === 'dark') return 'dark';
        if (savedTheme === 'light') return 'light';
        // System preference:
        return window.matchMedia('(prefers-color-scheme: dark)').matches ?
            'dark' : 'light';
    }

    toolbarsConfig(config){
        if(isMobile()){
            config.toolbar = [
                    'switchModel',
                    {
                        insert: ['image', 'audio', 'video', 'link', 'hr', 'br', 'code', 'inlineCode', 'toc', 'table', 'pdf', 'word', 'file'],
                    },
                    'search',
                ];
            config.toolbarRight = ['mySettings', 'togglePreview', 'undo', 'redo', ];
            config.sidebar = ['copy'];
            config.float = false;
            config.bubble = false;
        }else {
            config.toolbar = [
                    'switchModel',
                    'bold',
                    'italic',
                    {
                        strikethrough: ['strikethrough', 'underline', 'sub', 'sup'],
                    },
                    'size',
                    '|',
                    'color',
                    'header',
                    '|',
                    'ol',
                    'ul',
                    'checklist',
                    'panel',
                    'justify',
                    'detail',
                    '|',
                    {
                        insert: ['image', 'audio', 'video', 'link', 'hr', 'br', 'code', 'inlineCode', 'toc', 'table', 'pdf', 'word', 'file'],
                    },
                    'undo',
                    'redo',
                    'codeTheme',
                    'export',
                ];
            config.toolbarRight = ['mySettings', 'togglePreview', 'wordCount'];
            config.bubble = ['bold', 'italic', 'underline', 'strikethrough', 'sub', 'sup', 'quote', '|', 'size', 'color'];
            config.sidebar = ['mobilePreview', 'copy'];
        }
        return config
    }

    async initEditor() {
        const locale = (navigator.language || navigator.userLanguage).replace("-", "_");
        const customSettings = Cherry.createMenuHook('设置', {
            iconName: 'settings',
            onClick: () => {
                this.togglePasswordPanel(true); // 传入 true 表示是点击触发
            }
        });
        const toolbars = {
            showToolbar: true,
            toolbar: [],
            toolbarRight: [],
            bubble: [],
            sidebar: [],
            customMenu: {
                mySettings: customSettings,
            },
            toc: true,
        };

        // TODO 实现sidebar Zen模式
        const basicConfig = {
            id: 'markdown',
            nameSpace: 'qbin',
            externals: {
                echarts: window.echarts,
                katex: window.katex,
                MathJax: window.MathJax,
            },
            engine: {
                global: {
                    flowSessionContext: true,
                },
                syntax: {
                    codeBlock: {
                        theme: 'twilight',
                        lineNumber: true,
                        expandCode: true,
                        changeLang: false,
                        editCode: false,
                        wrap: false,
                    },
                    table: {
                        enableChart: true,
                    },
                    fontEmphasis: {
                        allowWhitespace: false,
                    },
                    strikethrough: {
                        needWhitespace: false,
                    },
                    mathBlock: {
                      engine: 'katex',
                    },
                    inlineMath: {
                      engine: 'katex',
                    },
                },
            },
            multipleFileSelection: {
                video: false,
                audio: false,
                image: false,
                word: false,
                pdf: false,
                file: false,
            },
            toolbars: this.toolbarsConfig(toolbars),
            previewer: {
                enablePreviewerBubble: true,
                floatWhenClosePreviewer: false,
                lazyLoadImg: {
                    maxNumPerTime: 2,
                    noLoadImgNum: 5,
                    autoLoadImgNum: 5,
                    maxTryTimesPerSrc: 2,
                }
            },
            editor: {
                id: 'qbin-text',
                name: 'qbin-text',
                autoSave2Textarea: false,
                defaultModel: 'edit&preview',
                showFullWidthMark: true,
                showSuggestList: false,
                writingStyle: 'normal',
            },
            themeSettings: {
                mainTheme: this.currentTheme,
                codeBlockTheme: 'default',
            },
            callback: {
                // onPaste: (clipboardData) => console.log(clipboardData),
                afterChange: (text, html) => {
                    this.handleContentChange(text);
                },
            },
            event: {
                changeMainTheme: (theme) => {
                    const userPreference = localStorage.getItem('qbin-theme') || 'system';
                    if (userPreference === 'system') {
                        localStorage.setItem('qbin-theme', 'system');
                    }
                    
                    // Update document classes for consistent styling
                    document.documentElement.classList.remove('light-theme', 'dark-theme');
                    document.documentElement.classList.add(theme === 'dark' ? 'dark-theme' : 'light-theme');
                }
            },
            isPreviewOnly: false,
            autoScrollByHashAfterInit: true,
            locale: locale,
        };
        const config = Object.assign({}, basicConfig, { value: "" });
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
        window.cherry = new Cherry(config);
        this.setupEditorChangeListener();
        this.initializePasswordPanel();
        this.setupThemeListener();
        return window.cherry;
    }

    getEditorContent() {
        return window.cherry.getMarkdown();
    }

    setEditorContent(content) {
        window.cherry.setMarkdown(content);
    }

    setupEditorChangeListener() {
        // 监听编辑器内容变化，用于自动保存和上传
        let saveTimeout;
        
        const contentChangeCallback = () => {
            // 保存到本地缓存
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                this.saveToLocalCache();
            }, 1000);

            // 自动上传
            clearTimeout(this.autoUploadTimer);
            this.autoUploadTimer = setTimeout(() => {
                const content = this.getEditorContent();
                if (content && cyrb53(content) !== this.lastUploadedHash) {
                    this.handleUpload(content, "text/markdown; charset=UTF-8");
                }
            }, 2000);
        };

        let lastChangeTime = 0;
        const throttleTime = 500; // 500ms节流
        
        document.addEventListener('cherry:change', () => {
            const now = Date.now();
            if (now - lastChangeTime > throttleTime) {
                lastChangeTime = now;
                contentChangeCallback();
            }
        });
    }

    handleContentChange(content) {
        // 本地缓存防抖 (1秒)
        clearTimeout(this.saveDebounceTimeout);
        this.saveDebounceTimeout = setTimeout(() => {
            this.saveToLocalCache();
        }, 1000);

        // 自动上传防抖 (3秒)
        clearTimeout(this.uploadDebounceTimeout);
        this.uploadDebounceTimeout = setTimeout(() => {
            if (content && cyrb53(content) !== this.lastUploadedHash) {
                this.handleUpload(content, "text/markdown; charset=UTF-8");
            }
        }, 3000);
    }

    initializePasswordPanel() {
        if (this.passwordPanelInitialized) return;

        const passwordPanel = document.querySelector('.password-panel');
        if (!passwordPanel) return;

        let isInputActive = false;
        let hoverTimeout = null;
        let hideTimeout = null;

        const adjustPanelPosition = (settingsBtn) => {
            const btnRect = settingsBtn.getBoundingClientRect();
            passwordPanel.style.top = (btnRect.bottom + 10) + 'px';
            const rightOffset = window.innerWidth - btnRect.right;
            passwordPanel.style.right = (rightOffset + btnRect.width/2) + 'px';
        };

        const setupPanelEvents = () => {
            const settingsBtn = document.querySelector('.cherry-toolbar-button.cherry-toolbar-settings');
            if (!settingsBtn) return false;

            // 调整面板位置
            const handleResize = () => {
                if (passwordPanel.classList.contains('active')) {
                    adjustPanelPosition(settingsBtn);
                }
            };
            window.addEventListener('resize', handleResize);

            // 设置按钮悬停事件
            settingsBtn.addEventListener('mouseenter', () => {
                if (window.innerWidth <= 768) return; // 移动端不触发悬停
                clearTimeout(hideTimeout);
                adjustPanelPosition(settingsBtn);
                hoverTimeout = setTimeout(() => {
                    passwordPanel.classList.add('active');
                }, 100);
            });

            settingsBtn.addEventListener('mouseleave', () => {
                if (window.innerWidth <= 768) return;
                clearTimeout(hoverTimeout);
                if (!isInputActive && !passwordPanel.matches(':hover')) {
                    hideTimeout = setTimeout(() => {
                        passwordPanel.classList.remove('active');
                    }, 300);
                }
            });

            // 面板悬停事件
            passwordPanel.addEventListener('mouseenter', () => {
                if (window.innerWidth <= 768) return;
                clearTimeout(hideTimeout);
            });

            passwordPanel.addEventListener('mouseleave', () => {
                if (window.innerWidth <= 768) return;
                if (!isInputActive) {
                    hideTimeout = setTimeout(() => {
                        passwordPanel.classList.remove('active');
                    }, 300);
                }
            });

            // 输入框焦点事件
            const inputs = passwordPanel.querySelectorAll('input, select');
            inputs.forEach(input => {
                input.addEventListener('focus', () => {
                    isInputActive = true;
                    clearTimeout(hideTimeout);
                });

                input.addEventListener('blur', () => {
                    isInputActive = false;
                    if (!passwordPanel.matches(':hover')) {
                        hideTimeout = setTimeout(() => {
                            passwordPanel.classList.remove('active');
                        }, 800);
                    }
                });
            });

            // 加密复选框交互
            this.initializeEncryptCheckbox();

            return true;
        };

        // 确保事件只绑定一次
        if (setupPanelEvents()) {
            this.passwordPanelInitialized = true;
        }
    }

    initializeEncryptCheckbox() {
        const checkbox = document.getElementById('encrypt-checkbox');
        const hiddenCheckbox = document.getElementById('encryptData');
        const optionToggle = document.querySelector('.option-toggle');

        if (optionToggle && checkbox && hiddenCheckbox) {
            optionToggle.addEventListener('click', () => {
                const isChecked = checkbox.classList.contains('checked');
                checkbox.classList.toggle('checked');
                hiddenCheckbox.checked = !isChecked;
            });
        }
    }

    togglePasswordPanel(isClick = false) {
        const passwordPanel = document.querySelector('.password-panel');
        if (!passwordPanel) return;
        if (isClick) {
            passwordPanel.classList.toggle('active');
        }
    }

    applyThemeBasedOnPreference() {
        const userPreference = localStorage.getItem('qbin-theme') || 'system';
        let themeToApply;
        
        if (userPreference === 'system') {
            // Apply theme based on system preference
            themeToApply = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } else {
            // Apply user's explicit choice
            themeToApply = userPreference;
        }
        
        // Let the editor handle the theme change
        if (window.cherry && window.cherry.setTheme) {
            // Store original theme value
            const originalTheme = localStorage.getItem('qbin-theme');
            
            // Apply the theme
            window.cherry.setTheme(themeToApply);
            
            // Restore "system" if that was the original preference
            if (originalTheme === 'system') {
                localStorage.setItem('qbin-theme', 'system');
            }
        }
    }

    setupThemeListener() {
        // Listen for system preference changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', () => {
            // Only react to system changes if the user preference is 'system'
            if (localStorage.getItem('qbin-theme') === 'system' || !localStorage.getItem('qbin-theme')) {
                this.applyThemeBasedOnPreference();
            }
        });

        // Listen for explicit theme changes from other tabs/windows
        window.addEventListener('storage', (event) => {
            if (event.key === 'qbin-theme') {
                this.applyThemeBasedOnPreference();
            }
        });

        // Setup the global theme toggler
        if (!window.qbinToggleTheme) {
            window.qbinToggleTheme = (theme) => {
                localStorage.setItem('qbin-theme', theme);
                this.applyThemeBasedOnPreference();
            };
        }
        
        // Apply the initial theme
        this.applyThemeBasedOnPreference();
    }
}

new QBinMDEditor();
