/**
 * 周报生成器 - 本地统计
 */
class WeeklyReview {
    /**
     * 生成本周复盘 Markdown
     * @returns {string}
     */
    static generate() {
        const tasks = JSON.parse(UserStorage.getItem('tasks') || '[]');
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const completedThisWeek = tasks.filter(t => {
            if (!t.completed || !t.completedAt) return false;
            return new Date(t.completedAt) >= weekAgo;
        });

        const pending = tasks.filter(t => !t.completed);
        const overdue = pending.filter(t => {
            if (!t.deadline) return false;
            return ActionExecutor.daysUntil(t.deadline) !== null && ActionExecutor.daysUntil(t.deadline) < 0;
        });

        const memory = UserMemory.load();
        const focusCount = memory.habits.focusSessionCount || 0;

        const lines = [
            '📊 **本周复盘**',
            '---',
            `✅ 本周完成 **${completedThisWeek.length}** 项任务`,
            `📋 当前待办 **${pending.length}** 项`,
            `⚠️ 已过期 **${overdue.length}** 项`,
            `🍅 累计专注 **${focusCount}** 次`,
            '---'
        ];

        if (completedThisWeek.length) {
            lines.push('### 本周已完成');
            completedThisWeek.slice(-5).forEach((t, i) => lines.push(`${i + 1}. ${t.title}`));
        }

        if (overdue.length) {
            lines.push('---');
            lines.push('### 需要跟进');
            overdue.slice(0, 5).forEach((t, i) => lines.push(`${i + 1}. ${t.title}（已过期）`));
        }

        if (PlanningEngine.isExamWeek()) {
            lines.push('---');
            lines.push('💡 **本周截止任务较多**，建议说「这周怎么安排」查看计划');
        }

        lines.push('---');
        lines.push('*数据来自当前账号本地统计；联网时可让助手进一步分析。*');
        return lines.join('\n');
    }
}

/**
 * 数据同步 - 导出/导入当前账号数据
 */
class DataSync {
    static KEYS = UserStorage.DATA_KEYS;

    /**
     * 导出全部数据
     * @returns {Object}
     */
    static exportAll() {
        const user = UserStorage.getCurrentUser();
        return {
            version: 2,
            exportedAt: new Date().toISOString(),
            username: user?.username || 'unknown',
            userId: user?.id || null,
            payload: UserStorage.exportCurrentUserData()
        };
    }

