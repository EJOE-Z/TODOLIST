/**
 * 本地账号管理（注册 / 登录 / 登出 / 切换）
 */
class AccountManager {
    /**
     * 创建账号记录对象
     * @param {string} username
     * @param {string} passwordHash
     * @returns {Object}
     */
    static createAccountRecord(username, passwordHash) {
        return {
            id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            username,
            passwordHash,
            createdAt: new Date().toISOString()
        };
    }

    /**
     * 密码哈希
     * @param {string} password
     * @returns {Promise<string>}
     */
    static async hashPassword(password) {
        const data = new TextEncoder().encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * 注册新账号
     * @param {string} username
     * @param {string} password
     * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
     */
    static async register(username, password) {
        const name = username.trim();
        if (!name) {
            return { success: false, error: '用户名不能为空' };
        }
        if (!password || password.length < 4) {
            return { success: false, error: '密码至少 4 位' };
        }

        const accounts = UserStorage.getAccounts();
        if (accounts.some(account => account.username.toLowerCase() === name.toLowerCase())) {
            return { success: false, error: '用户名已存在' };
        }

        const passwordHash = await AccountManager.hashPassword(password);
        const account = AccountManager.createAccountRecord(name, passwordHash);
        accounts.push(account);
        UserStorage.saveAccounts(accounts);
        UserStorage.setActiveUserId(account.id);
        return { success: true, message: `账号「${name}」注册成功` };
    }

    /**
     * 登录
     * @param {string} username
     * @param {string} password
     * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
     */
    static async login(username, password) {
        const name = username.trim();
        const accounts = UserStorage.getAccounts();
        const account = accounts.find(item => item.username.toLowerCase() === name.toLowerCase());
        if (!account) {
            return { success: false, error: '账号不存在' };
        }

        if (!account.passwordHash) {
            UserStorage.setActiveUserId(account.id);
            return { success: true, message: `已登录「${account.username}」` };
        }

        const passwordHash = await AccountManager.hashPassword(password);
        if (passwordHash !== account.passwordHash) {
            return { success: false, error: '密码错误' };
        }

        UserStorage.setActiveUserId(account.id);
        return { success: true, message: `欢迎回来，${account.username}` };
    }

    /**
     * 登出
     * @returns {{ success: boolean, message: string }}
     */
    static logout() {
        UserStorage.setActiveUserId(null);
        return { success: true, message: '已退出登录' };
    }

    /**
     * 切换账号
     * @param {string} userId
     * @returns {{ success: boolean, message?: string, error?: string }}
     */
    static switchAccount(userId) {
        const account = UserStorage.getAccounts().find(item => item.id === userId);
        if (!account) {
            return { success: false, error: '账号不存在' };
        }
        UserStorage.setActiveUserId(userId);
        return { success: true, message: `已切换到「${account.username}」` };
    }

    /**
     * 是否需要显示登录界面
     * @returns {boolean}
     */
    static needsAuthGate() {
        if (UserStorage.getActiveUserId()) {
            return false;
        }
        return UserStorage.getAccounts().length > 0;
    }

    /**
     * 账号是否已设置密码
     * @param {Object|null} account
     * @returns {boolean}
     */
    static accountHasPassword(account) {
        return Boolean(account?.passwordHash);
    }

    /**
     * 修改用户名
     * @param {string} userId
     * @param {string} newUsername
     * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
     */
    static async updateUsername(userId, newUsername) {
        const name = newUsername.trim();
        if (!name) {
            return { success: false, error: '用户名不能为空' };
        }

        const accounts = UserStorage.getAccounts();
        const index = accounts.findIndex(item => item.id === userId);
        if (index === -1) {
            return { success: false, error: '账号不存在' };
        }

        if (accounts.some((item, i) => i !== index && item.username.toLowerCase() === name.toLowerCase())) {
            return { success: false, error: '用户名已被占用' };
        }

        if (accounts[index].username === name) {
            return { success: false, error: '用户名未变化' };
        }

        accounts[index].username = name;
        accounts[index].updatedAt = new Date().toISOString();
        UserStorage.saveAccounts(accounts);
        return { success: true, message: `用户名已改为「${name}」` };
    }

    /**
     * 修改或首次设置密码
     * @param {string} userId
     * @param {string} oldPassword
     * @param {string} newPassword
     * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
     */
    static async updatePassword(userId, oldPassword, newPassword) {
        const accounts = UserStorage.getAccounts();
        const index = accounts.findIndex(item => item.id === userId);
        if (index === -1) {
            return { success: false, error: '账号不存在' };
        }

        const account = accounts[index];
        const hasPassword = AccountManager.accountHasPassword(account);

        if (hasPassword) {
            if (!oldPassword) {
                return { success: false, error: '请输入当前密码' };
            }
            const oldHash = await AccountManager.hashPassword(oldPassword);
            if (oldHash !== account.passwordHash) {
                return { success: false, error: '当前密码错误' };
            }
        }

        if (!newPassword || newPassword.length < 4) {
            return { success: false, error: '新密码至少 4 位' };
        }

        account.passwordHash = await AccountManager.hashPassword(newPassword);
        account.updatedAt = new Date().toISOString();
        accounts[index] = account;
        UserStorage.saveAccounts(accounts);
        return {
            success: true,
            message: hasPassword ? '密码已更新' : '密码已设置，下次登录需使用新密码'
        };
    }
}
