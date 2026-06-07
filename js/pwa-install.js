/**
 * PWA 安装与服务 worker 注册
 */
class PwaInstall {
    /** @type {BeforeInstallPromptEvent|null} */
    static deferredPrompt = null;

    /**
     * 初始化 PWA 能力
     * @returns {void}
     */
    static init() {
        PwaInstall.registerServiceWorker();

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            PwaInstall.deferredPrompt = event;
            PwaInstall.updateInstallUi();
        });

        window.addEventListener('appinstalled', () => {
            PwaInstall.deferredPrompt = null;
            PwaInstall.updateInstallUi();
        });
    }

    /**
     * 注册 Service Worker
     * @returns {Promise<void>}
     */
    static async registerServiceWorker() {
        if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') {
            return;
        }
        try {
            await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        } catch (error) {
            console.warn('Service Worker 注册失败', error);
        }
    }

    /**
     * 是否已以 App 形式安装/打开
     * @returns {boolean}
     */
    static isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
    }

    /**
     * 检测平台类型
     * @returns {'ios'|'android'|'desktop'}
     */
    static getPlatform() {
        const ua = navigator.userAgent;
        if (/iphone|ipad|ipod/i.test(ua)) {
            return 'ios';
        }
        if (/android/i.test(ua)) {
            return 'android';
        }
        return 'desktop';
    }

    /**
     * 是否支持一键安装提示
     * @returns {boolean}
     */
    static canPromptInstall() {
        return Boolean(PwaInstall.deferredPrompt);
    }

    /**
     * 获取手动安装说明
     * @returns {string}
     */
    static getInstallInstructions() {
        const platform = PwaInstall.getPlatform();
        if (platform === 'ios') {
            return 'iPhone/iPad：请用 Safari 打开 → 底部分享 →「添加到主屏幕」';
        }
        if (platform === 'android') {
            return 'Android：Chrome 打开 → 菜单 ⋮ →「安装应用」或「添加到主屏幕」';
        }
        return '电脑：Chrome/Edge 地址栏右侧点击「安装」图标';
    }

    /**
     * 获取安装状态文案
     * @returns {string}
     */
    static getStatusLabel() {
        if (PwaInstall.isStandalone()) {
            return '已安装到主屏幕，可像 App 一样使用';
        }
        if (PwaInstall.canPromptInstall()) {
            return '可一键安装到手机/电脑';
        }
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            return '公网 HTTPS 部署后可安装到主屏幕';
        }
        return PwaInstall.getInstallInstructions();
    }

    /**
     * 触发安装或展示手动说明
     * @returns {Promise<{ success: boolean, message: string }>}
     */
    static async promptInstall() {
        if (PwaInstall.isStandalone()) {
            return { success: true, message: '当前已在 App 模式中运行' };
        }

        if (!PwaInstall.deferredPrompt) {
            return {
                success: false,
                message: PwaInstall.getInstallInstructions()
            };
        }

        PwaInstall.deferredPrompt.prompt();
        const choice = await PwaInstall.deferredPrompt.userChoice;
        PwaInstall.deferredPrompt = null;
        PwaInstall.updateInstallUi();

        if (choice.outcome === 'accepted') {
            return { success: true, message: '正在安装，请稍候…' };
        }
        return { success: false, message: '已取消安装' };
    }

    /**
     * 刷新设置页安装按钮状态
     * @returns {void}
     */
    static updateInstallUi() {
        const btn = document.getElementById('settings-install-app-btn');
        const statusEl = document.getElementById('settings-install-status');
        const hintEl = document.getElementById('settings-install-hint');

        if (statusEl) {
            statusEl.textContent = `状态：${PwaInstall.getStatusLabel()}`;
        }
        if (hintEl) {
            hintEl.textContent = PwaInstall.getInstallInstructions();
        }
        if (btn) {
            const installed = PwaInstall.isStandalone();
            btn.textContent = installed ? '已在 App 模式' : '安装到手机 / 桌面';
            btn.disabled = installed;
        }
    }
}
