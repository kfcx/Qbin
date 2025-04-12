const getTimestamp = () => Math.floor(Date.now() / 1000);
function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 0x85ebca77);
        h2 = Math.imul(h2 ^ ch, 0xc2b2ae3d);
    }
    h1 ^= Math.imul(h1 ^ (h2 >>> 15), 0x735a2d97);
    h2 ^= Math.imul(h2 ^ (h1 >>> 15), 0xcaf649a9);
    h1 ^= h2 >>> 16;
    h2 ^= h1 >>> 16;
    return 2097152 * (h2 >>> 0) + (h1 >>> 11);
}
function parsePath(pathname) {
    const parts = pathname.split('/').filter(Boolean);
    let result = {key: '', pwd: '', render: ''};
    if (parts.length === 0) {
        return result
    }
    if (parts[0].length === 1) {
        result.key = parts[1] || '';
        result.pwd = parts[2] || '';
        result.render = parts[0];
    } else {
        result.key = parts[0] || '';
        result.pwd = parts[1] || '';
        result.render = "";
    }
    return result;
}
function getCookie(name) {
  const cookieArr = document.cookie.split(';');
  for (let i = 0; i < cookieArr.length; i++) {
    const cookiePair = cookieArr[i].split('=');
    const cookieName = cookiePair[0].trim();
    if (cookieName === name) {
      return decodeURIComponent(cookiePair[1]);
    }
  }
  return null;
}
function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
/**
 * 移动设备检测函数
 * @returns {boolean} true: 移动设备，false: 桌面设备
 */
function isMobile() {
  if (typeof isMobile.cached === 'boolean') return isMobile.cached;
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
    return (isMobile.cached = navigator.userAgentData.mobile);
  }
  const ua = navigator.userAgent || '';
  if (/iPhone|Android.*Mobile|Mobile.*Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return (isMobile.cached = true);
  }
  if (/iPad/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua))) {
    return (isMobile.cached = true);
  }
  if (/Tablet|Android(?!.*Mobile)|Silk/i.test(ua)) {
    return (isMobile.cached = true);
  }
  if (window.matchMedia && window.matchMedia('(pointer: coarse) and (hover: none)').matches) {
    return (isMobile.cached = true);
  }
  return (isMobile.cached = false);
}
class StorageManager {
    constructor(dbName = 'qbin', version = 2) {
        this.dbName = dbName;
        this.version = version;
        this.storeName = 'qbin';
        this.db = null;
        this.indexedDB = this._getIndexedDB();
    }

    // 获取 IndexedDB 实例
    _getIndexedDB() {
        const indexedDB = window.indexedDB || window.mozIndexedDB ||
            window.webkitIndexedDB || window.msIndexedDB;

        if (!indexedDB) {
            throw new Error('当前浏览器不支持 IndexedDB');
        }
        return indexedDB;
    }

    // 统一的错误处理
    _handleError(error) {
        console.error('数据库操作错误:', error);
        throw new Error(`数据库操作失败: ${error.message}`);
    }

