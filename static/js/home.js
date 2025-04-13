function getStyleFromHash(input) {
    const hash = cyrb53(input);
    const styleCounts = {
        face: 16,
        nose: 14,
        mouth: 20,
        eyes: 14,
        eyebrows: 16,
        glasses: 14,
        hair: 58,
        beard: 16,
        details: 13,
        accessories: 14
    };
    function getStyleForPart(partName, maxValue) {
        const partHash = cyrb53(partName + input + hash);
        return Math.floor(partHash % maxValue);
    }
    const styleConfig = {
        face: getStyleForPart('face', styleCounts.face),
        nose: getStyleForPart('nose', styleCounts.nose),
        mouth: getStyleForPart('mouth', styleCounts.mouth),
        eyes: getStyleForPart('eyes', styleCounts.eyes),
        eyebrows: getStyleForPart('eyebrows', styleCounts.eyebrows),
        glasses: getStyleForPart('glasses', styleCounts.glasses),
        hair: getStyleForPart('hair', styleCounts.hair),
        beard: getStyleForPart('beard', styleCounts.beard),
        details: getStyleForPart('details', styleCounts.details),
        accessories: getStyleForPart('accessories', styleCounts.accessories),
        flip: 0,
        color: "rgba(255, 0, 0, 0)", // 默认颜色
        shape: "none" // 默认形状
    };
    const jsonString = JSON.stringify(styleConfig);
    const base64Encoded = btoa(jsonString);
    const url = `https://notion-avatar.app/api/svg/${base64Encoded}`;
    return url;
}

class QBinHome {
    constructor() {
        this.dataLoaded = {
            storage: false,
            shares: false
        };
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalPages = 1;
        this.currentView = 'list'; // 默认视图类型：'list', 'grid'
        this.isLoading = false;
        this.hasMoreData = true;
        this.storageItems = [];
        this.selectedItem = null;

        // 滚动相关属性
        this.scrollRAF = null; // requestAnimationFrame标识符

        // 渲染相关属性
        this.batchSize = 50; // 分批渲染的批次大小
        this.batchRenderTimer = null; // 分批渲染计时器

        // 事件监听器标记，防止重复添加
        this._hasScrollViewChangedListener = false;
        this._hasItemDelegationViewChangedListener = false;
        this._hasActionButtonViewChangedListener = false;

        // 从本地存储中恢复视图偏好
        this.loadViewPreference();
        this.initializeNavigation();
        this.initializeSettings();
        this.initializeTokenFeature();
        this.initializeLogout();
        this.initializeViewToggle();
        this.initializeInfiniteScroll();
        this.initializeContextMenu();
        this.initializeSearch();
        this.initializeUserInfo(); // 初始化用户信息
    }

    initializeNavigation() {
        const validSections = ['settings', 'shares', 'storage', 'editors'];
        const hash = window.location.hash.substring(1);
        let defaultSection = 'editors';
        if (hash && validSections.includes(hash)) {
            defaultSection = hash;
            if (hash === 'storage' && !this.dataLoaded.storage) {
                this.loadStorageData();
            } else if (hash === 'shares' && !this.dataLoaded.shares) {
                // this.loadShareData();
            }
        }
        this.showSection(defaultSection);

        // 更新导航链接的活动状态
        const links = document.querySelectorAll('.sidebar nav a');
        links.forEach(link => {
            const linkTargetId = link.getAttribute('href').substring(1);
            if (linkTargetId === defaultSection) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }

            // 添加点击事件监听器
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                if (targetId === '') return;

                // 更新URL hash，不触发页面刷新
                window.history.pushState(null, '', `#${targetId}`);

                // 加载数据（如果需要）
                if (targetId === 'storage' && !this.dataLoaded.storage) {
                    this.loadStorageData();
                } else if (targetId === 'shares' && !this.dataLoaded.shares) {
                    // this.loadShareData();
                }

                // 显示选定的部分
                this.showSection(targetId);

                // 更新导航链接的活动状态
                links.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });

        // 监听hash变化事件，处理浏览器前进/后退按钮
        window.addEventListener('hashchange', () => {
            const newHash = window.location.hash.substring(1);
            if (newHash && validSections.includes(newHash)) {
                // 显示对应部分
                this.showSection(newHash);

                // 更新导航链接的活动状态
                links.forEach(link => {
                    const linkTargetId = link.getAttribute('href').substring(1);
                    if (linkTargetId === newHash) {
                        link.classList.add('active');
                    } else {
                        link.classList.remove('active');
                    }
                });

                // 加载数据（如果需要）
                if (newHash === 'storage' && !this.dataLoaded.storage) {
                    this.loadStorageData();
                } else if (newHash === 'shares' && !this.dataLoaded.shares) {
                    // this.loadShareData();
                }
            }
        });
    }

    showSection(sectionId) {
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionId).classList.add('active');
    }

    initializeViewToggle() {
        // 视图切换按钮事件监听
        const listViewBtn = document.getElementById('list-view-btn');
        const gridViewBtn = document.getElementById('grid-view-btn');

        // 简化事件监听器的添加
        if (listViewBtn) {
            // 移除所有旧的点击事件监听器
            const newListViewBtn = listViewBtn.cloneNode(true);
            listViewBtn.parentNode.replaceChild(newListViewBtn, listViewBtn);

            // 添加新的事件监听器
            newListViewBtn.addEventListener('click', () => {
                this.switchView('list');
            });
        }

        if (gridViewBtn) {
            // 移除所有旧的点击事件监听器
            const newGridViewBtn = gridViewBtn.cloneNode(true);
            gridViewBtn.parentNode.replaceChild(newGridViewBtn, gridViewBtn);

            // 添加新的事件监听器
            newGridViewBtn.addEventListener('click', () => {
                this.switchView('grid');
            });
        }
    }

    initializeInfiniteScroll() {
        // 为列表视图和网格视图分别添加滚动监听器
        this.addScrollListenerToView('list');
        this.addScrollListenerToView('grid');

        // 使用一个标记来确保只添加一次事件监听器
        if (!this._hasScrollViewChangedListener) {
            // 在视图切换时重新添加滚动监听器
            document.addEventListener('viewChanged', (event) => {
                this.addScrollListenerToView(event.detail.view);
            });
            this._hasScrollViewChangedListener = true;
        }
    }

    scrollHandlers = {
        list: null,
        grid: null
    };

    addScrollListenerToView(viewType) {
        // 为指定视图的滚动容器添加滚动监听器
        // 使用requestAnimationFrame确保在浏览器空闲时添加监听器
        requestAnimationFrame(() => {
            // 根据视图类型选择正确的滚动容器
            let scrollContainer;

            if (viewType === 'list') {
                scrollContainer = document.querySelector(`#${viewType}-view .storage-list`);
            } else if (viewType === 'grid') {
                scrollContainer = document.querySelector(`#${viewType}-view .grid-container`);
            }

            if (scrollContainer) {
                // 检查容器是否已经有滚动监听器
                if (!scrollContainer.hasScrollListener) {
                    // 创建新的处理函数并保存引用
                    // 使用passive选项提高滚动性能
                    const scrollHandler = (event) => {
                        // 使用requestAnimationFrame来防止滚动时过多的处理
                        if (!this.scrollRAF) {
                            this.scrollRAF = requestAnimationFrame(() => {
                                this.handleScroll(event, scrollContainer);
                                this.scrollRAF = null;
                            });
                        }
                    };

                    // 添加新的监听器，使用passive选项提高滚动性能
                    scrollContainer.addEventListener('scroll', scrollHandler, { passive: true });

                    // 保存处理函数引用，以便在需要时可以移除
                    this.scrollHandlers[viewType] = scrollHandler;

                    // 标记容器已添加滚动监听器
                    scrollContainer.hasScrollListener = true;
                }

                // 初始检查是否需要加载更多数据
                if (this.hasMoreData && !this.isLoading) {
                    // 延迟检查，等待视图完全渲染
                    setTimeout(() => {
                        this.handleScroll(null, scrollContainer);
                    }, 200);
                }
            }
        });
    }

    initializeContextMenu() {
        // 初始化右键菜单
        const contextMenu = document.getElementById('context-menu');
        const menuView = document.getElementById('menu-view');
        const menuCopyLink = document.getElementById('menu-copy-link');
        const menuDelete = document.getElementById('menu-delete');

        if (!contextMenu) return;

        // 添加对action-btn的直接事件处理
        this.setupActionButtonHandlers();

        // 为列表和网格视图添加事件委托
        this.setupItemEventDelegation();

        // 点击其他地方关闭右键菜单
        document.addEventListener('click', (e) => {
            // 如果点击的不是action-btn或者菜单项，则隐藏菜单
            if (!e.target.closest('.action-btn') && !e.target.closest('.context-menu')) {
                this.hideContextMenu();
            }
        });

        // 菜单项点击事件
        if (menuView) {
            menuView.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.selectedItem) {
                    window.open(`/p/${this.selectedItem.fkey}/${this.selectedItem.pwd}`, '_blank', 'noopener');
                }
                this.hideContextMenu();
            });
        }

        if (menuCopyLink) {
            menuCopyLink.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.selectedItem) {
                    const url = `${window.location.origin}/r/${this.selectedItem.fkey}/${this.selectedItem.pwd || ''}`;

                    ClipboardUtil.copyToClipboard(url)
                      .then(result => {
                        if (result.success) {
                          this.showToast("复制成功！");
                        } else {
                          this.showToast("复制失败，请手动复制", "error");
                          const modal = ClipboardUtil.createManualCopyUI(url);
                          document.body.appendChild(modal);
                          modal.addEventListener('manualCopy', () => {
                            this.showToast("已手动复制");
                          });
                        }
                      });
                }
                this.hideContextMenu();
            });
        }

        if (menuDelete) {
            menuDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.selectedItem) {
                    this.deleteStorageItem(this.selectedItem.fkey, this.selectedItem.pwd);
                }
                this.hideContextMenu();
            });
        }
    }

    // 为列表和网格视图添加事件委托
    setupItemEventDelegation() {
        // 获取容器
        const listContainer = document.getElementById('list-items');
        const gridContainer = document.getElementById('grid-items');

        // 为列表视图添加事件委托
        if (listContainer && !listContainer.hasEventListeners) {
            // 双击打开文件
            listContainer.addEventListener('dblclick', (e) => {
                const listItem = e.target.closest('.list-item');
                if (listItem) {
                    const actionBtn = listItem.querySelector('.action-btn');
                    if (actionBtn) {
                        const fkey = actionBtn.getAttribute('data-fkey');
                        const pwd = actionBtn.getAttribute('data-pwd');
                        if (fkey) {
                            window.open(`/p/${fkey}/${pwd}`, '_blank', 'noopener');
                        }
                    }
                }
            });

            // 右键菜单
            listContainer.addEventListener('contextmenu', (e) => {
                const listItem = e.target.closest('.list-item');
                if (listItem) {
                    e.preventDefault();
                    const actionBtn = listItem.querySelector('.action-btn');
                    if (actionBtn) {
                        const fkey = actionBtn.getAttribute('data-fkey');
                        if (fkey) {
                            const item = this.storageItems.find(item => String(item.fkey) === fkey);
                            if (item) {
                                this.showContextMenu(e.clientX, e.clientY, item);
                            }
                        }
                    }
                }
            });

            // 标记容器已添加事件监听器
            listContainer.hasEventListeners = true;
        }

        // 为网格视图添加事件委托
        if (gridContainer && !gridContainer.hasEventListeners) {
            // 双击打开文件
            gridContainer.addEventListener('dblclick', (e) => {
                const gridItem = e.target.closest('.grid-item');
                if (gridItem) {
                    const fkey = gridItem.dataset.fkey;
                    const pwd = gridItem.dataset.pwd;
                    if (fkey) {
                        window.open(`/p/${fkey}/${pwd}`, '_blank', 'noopener');
                    }
                }
            });

            // 右键菜单
            gridContainer.addEventListener('contextmenu', (e) => {
                const gridItem = e.target.closest('.grid-item');
                if (gridItem) {
                    e.preventDefault();
                    const fkey = gridItem.dataset.fkey;
                    if (fkey) {
                        const item = this.storageItems.find(item => String(item.fkey) === fkey);
                        if (item) {
                            this.showContextMenu(e.clientX, e.clientY, item);
                        }
                    }
                }
            });

            // 标记容器已添加事件监听器
            gridContainer.hasEventListeners = true;
        }

        // 使用一个标记来确保只添加一次事件监听器
        if (!this._hasItemDelegationViewChangedListener) {
            // 当视图切换时重新添加事件委托
            document.addEventListener('viewChanged', () => {
                this.setupItemEventDelegation();
            });
            this._hasItemDelegationViewChangedListener = true;
        }
    }

    initializeSearch() {
        // 初始化搜索功能
        const searchInput = document.getElementById('storage-search');
        if (!searchInput) return;

        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const searchTerm = e.target.value.trim().toLowerCase();
                this.filterStorageItems(searchTerm);
            }, 300);
        });
    }

    filterStorageItems(searchTerm) {
        // 根据搜索关键词过滤显示的文件
        if (!this.storageItems.length) return;

        const containerMap = {
            list: 'list-items',
            grid: 'grid-items'
        };

        const container = document.getElementById(containerMap[this.currentView]);
        if (!container) return;

        if (!searchTerm) {
            // 如果搜索框为空，显示所有文件
            if (this.currentView === 'list') {
                this.renderListView(this.storageItems, container, true);
            } else {
                this.renderGridView(this.storageItems, container, true);
            }
            return;
        }

        // 过滤匹配的文件
        const filteredItems = this.storageItems.filter(item => {
            const fileName = item.fkey.toLowerCase();
            return fileName.includes(searchTerm);
        });

        // 渲染过滤后的文件
        if (this.currentView === 'list') {
            this.renderListView(filteredItems, container, true);
        } else {
            this.renderGridView(filteredItems, container, true);
        }
    }

    showContextMenu(x, y, item) {
        // 显示右键菜单
        const contextMenu = document.getElementById('context-menu');
        if (!contextMenu) return;

        // 存储选中项
        this.selectedItem = item;

        // 获取滚动位置
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        // 先设置可见性为隐藏，但添加可见类，以便测量尺寸
        contextMenu.style.visibility = 'hidden';
        contextMenu.classList.add('visible');

        // 等待一帧以确保样式已应用
        setTimeout(() => {
            // 获取菜单尺寸
            const menuWidth = contextMenu.offsetWidth;
            const menuHeight = contextMenu.offsetHeight;

            // 设置菜单位置，考虑滚动位置
            // 将视口坐标转换为页面坐标
            let posX = x + scrollX;
            let posY = y + scrollY;

            // 确保菜单不超出屏幕边界
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // 调整菜单位置以防止超出屏幕
            if (x + menuWidth > viewportWidth) {
                posX = scrollX + x - menuWidth;
            }

            if (y + menuHeight > viewportHeight) {
                posY = scrollY + y - menuHeight;
            }

            // 设置最终位置
            contextMenu.style.left = `${posX}px`;
            contextMenu.style.top = `${posY}px`;

            // 显示菜单
            contextMenu.style.visibility = 'visible';
        }, 0);
    }

    hideContextMenu() {
        // 隐藏右键菜单
        const contextMenu = document.getElementById('context-menu');
        if (contextMenu) {
            contextMenu.classList.remove('visible');
        }
    }

    setupActionButtonHandlers() {
        // 为列表视图和网格视图中的action-btn添加事件处理
        const listContainer = document.getElementById('list-items');
        const gridContainer = document.getElementById('grid-items');

        // 为列表视图中的按钮添加事件委托
        if (listContainer && !listContainer.hasActionButtonHandlers) {
            listContainer.addEventListener('click', (e) => {
                this.handleActionButtonClick(e);
            });
            listContainer.hasActionButtonHandlers = true;
        }

        // 为网格视图中的按钮添加事件委托
        if (gridContainer && !gridContainer.hasActionButtonHandlers) {
            gridContainer.addEventListener('click', (e) => {
                this.handleActionButtonClick(e);
            });
            gridContainer.hasActionButtonHandlers = true;
        }

        // 使用一个标记来确保只添加一次事件监听器
        if (!this._hasActionButtonViewChangedListener) {
            // 当视图切换时重新添加事件处理
            document.addEventListener('viewChanged', () => {
                this.setupActionButtonHandlers();
            });
            this._hasActionButtonViewChangedListener = true;
        }
    }

    handleActionButtonClick(e) {
        const actionBtn = e.target.closest('.action-btn');
        if (actionBtn) {
            e.stopPropagation(); // 阻止事件冒泡，防止触发其他点击事件

            // 获取按钮位置信息
            const rect = actionBtn.getBoundingClientRect();
            const x = rect.left;
            const y = rect.bottom;

            // 获取文件信息
            const fkey = actionBtn.getAttribute('data-fkey');
            const pwd = actionBtn.getAttribute('data-pwd');

            // 找到对应的文件项
            const item = this.storageItems.find(item => String(item.fkey) === fkey);
            if (item) {
                this.showContextMenu(x, y, item);
            } else {
                console.error('Could not find item with fkey:', fkey);
                // 如果找不到对应的文件项，尝试使用按钮上的数据创建一个临时项
                const tempItem = {
                    fkey: fkey,
                    pwd: pwd || ''
                };
                this.showContextMenu(x, y, tempItem);
            }
        }
    }

    // 滚动节流计时器
    scrollThrottleTimer = null;

    // 最后一次滚动处理时间
    lastScrollTime = 0;

    handleScroll(event, scrollContainer) {
        // 如果当前不在存储管理页面，则不处理
        if (!document.getElementById('storage').classList.contains('active')) {
            return;
        }

        // 如果正在加载或没有更多数据，则不处理
        if (this.isLoading || !this.hasMoreData) {
            return;
        }

        // 节流处理，防止频繁触发
        const now = Date.now();
        if (now - this.lastScrollTime < 100) { // 至少间隔100ms
            // 如果已经有计时器，则不重新设置
            if (!this.scrollThrottleTimer) {
                this.scrollThrottleTimer = setTimeout(() => {
                    this.scrollThrottleTimer = null;
                    this.lastScrollTime = Date.now();
                    this._handleScrollImpl(scrollContainer);
                }, 100);
            }
            return;
        }

        // 更新最后处理时间
        this.lastScrollTime = now;
        // 清除之前的计时器
        if (this.scrollThrottleTimer) {
            clearTimeout(this.scrollThrottleTimer);
            this.scrollThrottleTimer = null;
        }

        // 实际处理滚动
        this._handleScrollImpl(scrollContainer);
    }

    // 实际处理滚动的内部方法
    _handleScrollImpl(scrollContainer) {
        if (!scrollContainer) {
            if (this.currentView === 'list') {
                scrollContainer = document.querySelector(`#${this.currentView}-view .storage-list`);
            } else if (this.currentView === 'grid') {
                scrollContainer = document.querySelector(`#${this.currentView}-view .grid-container`);
            }
        }
        if (!scrollContainer) return;
        const { scrollTop, clientHeight, scrollHeight } = scrollContainer;
        if (scrollHeight < 100) {
            return;
        }
        // 滚动位置 + 可见高度 >= 总高度 - 50px（留出一点空间提前加载）
        const isNearBottom = scrollTop + clientHeight > scrollHeight - 50;
        if (isNearBottom) {
            this.loadMoreData();
        }
    }

    async loadMoreData() {
        // 加载更多数据
        if (this.isLoading || !this.hasMoreData) return;

        this.isLoading = true;

        // 获取当前视图的容器
        const containerMap = {
            list: 'list-items',
            grid: 'grid-items'
        };

        const container = document.getElementById(containerMap[this.currentView]);
        if (!container) {
            this.isLoading = false;
            return;
        }

        // 显示加载中的Toast提示
        const loadingToast = this.showToast('正在加载更多数据...', 'loading', 0, 'loading-toast');

        try {
            // 发起API请求，带上分页参数
            const nextPage = this.currentPage + 1;
            const response = await fetch(`/api/user/storage?page=${nextPage}&pageSize=${this.pageSize}`, {
                credentials: 'include' // 确保发送cookie
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const result = await response.json();

            if (result.status !== 200 || !result.data) {
                throw new Error(result.message || '加载数据失败');
            }

            // 从结果中获取数据和分页信息
            const { items, pagination } = result.data;

            // 判断数据是否有效
            if (!items || items.length === 0) {
                this.hasMoreData = false;
                this.updateToast(loadingToast, '没有更多数据', 'info', 2000);
                return;
            }

            // 更新分页信息
            this.totalPages = pagination.totalPages;
            this.currentPage = nextPage;

            // 根据总页数判断是否还有更多数据
            this.hasMoreData = this.currentPage < this.totalPages;

            // 将新数据添加到存储数组
            this.storageItems = [...this.storageItems, ...items];

            // 根据当前视图类型渲染数据
            if (this.currentView === 'list') {
                this.renderListView(items, container, false);
            } else {
                this.renderGridView(items, container, false);
            }

            // 更新Toast提示为成功
            this.updateToast(loadingToast, `成功加载 ${items.length} 个数据`, 'success', 2000);

            // 如果加载到最后一页，显示提示
            if (!this.hasMoreData) {
                setTimeout(() => {
                    const totalItems = pagination.total || this.storageItems.length;
                    this.showToast(`已加载全部 ${totalItems} 个数据`, 'info', 3000);
                }, 2000);
            }
        } catch (error) {
            console.error('Failed to load more data:', error);

            // 更新Toast提示为错误
            this.updateToast(loadingToast, `加载失败: ${error.message}`, 'error', 3000);

            // 显示重试提示
            setTimeout(() => {
                this.showToast('点击重试', 'warning', 0, 'retry-toast')
                    .addEventListener('click', () => {
                        this.hideToast(document.getElementById('retry-toast'));
                        this.loadMoreData();
                    });
            }, 3000);
        } finally {
            this.isLoading = false;
        }
    }

    loadViewPreference() {
        // 从本地存储中加载视图偏好设置
        const savedView = localStorage.getItem('qbin-storage-view');
        if (savedView && ['list', 'grid'].includes(savedView)) {
            this.switchView(savedView, false); // 不显示通知
        }
    }

    // 标记是否正在切换视图
    isSwitchingView = false;
    // 视图切换锁定时间（毫秒）
    viewSwitchLockTime = 200;
    // 视图切换计时器
    viewSwitchTimer = null;

    switchView(viewType, showNotification = false) {
        // 如果当前已经是目标视图，不执行切换
        if (this.currentView === viewType) return;

        // 如果正在切换视图，直接返回，防止重复切换
        if (this.isSwitchingView) return;

        // 标记正在切换视图
        this.isSwitchingView = true;

        // 清理所有可能存在的计时器
        this.clearAllTimers();

        try {
            // 存储旧视图类型
            const oldViewType = this.currentView;
            this.currentView = viewType;

            // 更新按钮状态
            document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById(`${viewType}-view-btn`).classList.add('active');

            // 更新视图显示
            document.querySelectorAll('.storage-view').forEach(view => view.classList.remove('active'));
            document.getElementById(`${viewType}-view`).classList.add('active');

            // 保存用户偏好到本地存储
            localStorage.setItem('qbin-storage-view', viewType);

            // 显示通知
            if (showNotification) {
                const viewNames = {
                    list: '列表',
                    grid: '网格'
                };
                this.showToast(`已切换到${viewNames[viewType]}视图`);
            }

            // 如果数据已加载，则重新渲染当前数据
            if (this.dataLoaded.storage && this.storageItems.length > 0) {
                // 获取当前视图的容器
                const containerMap = {
                    list: 'list-items',
                    grid: 'grid-items'
                };

                const container = document.getElementById(containerMap[viewType]);
                if (container) {
                    // 清空容器
                    container.innerHTML = '';

                    // 使用分批渲染视图，提高性能
                    if (viewType === 'list') {
                        this.renderListView(this.storageItems, container, true);
                    } else {
                        this.renderGridView(this.storageItems, container, true);
                    }

                    // 触发视图切换事件
                    this.triggerViewChangedEvent(viewType);
                }
            } else {
                // 触发视图切换事件
                this.triggerViewChangedEvent(viewType);
            }

            // 设置一个计时器，在一定时间后解除视图切换锁定
            this.viewSwitchTimer = setTimeout(() => {
                this.isSwitchingView = false;
                this.viewSwitchTimer = null;
            }, this.viewSwitchLockTime);

        } catch (error) {
            console.error('Error switching view:', error);
            // 出错时也要重置切换状态
            this.isSwitchingView = false;
        }
    }

    // 清理所有计时器
    clearAllTimers() {
        // 清理视图切换计时器
        if (this.viewSwitchTimer) {
            clearTimeout(this.viewSwitchTimer);
            this.viewSwitchTimer = null;
        }

        // 清理批量渲染计时器
        if (this.batchRenderTimer) {
            clearTimeout(this.batchRenderTimer);
            this.batchRenderTimer = null;
        }

        // 清理滚动动画帧
        if (this.scrollRAF) {
            cancelAnimationFrame(this.scrollRAF);
            this.scrollRAF = null;
        }
    }

    // 触发视图切换事件
    triggerViewChangedEvent(viewType) {
        const viewChangedEvent = new CustomEvent('viewChanged', {
            detail: { view: viewType }
        });
        document.dispatchEvent(viewChangedEvent);
    }

    // 标记是否正在加载数据
    isLoadingData = false;

    async loadStorageData(isReset = false) {
        // 防止并发加载
        if (this.isLoadingData) return;
        this.isLoadingData = true;

        // 根据当前视图类型选择容器
        const containerMap = {
            list: 'list-items',
            grid: 'grid-items',
        };

        const container = document.getElementById(containerMap[this.currentView]);
        if (!container) {
            this.isLoadingData = false;
            return;
        }

        const loadingToast = this.showToast('正在加载数据...', 'loading', 0, 'loading-toast');

        try {
            // 发起API请求，带上分页参数
            const response = await fetch(`/api/user/storage?page=${this.currentPage}&pageSize=${this.pageSize}`, {
                credentials: 'include' // 确保发送cookie
            });
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const result = await response.json();
            if (result.status !== 200 || !result.data) {
                throw new Error(result.message || '加载数据失败');
            }
            const { items, pagination } = result.data;
            // 将数据添加到存储数组
            if (isReset) {
                this.storageItems = [...items];
            } else {
                this.storageItems = [...this.storageItems, ...items];
            }
            // 更新分页信息
            this.totalPages = pagination.totalPages;
            this.hasMoreData = this.currentPage < this.totalPages;
            // 根据当前视图类型渲染数据
            switch (this.currentView) {
                case 'list':
                    this.renderListView(items, container, isReset);
                    break;
                case 'grid':
                    this.renderGridView(items, container, isReset);
                    break;
            }

            this.dataLoaded.storage = true;

            // 更新Toast提示为成功
            this.updateToast(loadingToast, `成功加载 ${items.length} 个数据`, 'success', 2000);
        } catch (error) {
            console.error('Failed to load storage data:', error);
            container.innerHTML = `
                <div class="error-message">
                    <p>加载数据失败: ${error.message}</p>
                    <button onclick="document.querySelector('a[href=\'#storage\']').click()">重试</button>
                </div>
            `;

            // 更新Toast提示为错误
            this.updateToast(loadingToast, `加载失败: ${error.message}`, 'error', 3000);
        } finally {
            // 重置加载状态
            this.isLoadingData = false;
        }
    }

    renderListView(items, container, isReset = false) {
        if (!items || items.length === 0) {
            container.innerHTML = '<div class="empty-message">暂无数据</div>';
            return;
        }

        // 如果是重置，则清空容器
        if (isReset) {
            container.innerHTML = '';
        }

        // 清除之前的分批渲染计时器
        if (this.batchRenderTimer) {
            clearTimeout(this.batchRenderTimer);
            this.batchRenderTimer = null;
        }

        // 使用requestAnimationFrame确保在下一帧渲染
        requestAnimationFrame(() => {
            // 如果项目数量少，直接渲染
            if (items.length <= this.batchSize) {
                this._renderListItemsBatch(items, container, 0, items.length);
                return;
            }

            // 分批渲染大量项目
            this._renderListItemsBatch(items, container, 0, this.batchSize);
        });
    }

    // 分批渲染列表项目
    _renderListItemsBatch(items, container, startIndex, batchSize) {
        // 计算当前批次的结束索引
        const endIndex = Math.min(startIndex + batchSize, items.length);

        // 创建文档片段来提高性能
        const fragment = document.createDocumentFragment();

        // 预先创建模板元素，减少DOM操作
        const template = document.createElement('template');
        const btnIcon = isMobile() ? '<span style="font-size: 20px; font-weight: bold;">…</span>': '<span style="font-size: 8px; letter-spacing: 1px;">●●●</span>';

        // 渲染当前批次的项目
        for (let i = startIndex; i < endIndex; i++) {
            const item = items[i];
            const fileName = item.fkey;
            const fileIcon = this.getFileTypeIcon(item.type, 20);

            // 使用模板字符串创建元素，减少innerHTML操作
            template.innerHTML = `
                <div class="list-item">
                    <span class="file-name">
                        <span class="file-icon">${fileIcon}</span>
                        ${fileName}
                    </span>
                    <span class="file-size">${formatSize(item.len)}</span>
                    <span class="file-time">${this.formatDate(item.time)}</span>
                    <span class="file-actions">
                        <button class="action-btn" title="更多操作" data-fkey="${item.fkey}" data-pwd="${item.pwd}">
                        ${btnIcon}
                        </button>
                    </span>
                </div>
            `;

            // 获取创建的元素
            const listItem = template.content.firstElementChild.cloneNode(true);

            // 使用事件委托减少事件监听器数量
            // 添加数据属性以便于委托处理
            listItem.dataset.fkey = fileName;
            listItem.dataset.pwd = item.pwd || '';

            // 添加到文档片段
            fragment.appendChild(listItem);
        }

        // 添加到容器
        container.appendChild(fragment);

        // 立即显示所有项目
        const newItems = container.querySelectorAll('.list-item:not(.visible)');
        newItems.forEach(item => {
            item.classList.add('visible');
        });

        // 如果还有更多项目需要渲染，使用requestAnimationFrame安排下一批
        if (endIndex < items.length) {
            this.batchRenderTimer = setTimeout(() => {
                requestAnimationFrame(() => {
                    this._renderListItemsBatch(items, container, endIndex, this.batchSize);
                });
            }, 20); // 增加延迟，给浏览器更多时间处理当前批次
        }
    }

    renderGridView(items, container, isReset = false) {
        if (!items || items.length === 0) {
            container.innerHTML = '<div class="empty-message">暂无数据</div>';
            return;
        }

        // 如果是重置，则清空容器
        if (isReset) {
            container.innerHTML = '';
        }

        // 清除之前的分批渲染计时器
        if (this.batchRenderTimer) {
            clearTimeout(this.batchRenderTimer);
            this.batchRenderTimer = null;
        }

        // 使用requestAnimationFrame确保在下一帧渲染
        requestAnimationFrame(() => {
            // 如果项目数量少，直接渲染
            if (items.length <= this.batchSize) {
                this._renderGridItemsBatch(items, container, 0, items.length);
                return;
            }

            // 分批渲染大量项目
            this._renderGridItemsBatch(items, container, 0, this.batchSize);
        });
    }

    // 分批渲染网格项目
    _renderGridItemsBatch(items, container, startIndex, batchSize) {
        // 计算当前批次的结束索引
        const endIndex = Math.min(startIndex + batchSize, items.length);

        // 创建文档片段来提高性能
        const fragment = document.createDocumentFragment();

        // 预先创建模板元素，减少DOM操作
        const template = document.createElement('template');
        const btnIcon = isMobile() ? '<span style="font-size: 20px; font-weight: bold;">…</span>': '<span style="font-size: 8px; letter-spacing: 1px;">●●●</span>';

        // 渲染当前批次的项目
        for (let i = startIndex; i < endIndex; i++) {
            const item = items[i];
            const fileName = item.fkey;
            const fileIcon = this.getFileTypeIcon(item.type, 32);

            // 使用模板字符串创建元素
            template.innerHTML = `
                <div class="grid-item">
                    <button class="action-btn grid-action-btn" title="更多操作" data-fkey="${item.fkey}" data-pwd="${item.pwd || ''}">
                        ${btnIcon}
                    </button>
                    <div class="file-icon">${fileIcon}</div>
                    <div class="file-name">${fileName}</div>
                    <div class="file-meta">${formatSize(item.len)}</div>
                </div>
            `;

            // 获取创建的元素
            const gridItem = template.content.firstElementChild.cloneNode(true);

            // 使用事件委托减少事件监听器数量
            // 添加数据属性以便于委托处理
            gridItem.dataset.fkey = fileName;
            gridItem.dataset.pwd = item.pwd || '';

            // 添加到文档片段
            fragment.appendChild(gridItem);
        }

        // 添加到容器
        container.appendChild(fragment);

        // 立即显示所有项目
        const newItems = container.querySelectorAll('.grid-item:not(.visible)');
        newItems.forEach(item => {
            item.classList.add('visible');
        });

        // 如果还有更多项目需要渲染，使用requestAnimationFrame安排下一批
        if (endIndex < items.length) {
            this.batchRenderTimer = setTimeout(() => {
                requestAnimationFrame(() => {
                    this._renderGridItemsBatch(items, container, endIndex, this.batchSize);
                });
            }, 20); // 增加延迟，给浏览器更多时间处理当前批次
        }
    }

    getFileTypeIcon(mimeType, size=16) {
        if (!mimeType) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
        }

        // 文本类型
        if (mimeType.startsWith('text/')) {
            if (['/html', '/javascript', '/css',  'text/x-'].some(prefix => mimeType.includes(prefix))) {
                return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
            }
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>`;
        }

        // 图片类型
        if (mimeType.startsWith('image/')) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
        }

        // 视频类型
        if (mimeType.startsWith('video/')) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
        }

        // 音频类型
        if (mimeType.startsWith('audio/')) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
        }

        // 压缩文件
        if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('gzip') || mimeType.includes('compressed')) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;
        }

        // 默认图标
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
    }

    async deleteStorageItem(fkey, pwd) {
        if (!fkey) return;
        if (!confirm('确定要永久删除该数据吗？')) {
            return;
        }
        try {
            const response = await fetch(`/d/${fkey}/${pwd}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const result = await response.json();
            if (result.status === 200) {
                storage.removeCache("qbin/" + fkey);
                // 从本地数据中移除被删除的项
                const itemIndex = this.storageItems.findIndex(item => String(item.fkey) === String(fkey));
                if (itemIndex !== -1) {
                    // 从数组中移除该项
                    this.storageItems.splice(itemIndex, 1);

                    // 获取当前视图的容器
                    const containerMap = {
                        list: 'list-items',
                        grid: 'grid-items'
                    };

                    const container = document.getElementById(containerMap[this.currentView]);
                    if (container) {
                        // 优化方案1: 快速直接地删除对应的DOM元素，避免整个视图重渲染
                        if (this.currentView === 'list') {
                            const itemToRemove = container.querySelector(`.list-item[data-fkey="${fkey}"]`);
                            if (itemToRemove) {
                                // 添加淡出动画
                                itemToRemove.classList.add('deleting');
                                // 等待动画完成后删除DOM元素
                                setTimeout(() => {
                                    container.removeChild(itemToRemove);
                                    // 检查是否需要显示空状态
                                    if (this.storageItems.length === 0) {
                                        container.innerHTML = '<div class="empty-message">暂无数据</div>';
                                    }
                                }, 300);
                            } else {
                                // 如果找不到元素（极少情况），则重新渲染整个视图
                                container.innerHTML = ''; // 完全清空容器
                                this.renderListView(this.storageItems, container, true);
                            }
                        } else { // grid view
                            const itemToRemove = container.querySelector(`.grid-item[data-fkey="${fkey}"]`);
                            if (itemToRemove) {
                                // 添加淡出动画
                                itemToRemove.classList.add('deleting');
                                // 等待动画完成后删除DOM元素
                                setTimeout(() => {
                                    container.removeChild(itemToRemove);
                                    // 检查是否需要显示空状态
                                    if (this.storageItems.length === 0) {
                                        container.innerHTML = '<div class="empty-message">暂无数据</div>';
                                    }
                                }, 300);
                            } else {
                                // 如果找不到元素（极少情况），则重新渲染整个视图
                                container.innerHTML = ''; // 完全清空容器
                                this.renderGridView(this.storageItems, container, true);
                            }
                        }
                    }
                }

                this.showToast('删除成功');
            } else {
                throw new Error(result.message || '删除失败');
            }
        } catch (error) {
            console.error('Failed to delete item:', error);
            this.showToast(`删除失败: ${error.message}`, 'error');
        }
    }

    initializeSettings() {
        const editorRadios = document.querySelectorAll('input[name="qbin-editor"]');
        const themeRadios = document.querySelectorAll('input[name="qbin-theme"]');

        // 设置默认编辑器选择
        const savedEditor = getCookie('qbin-editor') || 'm';
        document.querySelector(`input[name="qbin-editor"][value="${savedEditor}"]`).checked = true;
        this.updateEditorRadioVisualFeedback(savedEditor);

        // 设置默认主题选择
        const savedTheme = localStorage.getItem('qbin-theme') || 'system';
        document.querySelector(`input[name="qbin-theme"][value="${savedTheme}"]`).checked = true;

        // 确保主题设置已应用
        this.applyTheme(savedTheme);

        // 编辑器选择器变更监听
        editorRadios.forEach(radio => {
            radio.addEventListener('change', async (e) => {
                if (e.target.checked) {
                    const selectedEditor = e.target.value;
                    // 添加点击反馈动画
                    const label = e.target.nextElementSibling;
                    label.classList.add('radio-clicked');
                    setTimeout(() => {
                        label.classList.remove('radio-clicked');
                    }, 300);

                    document.cookie = `qbin-editor=${selectedEditor}; path=/; max-age=31536000; SameSite=Lax`;
                    storage.setCache('qbin-editor', selectedEditor, -1).catch(error => {});
                    // 更新视觉反馈
                    this.updateEditorRadioVisualFeedback(selectedEditor);
                    // 显示成功提示
                    this.showToast(`${selectedEditor === 'e' ? '通用编辑器' : selectedEditor === 'm' ? 'Markdown编辑器' : '代码编辑器'}已设置`);
                }
            });
        });

        // 主题变更监听
        themeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const themeValue = e.target.value;
                    localStorage.setItem('qbin-theme', themeValue);
                    this.applyTheme(themeValue);
                    this.showToast(`已切换到${themeValue === 'light' ? '浅色' : themeValue === 'dark' ? '深色' : '系统'}主题`);

                    // 添加点击反馈动画
                    const label = e.target.nextElementSibling;
                    label.classList.add('radio-clicked');
                    setTimeout(() => {
                        label.classList.remove('radio-clicked');
                    }, 300);
                }
            });
        });

        // 初始化时设置视觉反馈
        this.updateThemeRadioVisualFeedback(savedTheme);
    }

    // 应用主题方法
    applyTheme(themeValue) {
        document.documentElement.classList.add('theme-transition');
        document.documentElement.classList.remove('light-theme', 'dark-theme');
        if (themeValue === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
                document.documentElement.classList.add('dark-theme');
            } else {
                document.documentElement.classList.add('light-theme');
            }
            this.setupSystemThemeListener();
        } else {
            document.documentElement.classList.add(themeValue === 'dark' ? 'dark-theme' : 'light-theme');
        }

        // 添加视觉反馈
        this.updateThemeRadioVisualFeedback(themeValue);

        // 移除过渡类，防止影响其他操作
        setTimeout(() => {
            document.documentElement.classList.remove('theme-transition');
        }, 300);
    }

    // 设置系统主题变化监听
    setupSystemThemeListener() {
        if (!this.systemThemeListenerSet) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

            const handleThemeChange = (e) => {
                if (localStorage.getItem('qbin-theme') === 'system') {
                    // 添加过渡效果
                    document.documentElement.classList.add('theme-transition');
                    document.documentElement.classList.remove('light-theme', 'dark-theme');
                    document.documentElement.classList.add(e.matches ? 'dark-theme' : 'light-theme');

                    // 移除过渡类
                    setTimeout(() => {
                        document.documentElement.classList.remove('theme-transition');
                    }, 300);
                }
            };

            // 添加事件监听器
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleThemeChange);
            } else if (mediaQuery.addListener) {
                // 兼容旧版本浏览器
                mediaQuery.addListener(handleThemeChange);
            }

            this.systemThemeListenerSet = true;
        }
    }

    formatDate(timestamp) {
        if (!timestamp) return 'Never';
        return new Date(timestamp * 1000).toLocaleString();
    }

    // 更新选择器的视觉反馈
    updateRadioVisualFeedback(name, value, activeClass) {
        // 先移除所有选项的活跃状态
        document.querySelectorAll(`input[name="${name}"] + .radio-label`).forEach(label => {
            label.classList.remove(activeClass);
        });

        // 给当前选中的选项添加活跃状态
        const selectedRadio = document.querySelector(`input[name="${name}"][value="${value}"]`);
        if (selectedRadio) {
            const label = selectedRadio.nextElementSibling;
            label.classList.add(activeClass);
        }
    }

    // 更新主题选择器的视觉反馈
    updateThemeRadioVisualFeedback(themeValue) {
        this.updateRadioVisualFeedback('qbin-theme', themeValue, 'active-theme');
    }

    // 更新编辑器选择器的视觉反馈
    updateEditorRadioVisualFeedback(editorValue) {
        this.updateRadioVisualFeedback('qbin-editor', editorValue, 'active-editor');
    }

    initializeTokenFeature() {
        const generateBtn = document.getElementById('generate-token-btn');
        const copyBtn = document.getElementById('copy-token-btn');
        const tokenInput = document.getElementById('token-input');

        if (generateBtn) {
            generateBtn.addEventListener('click', async () => {
                try {
                    generateBtn.disabled = true;
                    generateBtn.classList.add('loading');
                    generateBtn.textContent = '生成中...';

                    const response = await fetch('/api/user/token', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        credentials: 'include'
                    });
                    if (!response.ok) {
                        throw new Error(await this.getErrorMessage(response));
                    }

                    const data = await response.json();
                    if ("token" in data.data) {
                        tokenInput.value = data.data.token;
                        copyBtn.disabled = false;
                        this.showToast('Token已生成，请妥善保存', 'success');
                    } else {
                        throw new Error('服务器返回的数据中没有Token');
                    }
                } catch (error) {
                    console.error('Token generation failed:', error);
                    this.showToast(error.message, 'error');
                } finally {
                    // Restore button state
                    generateBtn.disabled = false;
                    generateBtn.classList.remove('loading');
                    generateBtn.textContent = '生成Token';
                }
            });
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                if (!tokenInput.value) return;

                tokenInput.select();
                document.execCommand('copy');
                window.getSelection().removeAllRanges();
                this.showToast('Token已复制到剪贴板', 'success');
                copyBtn.classList.add('active');
                setTimeout(() => copyBtn.classList.remove('active'), 1000);
            });
        }
    }

    async getErrorMessage(response) {
        try {
            const data = await response.json();
            return data.message || `请求失败 (${response.status})`;
        } catch (e) {
            return `请求失败 (${response.status})`;
        }
    }

    initializeLogout() {
        const logoutButton = document.getElementById('logout-button');
        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }
    }

    async handleLogout() {
        try {
            const response = await fetch('/api/user/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            if (response.ok || response.status === 302) {
                window.location.assign('/login');
            } else {
                console.error('Logout failed:', await response.text());
                alert('退出登录失败，请稍后再试');
            }
        } catch (error) {
            console.error('Logout error:', error);
            alert('退出登录出错，请稍后再试');
        }
    }

    showToast(message, type = 'success', duration = 3000, id = null) {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        if (id) {
            const existingToast = document.getElementById(id);
            if (existingToast) {
                // 更新已存在的toast
                existingToast.textContent = message;
                existingToast.className = `toast ${type}`;
                if (type === 'loading') {
                    existingToast.innerHTML = `${message}`;
                }
                return existingToast;
            }
        }

        // 创建新的提示元素
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        if (id) toast.id = id;

        // 如果是加载状态，不需要自动消失
        if (type === 'loading') {
            toast.innerHTML = `${message}`;
            duration = 0; // 加载状态不自动消失
        } else {
            toast.textContent = message;
        }

        // 添加到容器
        toastContainer.appendChild(toast);

        // 如果设置了持续时间，则自动消失
        if (duration > 0) {
            setTimeout(() => {
                this.hideToast(toast);
            }, duration);
        }

        return toast;
    }

    hideToast(toast) {
        if (!toast) return;

        toast.classList.add('hide');
        setTimeout(() => {
            const toastContainer = document.getElementById('toast-container');
            if (toastContainer && toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
                // 如果没有更多提示，移除容器
                if (toastContainer.children.length === 0) {
                    document.body.removeChild(toastContainer);
                }
            }
        }, 300);
    }

    updateToast(toast, message, type = 'success', duration = 3000) {
        if (!toast) return;

        toast.className = `toast ${type}`;

        if (type === 'loading') {
            toast.innerHTML = `${message}`;
            return toast;
        } else {
            toast.textContent = message;
        }

        // 如果设置了持续时间，则自动消失
        if (duration > 0) {
            setTimeout(() => {
                this.hideToast(toast);
            }, duration);
        }

        return toast;
    }

    async initializeUserInfo() {
        try {
            const response = await fetch('/api/user/info', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            const username = data.data?.name;
            const email = data.data?.email;
            this.updateUserProfile({name: username, avatar: getStyleFromHash(username), email: email});
        } catch (error) {
            console.error('Failed to load user info:', error);
            const defaultUsername = "用户名";
            this.updateUserProfile({
                name: defaultUsername,
                avatar: getStyleFromHash("Error")
            });
        }
    }

    updateUserProfile(userData) {
        const usernameElement = document.querySelector('.sidebar-footer .user-info .username');
        if (usernameElement && userData.name) {
            usernameElement.textContent = userData.name;
        }
        const avatarElement = document.querySelector('.sidebar-footer .user-avatar img');
        if (avatarElement && userData.avatar) {
            avatarElement.src = userData.avatar;
            avatarElement.onerror = function() {
                this.src = getStyleFromHash(userData.name || "Demo User");
                this.onerror = function() {
                    this.onerror = null; // 防止无限循环
                };
            };
        }
        const emailElement = document.createElement('span');
        emailElement.className = 'user-email';
        emailElement.textContent = userData.email || '';
        document.querySelector('.sidebar-footer .user-info').appendChild(emailElement);
    }
}

const qbinHome = new QBinHome();