    static downloadExport() {
        const data = DataSync.exportAll();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `todo-backup-${ActionExecutor.getLocalDateString(new Date())}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * @param {Object} data
     * @returns {Object}
     */
    static importAll(data) {
        if (!data?.payload) {
            return { success: false, error: '无效的备份文件' };
        }
        UserStorage.importCurrentUserData(data.payload);
        ReminderScheduler.scheduleAll();
        ReminderManager.syncToServiceWorker();
        return { success: true, message: '数据导入成功，建议刷新页面' };
    }
}

/**
 * 设置管理器
 */
class SettingsManager {
    constructor() {
        this.modal = document.getElementById('settings-modal');
        this.authModal = document.getElementById('auth-modal');
        this.profileModal = document.getElementById('profile-modal');
        this.authMode = 'login';
        this.authGateActive = false;
        this.init();
    }

    init() {
        document.getElementById('close-settings-modal')?.addEventListener('click', () => this.close());
        document.getElementById('settings-export-btn')?.addEventListener('click', () => DataSync.downloadExport());
        document.getElementById('settings-import-input')?.addEventListener('change', (e) => this.handleImport(e));
        document.getElementById('settings-clear-memory-btn')?.addEventListener('click', () => this.clearMemory());
        document.getElementById('settings-clear-account-btn')?.addEventListener('click', () => this.clearAccountData());
        document.getElementById('settings-logout-btn')?.addEventListener('click', () => this.handleLogout());
        document.getElementById('settings-notification-toggle')?.addEventListener('change', (e) => {
            this.handleNotificationToggle(e);
        });
        document.getElementById('settings-install-app-btn')?.addEventListener('click', () => this.handleInstallApp());
        document.getElementById('settings-switch-account-btn')?.addEventListener('click', () => this.openAuth('login'));
        document.getElementById('settings-edit-profile-btn')?.addEventListener('click', () => this.openProfile());
        document.getElementById('voice-input-btn')?.addEventListener('click', () => this.startVoiceInput());

        document.getElementById('close-profile-modal')?.addEventListener('click', () => this.closeProfile());
        document.getElementById('profile-save-username-btn')?.addEventListener('click', () => this.saveProfileUsername());
        document.getElementById('profile-save-password-btn')?.addEventListener('click', () => this.saveProfilePassword());
        document.getElementById('profile-confirm-password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.saveProfilePassword();
            }
        });

        document.getElementById('close-auth-modal')?.addEventListener('click', () => this.closeAuth());
        document.getElementById('auth-submit-btn')?.addEventListener('click', () => this.submitAuth());
        document.getElementById('auth-toggle-mode')?.addEventListener('click', () => {
            this.authMode = this.authMode === 'login' ? 'register' : 'login';
            this.renderAuthMode();
        });
        document.getElementById('auth-password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.submitAuth();
            }
        });

        this.renderAccountInfo();
    }

    /**
     * 渲染当前账号信息
     * @returns {void}
     */
    renderAccountInfo() {
        const userEl = document.getElementById('settings-current-user');
        const headerUserEl = document.getElementById('header-current-user');
        const logoutBtn = document.getElementById('settings-logout-btn');
        const editProfileBtn = document.getElementById('settings-edit-profile-btn');
        const user = AuthApi.getCurrentAccount();
        if (userEl) {
            userEl.textContent = user ? user.username : '未登录';
        }
        if (headerUserEl) {
            if (user) {
                headerUserEl.textContent = user.username;
                headerUserEl.title = `当前账号：${user.username}`;
                headerUserEl.classList.remove('hidden');
            } else {
                headerUserEl.classList.add('hidden');
            }
        }
        if (logoutBtn) {
            logoutBtn.classList.toggle('hidden', !user);
        }
        if (editProfileBtn) {
            editProfileBtn.classList.toggle('hidden', !user);
        }
    }

    open() {
        this.renderAccountInfo();
        this.renderNotificationSettings();
        if (typeof PwaInstall !== 'undefined') {
            PwaInstall.updateInstallUi();
        }
        this.modal?.classList.remove('hidden');
    }

    close() {
        this.modal?.classList.add('hidden');
    }

    /**
     * 打开登录/注册弹窗
     * @param {'login'|'register'} mode
     * @returns {void}
     */
    openAuth(mode = 'login', options = {}) {
        this.authMode = mode;
        this.authGateActive = Boolean(options.gate);
        this.renderAuthMode();
        this.authModal?.classList.remove('hidden');
    }

    closeAuth() {
        if (this.authGateActive) {
            return;
        }
        this.authModal?.classList.add('hidden');
    }

    /**
     * 渲染登录/注册模式
     * @returns {void}
     */
    renderAuthMode() {
        const title = document.getElementById('auth-modal-title');
        const submitBtn = document.getElementById('auth-submit-btn');
        const toggleBtn = document.getElementById('auth-toggle-mode');
        const closeBtn = document.getElementById('close-auth-modal');
        const isLogin = this.authMode === 'login';

        if (title) title.textContent = isLogin ? '登录账号' : '注册账号';
        if (submitBtn) submitBtn.textContent = isLogin ? '登录' : '注册';
        if (toggleBtn) {
            toggleBtn.textContent = isLogin ? '没有账号？去注册' : '已有账号？去登录';
        }
        if (closeBtn) {
            closeBtn.classList.toggle('hidden', this.authGateActive);
        }
    }

    /**
     * 提交登录/注册
     * @returns {Promise<void>}
     */
    async submitAuth() {
        const username = document.getElementById('auth-username')?.value?.trim() || '';
        const password = document.getElementById('auth-password')?.value || '';
        const result = this.authMode === 'login'
            ? await AuthApi.loginAccount(username, password)
            : await AuthApi.registerAccount(username, password);

        if (!result.success) {
            alert(result.error || '操作失败');
            return;
        }

        this.closeAuth();
        location.reload();
    }

    /**
     * 登出
     * @returns {void}
     */
    handleLogout() {
        if (!confirm('退出后需重新登录才能查看该账号数据，确定退出？')) {
            return;
        }
        AuthApi.logoutAccount();
        location.reload();
    }

    /**
     * 打开账号资料编辑弹窗
     * @returns {void}
     */
    openProfile() {
        const user = AuthApi.getCurrentAccount();
        if (!user) {
            alert('请先登录');
            return;
        }

        const usernameInput = document.getElementById('profile-username');
        const oldPasswordWrap = document.getElementById('profile-old-password-wrap');
        const oldPasswordInput = document.getElementById('profile-old-password');
        const newPasswordInput = document.getElementById('profile-new-password');
        const confirmPasswordInput = document.getElementById('profile-confirm-password');
        const hintEl = document.getElementById('profile-password-hint');
        const hasPassword = AuthApi.currentAccountHasPassword();

        if (usernameInput) {
            usernameInput.value = user.username;
        }
        if (oldPasswordInput) {
            oldPasswordInput.value = '';
        }
        if (newPasswordInput) {
            newPasswordInput.value = '';
        }
        if (confirmPasswordInput) {
            confirmPasswordInput.value = '';
        }
        if (oldPasswordWrap) {
            oldPasswordWrap.classList.toggle('hidden', !hasPassword);
        }
        if (hintEl) {
            hintEl.textContent = hasPassword
                ? '修改密码需验证当前密码'
                : '当前账号尚未设置密码，可直接设置新密码';
        }

        this.profileModal?.classList.remove('hidden');
    }

    /**
     * 关闭账号资料编辑弹窗
     * @returns {void}
     */
    closeProfile() {
        this.profileModal?.classList.add('hidden');
    }

    /**
     * 保存用户名
     * @returns {Promise<void>}
     */
    async saveProfileUsername() {
        const newUsername = document.getElementById('profile-username')?.value?.trim() || '';
        const result = await AuthApi.updateAccountUsername(newUsername);
        if (!result.success) {
            alert(result.error || '修改失败');
            return;
        }
        alert(result.message || '用户名已更新');
        this.renderAccountInfo();
        this.closeProfile();
    }

    /**
     * 保存密码
     * @returns {Promise<void>}
     */
    async saveProfilePassword() {
        const oldPassword = document.getElementById('profile-old-password')?.value || '';
        const newPassword = document.getElementById('profile-new-password')?.value || '';
        const confirmPassword = document.getElementById('profile-confirm-password')?.value || '';

        if (!newPassword) {
            alert('请输入新密码');
            return;
        }
        if (newPassword !== confirmPassword) {
            alert('两次输入的新密码不一致');
            return;
        }

        const result = await AuthApi.updateAccountPassword(oldPassword, newPassword);
        if (!result.success) {
            alert(result.error || '修改失败');
            return;
        }

        document.getElementById('profile-old-password').value = '';
        document.getElementById('profile-new-password').value = '';
        document.getElementById('profile-confirm-password').value = '';

        alert(result.message || '密码已更新');
        this.openProfile();
    }

    handleImport(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                const result = DataSync.importAll(data);
                alert(result.success ? result.message : result.error);
                if (result.success) location.reload();
            } catch {
                alert('导入失败：文件格式错误');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    clearMemory() {
        if (!confirm('确定清除当前账号的助手长期记忆（昵称、偏好、笔记）？')) return;
        UserStorage.removeItem('aiUserMemory');
        alert('已清除长期记忆');
    }

    /**
     * 安装 PWA 到主屏幕
     * @returns {Promise<void>}
     */
    async handleInstallApp() {
        if (typeof PwaInstall === 'undefined') {
            alert('当前环境不支持安装');
            return;
        }
        const result = await PwaInstall.promptInstall();
        if (result.message) {
            alert(result.message);
        }
        PwaInstall.updateInstallUi();
    }

    /**
     * 渲染通知开关与状态
     * @returns {void}
     */
    renderNotificationSettings() {
        const toggle = document.getElementById('settings-notification-toggle');
        const statusEl = document.getElementById('settings-notification-status');
        const permission = NotificationSettings.getPermissionStatus();
        const active = NotificationSettings.isActive();

        if (toggle) {
            toggle.checked = active;
            toggle.disabled = permission === 'unsupported' || permission === 'denied';
        }
        if (statusEl) {
            statusEl.textContent = `状态：${NotificationSettings.getStatusLabel()}`;
        }
    }

    /**
     * 切换通知开关
     * @param {Event} e
     * @returns {Promise<void>}
     */
    async handleNotificationToggle(e) {
        const input = /** @type {HTMLInputElement} */ (e.target);
        if (input.checked) {
            const result = await NotificationSettings.enable();
            if (!result.success) {
                input.checked = false;
                alert(result.error || '无法开启通知');
            }
        } else {
            NotificationSettings.disable();
        }
        this.renderNotificationSettings();
        if (typeof ReminderManager !== 'undefined') {
            ReminderManager.syncToServiceWorker();
        }
    }

    /**
     * 清空当前账号全部数据
     * @returns {void}
     */
    clearAccountData() {
        const user = AuthApi.getCurrentAccount();
        const name = user?.username || '当前账号';

        if (!confirm(`确定清空「${name}」的全部数据？\n包括任务、课表、提醒、记忆等，此操作不可恢复。`)) {
            return;
        }
        if (!confirm('再次确认：数据删除后无法恢复，除非您已有备份。是否继续？')) {
            return;
        }

        UserStorage.clearCurrentUserData();
        if (typeof ReminderScheduler !== 'undefined') {
            ReminderScheduler.scheduleAll();
        }
        if (typeof ReminderManager !== 'undefined') {
            ReminderManager.syncToServiceWorker();
        }
        alert('已清空当前账号数据');
        location.reload();
    }

    startVoiceInput() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('当前浏览器不支持语音识别');
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.onresult = (event) => {
            const text = event.results[0][0].transcript;
            const input = document.getElementById('chat-input');
            if (input) {
                input.value = text;
                this.close();
                if (typeof switchTab === 'function') switchTab('ai-assistant');
            }
        };
        recognition.start();
    }

    /**
     * 启动时检查是否需要登录
     * @returns {void}
     */
    static showAuthGateIfNeeded() {
        if (!AccountManager.needsAuthGate()) {
            return;
        }
        window.settingsManager?.openAuth('login', { gate: true });
    }
}