    // 获取事务
    _getTransaction(mode = 'readonly') {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }
        try {
            return this.db.transaction([this.storeName], mode);
        } catch (error) {
            this._handleError(error);
        }
    }

    // 初始化数据库连接
    async initialize() {
        if (this.db) return;

        try {
            return new Promise((resolve, reject) => {
                const request = this.indexedDB.open(this.dbName, this.version);

                request.onerror = () => {
                    this._handleError(request.error);
                    reject(request.error);
                };

                request.onblocked = () => {
                    const error = new Error('数据库被阻塞，可能存在其他连接');
                    this._handleError(error);
                    reject(error);
                };

                request.onsuccess = () => {
                    this.db = request.result;

                    this.db.onerror = (event) => {
                        this._handleError(event.target.error);
                    };

                    resolve();
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        const store = db.createObjectStore(this.storeName, {
                            keyPath: 'key'
                        });
                        store.createIndex('timestamp', 'timestamp', {unique: false});
                    }
                };
            });
        } catch (error) {
            this._handleError(error);
        }
    }

    // 设置缓存
    async setCache(key, value, expirationTime = 86400 * 7, maxRetries = 3) {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                await this.initialize();
                return new Promise((resolve, reject) => {
                    const transaction = this._getTransaction('readwrite');
                    const store = transaction.objectStore(this.storeName);

                    const data = {
                        key,
                        value,
                        timestamp: getTimestamp(),
                        exipre: expirationTime
                    };

                    const request = store.put(data);

                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => resolve(true);

                    // 添加事务完成的监听
                    transaction.oncomplete = () => resolve(true);
                    transaction.onerror = () => reject(transaction.error);
                });
            } catch (error) {
                retries++;
                if (retries === maxRetries) {
                    this._handleError(error);
                }
                // 等待后重试
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    // 获取缓存
    async getCache(key) {
        try {
            await this.initialize();
            return new Promise((resolve, reject) => {
                const transaction = this._getTransaction('readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(key);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    resolve(request.result ? request.result.value : null);
                };
            });
        } catch (error) {
            this._handleError(error);
        }
    }

    async removeCache(key, options = {silent: false}) {
        try {
            await this.initialize();

            // 首先检查键是否存在
            const exists = await this.getCache(key);
            if (!exists && !options.silent) {
                console.log(`Cache key '${key}' not found`)
                return ;
            }

            return new Promise((resolve, reject) => {
                const transaction = this._getTransaction('readwrite');
                const store = transaction.objectStore(this.storeName);

                const request = store.delete(key);

                request.onerror = () => {
                    reject(request.error);
                };

                transaction.oncomplete = () => {
                    resolve(true);
                };

                transaction.onerror = (event) => {
                    reject(new Error(`Failed to remove cache: ${event.target.error}`));
                };

                transaction.onabort = (event) => {
                    reject(new Error(`Transaction aborted: ${event.target.error}`));
                };
            });
        } catch (error) {
            if (!options.silent) {
                this._handleError(error);
            }
            return false;
        }
    }

    async removeCacheMultiple(keys, options = {continueOnError: true}) {
        try {
            await this.initialize();
            const results = {
                success: [],
                failed: []
            };

            for (const key of keys) {
                try {
                    await this.removeCache(key, {silent: true});
                    results.success.push(key);
                } catch (error) {
                    results.failed.push({key, error: error.message});
                    if (!options.continueOnError) {
                        throw error;
                    }
                }
            }

            return results;
        } catch (error) {
            this._handleError(error);
        }
    }

    async getAllCacheKeys(options = {
        sorted: false,
        filter: null,
        limit: null,
        offset: 0
    }) {
        try {
            await this.initialize();

            return new Promise((resolve, reject) => {
                const transaction = this._getTransaction('readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();

                request.onerror = () => reject(request.error);

                request.onsuccess = () => {
                    let results = request.result.map(item => ({
                        key: item.key,
                        timestamp: item.timestamp
                    }));

                    // 应用过滤器
                    if (options.filter && typeof options.filter === 'function') {
                        results = results.filter(options.filter);
                    }

                    // 排序
                    if (options.sorted) {
                        results.sort((a, b) => b.timestamp - a.timestamp);
                    }

                    // 应用分页
                    if (options.offset || options.limit) {
                        const start = options.offset || 0;
                        const end = options.limit ? start + options.limit : undefined;
                        results = results.slice(start, end);
                    }

                    resolve(results.map(item => item.key));
                };

                transaction.onerror = (event) => {
                    reject(new Error(`Failed to get cache keys: ${event.target.error}`));
                };
            });
        } catch (error) {
            this._handleError(error);
        }
    }

    // 获取缓存统计信息
    async getCacheStats() {
        try {
            await this.initialize();

            return new Promise((resolve, reject) => {
                const transaction = this._getTransaction('readonly');
                const store = transaction.objectStore(this.storeName);
                const countRequest = store.count();
                const sizeRequest = store.getAll();

                let count = 0;
                let totalSize = 0;
                let oldestTimestamp = getTimestamp();
                let newestTimestamp = 0;

                countRequest.onsuccess = () => {
                    count = countRequest.result;
                };

                sizeRequest.onsuccess = () => {
                    const items = sizeRequest.result;
                    totalSize = new Blob([JSON.stringify(items)]).size;

                    items.forEach(item => {
                        oldestTimestamp = Math.min(oldestTimestamp, item.timestamp);
                        newestTimestamp = Math.max(newestTimestamp, item.timestamp);
                    });

                    resolve({
                        count,
                        totalSize,
                        oldestTimestamp: count > 0 ? oldestTimestamp : null,
                        newestTimestamp: count > 0 ? newestTimestamp : null,
                        averageSize: count > 0 ? Math.round(totalSize / count) : 0
                    });
                };

                transaction.onerror = (event) => {
                    reject(new Error(`Failed to get cache stats: ${event.target.error}`));
                };
            });
        } catch (error) {
            this._handleError(error);
        }
    }

    // 清除过期缓存，添加批量处理机制
    async clearExpiredCache(batchSize = 100) {
        try {
            await this.initialize();
            const now = getTimestamp();

            return new Promise((resolve, reject) => {
                const transaction = this._getTransaction('readwrite');
                const store = transaction.objectStore(this.storeName);
                const index = store.index('timestamp');

                let processed = 0;
                const processNextBatch = () => {
                    const request = index.openCursor();
                    let count = 0;

                    request.onerror = () => reject(request.error);
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor && count < batchSize) {
                            if (now - cursor.value.timestamp > cursor.value.exipre) {
                                cursor.delete();
                                processed++;
                            }
                            count++;
                            cursor.continue();
                        } else if (count === batchSize) {
                            // 还有更多数据要处理
                            setTimeout(processNextBatch, 0);
                        } else {
                            resolve(processed);
                        }
                    };
                };

                processNextBatch();
            });
        } catch (error) {
            this._handleError(error);
        }
    }
}
const storage = new StorageManager();
const API = {
    generateKey(length = 10) {
        // 默认去掉了容易混淆的字符：oOLl,9gq,Vv,Uu,I1
        const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
        return Array.from(
            {length},
            () => chars.charAt(Math.floor(Math.random() * chars.length))
        ).join('');
    },

    async getContent(key, pwd) {
        try {
            const response = await this.fetchNet(`/r/${key}/${pwd}`);
            if (!response.ok && response.status !== 404) {
                const errorMessage = await this.handleAPIError(response);
                throw new Error(errorMessage);
            }

            const contentType = response.headers.get('Content-Type') || '';
            if (!contentType.startsWith('text/') &&
                !contentType.includes('json') &&
                !contentType.includes('javascript') &&
                !contentType.includes('xml')) {
                throw new Error('不支持的文件类型');
            }

            return {
                status: response.status,
                content: await response.text(),
                contentType
            };
        } catch (error) {
            console.error('获取数据失败:', error);
            throw error;
        }
    },

    async uploadContent(content, key, pwd = '', mimetype = 'application/octet-stream') {
        const select = document.querySelector('.expiry-select');
        try {
            const method = mimetype.includes("text/") ? 'POST' : 'PUT';
            const headers = {
                "x-expire": select.options[select.selectedIndex].value,
                "Content-Type": mimetype,
            };

            const response = await this.fetchNet(`/s/${key}/${pwd}`, {
                method,
                body: content,
                headers
            });

            if (!response.ok) {
                const errorMessage = await this.handleAPIError(response);
                throw new Error(errorMessage);
            }
            const result = await response.json();
            return result.status === 200;
        } catch (error) {
            console.error('上传失败:', error);
            throw error;
        }
    },

    async fetchNet(url, options = {}) {
        try {
            const headers = new Headers(options.headers || {});
            return await fetch(url, {
                ...options,
                headers,
                credentials: 'include'
            });
        } catch (fetchError) {
            console.warn('Fetch failed, falling back to cache:', fetchError);
            throw fetchError;
        }
    },

    async handleAPIError(response) {
        const contentType = response.headers.get('Content-Type');
        if (contentType.includes('application/json')) {
            try {
                const errorData = await response.json();
                return errorData.message || '请求失败';
            } catch (e) {
                return this.getErrorMessageByStatus(response.status);
            }
        }
        return this.getErrorMessageByStatus(response.status);
    },

    getErrorMessageByStatus(status) {
        const messages = {
            400: '请求参数错误',
            401: '未授权访问',
            403: '访问被禁止',
            404: '资源不存在',
            413: '内容太大',
            429: '请求过于频繁',
            500: '服务器错误',
            503: '服务暂时不可用'
        };
        return messages[status] || '未知错误';
    },
};
const ClipboardUtil = {
  copyToClipboard(text, options = {}) {
    const { onSuccess, onError, onFallback } = options;

    return new Promise((resolve, reject) => {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
          .then(() => {
            if (typeof onSuccess === 'function') onSuccess(text);
            resolve({ success: true, method: 'clipboardAPI', text });
          })
          .catch((error) => {
            console.warn('Clipboard API失败，使用备用方法', error);
            this._fallbackCopyToClipboard(text, { onSuccess, onError, onFallback })
              .then(resolve)
              .catch(reject);
          });
      } else {
        // 对于不支持Clipboard API的设备或非安全上下文，使用备用方法
        console.info("使用备用复制方案");
        this._fallbackCopyToClipboard(text, { onSuccess, onError, onFallback })
          .then(resolve)
          .catch(reject);
      }
    });
  },

  _fallbackCopyToClipboard(text, { onSuccess, onError, onFallback }) {
    return new Promise((resolve, reject) => {
      try {
        const textArea = document.createElement('textarea');

        // 设置文本区域的样式，使其不可见
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        textArea.style.opacity = '0';
        textArea.style.zIndex = '-1';

        // 设置文本内容
        textArea.value = text;

        // 将文本区域添加到DOM
        document.body.appendChild(textArea);

        // 选择文本
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, 99999); // 适用于移动设备

        // 尝试执行复制命令
        const successful = document.execCommand('copy');

        // 移除临时文本区域
        document.body.removeChild(textArea);

        // 根据复制操作的结果处理回调
        if (successful) {
          if (typeof onSuccess === 'function') onSuccess(text);
          resolve({ success: true, method: 'execCommand', text });
        } else {
          const error = new Error('execCommand复制失败');
          if (typeof onFallback === 'function') onFallback(text);
          if (typeof onError === 'function') onError(error, text);
          resolve({ success: false, method: 'execCommand', error, text });
        }
      } catch (error) {
        console.error('复制到剪贴板失败:', error);
        if (typeof onFallback === 'function') onFallback(text);
        if (typeof onError === 'function') onError(error, text);
        reject({ success: false, error, text });
      }
    });
  },

  createManualCopyUI(text, options = {}) {
    const config = {
      title: '手动复制',
      message: '自动复制失败，请手动复制以下内容:',
      copyButtonText: '复制',
      closeButtonText: '关闭',
      ...options
    };

    const uniqueId = 'clipboard-copy-input-' + Date.now();

    // 创建模态框元素
    const modal = document.createElement('div');
    modal.className = 'clipboard-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    modal.innerHTML = `
      <div class="clipboard-modal-content" style="
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 90%;
        width: 500px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      ">
        <h3 style="margin-top: 0; color: #333;">${config.title}</h3>
        <p>${config.message}</p>
        <div style="display: flex; margin: 15px 0;">
          <input type="text" value="${text.replace(/"/g, '&quot;')}" readonly id="${uniqueId}" style="
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px 0 0 4px;
            outline: none;
          ">
          <button class="clipboard-copy-btn" id="${uniqueId}-btn" style="
            background: #4a90e2;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 0 4px 4px 0;
            cursor: pointer;
          ">${config.copyButtonText}</button>
        </div>
        <button class="clipboard-close-btn" style="
          background: #f5f5f5;
          border: 1px solid #ddd;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          float: right;
        ">${config.closeButtonText}</button>
      </div>
    `;

    // 添加事件监听
    setTimeout(() => {
      const linkInput = document.getElementById(uniqueId);
      const copyBtn = document.getElementById(`${uniqueId}-btn`);
      const closeBtn = modal.querySelector('.clipboard-close-btn');

      if (linkInput) {
        linkInput.focus();
        linkInput.select();
      }

      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          if (linkInput) {
            linkInput.select();
            document.execCommand('copy');

            // 触发自定义事件
            modal.dispatchEvent(new CustomEvent('manualCopy', { detail: { text } }));
          }
        });
      }

      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          if (document.body.contains(modal)) {
            document.body.removeChild(modal);

            // 触发自定义事件
            modal.dispatchEvent(new CustomEvent('close'));
          }
        });
      }

      // 点击模态框外部关闭
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (document.body.contains(modal)) {
            document.body.removeChild(modal);

            // 触发自定义事件
            modal.dispatchEvent(new CustomEvent('close'));
          }
        }
      });
    }, 0);

    return modal;
  }
};
