/**
 * 按账号隔离的本地存储（所有业务数据走此模块）
 */
class UserStorage {
    /** @type {Array<string>} */
    static DATA_KEYS = [
        'tasks', 'courses', 'reminders', 'aiUserMemory', 'chatSessions',
        'timeSlots', 'firstWeekDate', 'focusHistory', 'currentChatSessionId',
        'notificationPref'
    ];

    static ACTIVE_USER_KEY = 'todo:activeUserId';
    static ACCOUNTS_KEY = 'todo:accounts';

    /**
     * 初始化：迁移旧版全局数据到默认账号
     * @returns {void}
     */
    static init() {
        if (UserStorage.getActiveUserId()) {
            return;
        }

        const accounts = UserStorage.getAccounts();
        const hasLegacy = UserStorage.DATA_KEYS.some(key => localStorage.getItem(key) !== null);

        if (accounts.length === 0 && hasLegacy) {
            const defaultAccount = AccountManager.createAccountRecord('本地用户', '');
            accounts.push(defaultAccount);
            UserStorage.saveAccounts(accounts);
            UserStorage.migrateLegacyDataToUser(defaultAccount.id);
            UserStorage.setActiveUserId(defaultAccount.id);
            return;
        }

        if (accounts.length === 1 && !accounts[0].passwordHash) {
            UserStorage.setActiveUserId(accounts[0].id);
        }
    }

    /**
     * 构建账号命名空间 key
     * @param {string} userId
     * @param {string} key
     * @returns {string}
     */
    static buildKey(userId, key) {
        return `todo:user:${userId}:${key}`;
    }

    /**
     * @returns {string|null}
     */
    static getActiveUserId() {
        return localStorage.getItem(UserStorage.ACTIVE_USER_KEY);
    }

    /**
     * @param {string|null} userId
     * @returns {void}
     */
    static setActiveUserId(userId) {
        if (userId) {
            localStorage.setItem(UserStorage.ACTIVE_USER_KEY, userId);
        } else {
            localStorage.removeItem(UserStorage.ACTIVE_USER_KEY);
        }
    }

    /**
     * @returns {Array<Object>}
     */
    static getAccounts() {
        try {
            const raw = localStorage.getItem(UserStorage.ACCOUNTS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    /**
     * @param {Array<Object>} accounts
     * @returns {void}
     */
    static saveAccounts(accounts) {
        localStorage.setItem(UserStorage.ACCOUNTS_KEY, JSON.stringify(accounts));
    }

    /**
     * 读取当前账号数据
     * @param {string} key
     * @returns {string|null}
     */
    static getItem(key) {
        const userId = UserStorage.getActiveUserId();
        if (!userId) {
            return localStorage.getItem(key);
        }
        return localStorage.getItem(UserStorage.buildKey(userId, key));
    }

    /**
     * 写入当前账号数据
     * @param {string} key
     * @param {string} value
     * @returns {void}
     */
    static setItem(key, value) {
        const userId = UserStorage.getActiveUserId();
        if (!userId) {
            localStorage.setItem(key, value);
            return;
        }
        localStorage.setItem(UserStorage.buildKey(userId, key), value);
    }

    /**
     * 删除当前账号某项数据
     * @param {string} key
     * @returns {void}
     */
    static removeItem(key) {
        const userId = UserStorage.getActiveUserId();
        if (!userId) {
            localStorage.removeItem(key);
            return;
        }
        localStorage.removeItem(UserStorage.buildKey(userId, key));
    }

    /**
     * 将旧版全局 key 迁移到指定账号
     * @param {string} userId
     * @returns {void}
     */
    static migrateLegacyDataToUser(userId) {
        UserStorage.DATA_KEYS.forEach((key) => {
            const legacy = localStorage.getItem(key);
            if (legacy !== null) {
                localStorage.setItem(UserStorage.buildKey(userId, key), legacy);
                localStorage.removeItem(key);
            }
        });
    }

    /**
     * 导出当前账号全部数据
     * @returns {Object}
     */
    static exportCurrentUserData() {
        const payload = {};
        UserStorage.DATA_KEYS.forEach((key) => {
            const raw = UserStorage.getItem(key);
            if (raw !== null) {
                try {
                    payload[key] = JSON.parse(raw);
                } catch {
                    payload[key] = raw;
                }
            }
        });
        return payload;
    }

    /**
     * 导入数据到当前账号
     * @param {Object} payload
     * @returns {void}
     */
    static importCurrentUserData(payload) {
        Object.entries(payload || {}).forEach(([key, value]) => {
            if (!UserStorage.DATA_KEYS.includes(key)) {
                return;
            }
            UserStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        });
    }

    /**
     * 获取当前登录用户信息
     * @returns {Object|null}
     */
    static getCurrentUser() {
        const userId = UserStorage.getActiveUserId();
        if (!userId) {
            return null;
        }
        return UserStorage.getAccounts().find(account => account.id === userId) || null;
    }

    /**
     * 清空当前账号全部业务数据
     * @returns {void}
     */
    static clearCurrentUserData() {
        UserStorage.DATA_KEYS.forEach((key) => {
            UserStorage.removeItem(key);
        });
    }
}
