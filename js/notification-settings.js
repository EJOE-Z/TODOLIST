/**
 * 通知权限与应用内通知开关（按账号存储偏好）
 */
class NotificationSettings {
    static PREF_KEY = 'notificationPref';
    static DEFAULT_ICON = '/icons/icon.svg';

    /**
     * 获取浏览器通知权限状态
     * @returns {'unsupported'|'default'|'granted'|'denied'}
     */
    static getPermissionStatus() {
        if (!('Notification' in window)) {
            return 'unsupported';
        }
        return Notification.permission;
    }

    /**
     * 是否已在应用内开启通知
     * @returns {boolean}
     */
    static getUserEnabled() {
        try {
            const raw = UserStorage.getItem(NotificationSettings.PREF_KEY);
            if (!raw) {
                return false;
            }
            return JSON.parse(raw).enabled === true;
        } catch {
            return false;
        }
    }

    /**
     * 设置应用内通知开关
     * @param {boolean} enabled
     * @returns {void}
     */
    static setUserEnabled(enabled) {
        UserStorage.setItem(
            NotificationSettings.PREF_KEY,
            JSON.stringify({ enabled: Boolean(enabled) })
        );
    }

    /**
     * 浏览器已授权且用户已开启
     * @returns {boolean}
     */
    static isActive() {
        return NotificationSettings.getPermissionStatus() === 'granted'
            && NotificationSettings.getUserEnabled();
    }

    /**
     * 开启通知：必要时请求浏览器权限
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    static async enable() {
        const status = NotificationSettings.getPermissionStatus();
        if (status === 'unsupported') {
            return { success: false, error: '当前浏览器不支持系统通知' };
        }
        if (status === 'denied') {
            return {
                success: false,
                error: '通知权限已被浏览器拒绝，请在地址栏左侧站点设置中手动开启'
            };
        }
        if (status === 'default') {
            const result = await Notification.requestPermission();
            if (result !== 'granted') {
                return {
                    success: false,
                    error: result === 'denied' ? '已拒绝通知权限' : '未授予通知权限'
                };
            }
        }
        NotificationSettings.setUserEnabled(true);
        return { success: true };
    }

    /**
     * 关闭应用内通知（不撤销浏览器权限）
     * @returns {{ success: boolean }}
     */
    static disable() {
        NotificationSettings.setUserEnabled(false);
        return { success: true };
    }

    /**
     * 显示系统通知
     * @param {string} title
     * @param {string} body
     * @param {NotificationOptions} [options]
     * @returns {boolean}
     */
    static show(title, body, options = {}) {
        if (!NotificationSettings.isActive()) {
            return false;
        }
        new Notification(title, {
            body,
            icon: options.icon || NotificationSettings.DEFAULT_ICON,
            ...options
        });
        return true;
    }

    /**
     * 获取设置页展示用的状态文案
     * @returns {string}
     */
    static getStatusLabel() {
        const status = NotificationSettings.getPermissionStatus();
        if (status === 'unsupported') {
            return '当前浏览器不支持系统通知';
        }
        if (status === 'denied') {
            return '已在浏览器中拒绝，需到站点设置中手动开启';
        }
        if (status === 'default') {
            return NotificationSettings.getUserEnabled()
                ? '等待浏览器授权'
                : '尚未开启';
        }
        return NotificationSettings.getUserEnabled() ? '已开启' : '权限已授予，应用内通知已关闭';
    }
}
