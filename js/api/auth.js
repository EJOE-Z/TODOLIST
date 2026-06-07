/**
 * 账号认证 API 封装（当前为本地账号；后续可接后端 /api/auth/*）
 */

/**
 * @typedef {Object} AuthResult
 * @property {boolean} success
 * @property {string} [message]
 * @property {string} [error]
 */

/**
 * 注册账号
 * @param {string} username
 * @param {string} password
 * @returns {Promise<AuthResult>}
 */
async function registerAccount(username, password) {
    return AccountManager.register(username, password);
}

/**
 * 登录
 * @param {string} username
 * @param {string} password
 * @returns {Promise<AuthResult>}
 */
async function loginAccount(username, password) {
    return AccountManager.login(username, password);
}

/**
 * 登出
 * @returns {AuthResult}
 */
function logoutAccount() {
    return AccountManager.logout();
}

/**
 * 获取当前登录用户
 * @returns {Object|null}
 */
function getCurrentAccount() {
    return UserStorage.getCurrentUser();
}

/**
 * 修改当前账号用户名
 * @param {string} newUsername
 * @returns {Promise<AuthResult>}
 */
async function updateAccountUsername(newUsername) {
    const userId = UserStorage.getActiveUserId();
    if (!userId) {
        return { success: false, error: '请先登录' };
    }
    return AccountManager.updateUsername(userId, newUsername);
}

/**
 * 修改当前账号密码
 * @param {string} oldPassword
 * @param {string} newPassword
 * @returns {Promise<AuthResult>}
 */
async function updateAccountPassword(oldPassword, newPassword) {
    const userId = UserStorage.getActiveUserId();
    if (!userId) {
        return { success: false, error: '请先登录' };
    }
    return AccountManager.updatePassword(userId, oldPassword, newPassword);
}

/**
 * 当前账号是否已设置密码
 * @returns {boolean}
 */
function currentAccountHasPassword() {
    const account = getCurrentAccount();
    return AccountManager.accountHasPassword(account);
}

const AuthApi = {
    registerAccount,
    loginAccount,
    logoutAccount,
    getCurrentAccount,
    updateAccountUsername,
    updateAccountPassword,
    currentAccountHasPassword
};
