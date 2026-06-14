/**
 * 用户偏好与长期记忆管理
 */
class UserMemory {
    static STORAGE_KEY = 'aiUserMemory';

    /**
     * 加载记忆数据，不存在则返回默认结构
     * @returns {Object}
     */
    static load() {
        try {
            const raw = UserStorage.getItem(UserMemory.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const defaults = UserMemory.getDefaultMemory();
                return {
                    ...defaults,
                    ...parsed,
                    preferences: {
                        ...defaults.preferences,
                        ...(parsed.preferences || {}),
                        schedulePreferences: {
                            ...defaults.preferences.schedulePreferences,
                            ...(parsed.preferences?.schedulePreferences || {})
                        }
                    },
                    habits: { ...defaults.habits, ...(parsed.habits || {}) },
                    meta: { ...defaults.meta, ...(parsed.meta || {}) },
                    taskInsights: { ...(defaults.taskInsights || {}), ...(parsed.taskInsights || {}) },
                    sessionContext: parsed.sessionContext || defaults.sessionContext || [],
                    planPostpones: parsed.planPostpones || defaults.planPostpones || {}
                };
            }
        } catch {
            /* 忽略解析错误 */
        }
        return UserMemory.getDefaultMemory();
    }

    /**
     * 获取默认记忆结构
     * @returns {Object}
     */
    static getDefaultMemory() {
        return {
            preferences: {
                nickname: '',
                focusDurationMinutes: 25,
                defaultPriority: 'medium',
                briefingEnabled: true,
                schedulePreferences: {
                    peakPeriod: '',
                    avoidHardTasksBeforeHour: null,
                    avoidHardTasksAfterHour: null,
                    noRemindersAfter: '22:00',
                    noRemindersBefore: '08:00'
                }
            },
            habits: {
                taskKeywords: {},
                dailyReminderTimes: [],
                lastFocusTaskTitle: '',
                focusSessionCount: 0,
                tasksCreatedCount: 0
            },
            taskInsights: {},
            sessionContext: [],
            planPostpones: {},
            notes: [],
            meta: {
                lastVisitDate: '',
                briefingShownDate: '',
                nudgeShownKeys: {},
                visitCount: 0
            }
        };
    }

    /**
     * 保存记忆到 localStorage
     * @param {Object} memory
     */
    static save(memory) {
        UserStorage.setItem(UserMemory.STORAGE_KEY, JSON.stringify(memory));
    }

    /**
     * 记录本次访问
     */
    static recordVisit() {
        const memory = UserMemory.load();
        const today = UserMemory.getTodayString();
        memory.meta.visitCount = (memory.meta.visitCount || 0) + 1;
        memory.meta.lastVisitDate = today;
        UserMemory.save(memory);
    }

    /**
     * 今日是否尚未展示简报
     * @returns {boolean}
     */
    static shouldShowBriefingToday() {
        const memory = UserMemory.load();
        if (memory.preferences.briefingEnabled === false) return false;
        return memory.meta.briefingShownDate !== UserMemory.getTodayString();
    }

    /**
     * 标记今日简报已展示
     */
    static markBriefingShown() {
        const memory = UserMemory.load();
        memory.meta.briefingShownDate = UserMemory.getTodayString();
        UserMemory.save(memory);
    }

    /**
     * 获取本地日期字符串 YYYY-MM-DD
     * @returns {string}
     */
    static getTodayString() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    /**
     * 记录任务创建行为，用于学习习惯
     * @param {Object} taskInfo
     */
    static recordTaskCreated(taskInfo) {
        const memory = UserMemory.load();
        memory.habits.tasksCreatedCount = (memory.habits.tasksCreatedCount || 0) + 1;

        if (taskInfo.title) {
            UserMemory.incrementKeywords(memory.habits.taskKeywords, taskInfo.title);
        }
        if (taskInfo.dailyReminderTime) {
            UserMemory.addUnique(memory.habits.dailyReminderTimes, taskInfo.dailyReminderTime);
        }
        if (taskInfo.priority) {
            memory.preferences.defaultPriority = taskInfo.priority;
        }

        UserMemory.save(memory);
    }

    /**
     * 记录专注开始
     * @param {string} taskTitle
     */
    static recordFocusStarted(taskTitle) {
        const memory = UserMemory.load();
        memory.habits.lastFocusTaskTitle = taskTitle;
        memory.habits.focusSessionCount = (memory.habits.focusSessionCount || 0) + 1;
        if (taskTitle) {
            UserMemory.incrementKeywords(memory.habits.taskKeywords, taskTitle);
            UserMemory.recordTaskFocus(taskTitle);
        }
        UserMemory.save(memory);
    }

    /**
     * 记录任务专注行为
     * @param {string} taskTitle
     */
    static recordTaskFocus(taskTitle) {
        if (!taskTitle) return;
        const memory = UserMemory.load();
        if (!memory.taskInsights) memory.taskInsights = {};
        const key = UserMemory.normalizeTaskKey(taskTitle);
        const prev = memory.taskInsights[key] || { focusCount: 0 };
        memory.taskInsights[key] = {
            title: taskTitle,
            focusCount: (prev.focusCount || 0) + 1,
            lastFocusAt: new Date().toISOString()
        };
        UserMemory.save(memory);
    }

    /**
     * 记录任务完成
     * @param {string} taskTitle
     */
    static recordTaskCompleted(taskTitle) {
        if (!taskTitle) return;
        const memory = UserMemory.load();
        if (!memory.taskInsights) memory.taskInsights = {};
        const key = UserMemory.normalizeTaskKey(taskTitle);
        const prev = memory.taskInsights[key] || { focusCount: 0 };
        memory.taskInsights[key] = {
            ...prev,
            title: taskTitle,
            lastCompletedAt: new Date().toISOString()
        };
        UserMemory.save(memory);
    }

    /**
     * 获取任务级记忆
     * @param {string} taskTitle
     * @returns {Object|null}
     */
    static getTaskInsight(taskTitle) {
        const memory = UserMemory.load();
        if (!memory.taskInsights || !taskTitle) return null;
        return memory.taskInsights[UserMemory.normalizeTaskKey(taskTitle)] || null;
    }

    /**
     * 规范化任务键名
     * @param {string} title
     * @returns {string}
     */
    static normalizeTaskKey(title) {
        return title.trim().toLowerCase();
    }

    /**
     * 今日是否应展示某条主动提醒
     * @param {string} key
     * @returns {boolean}
     */
    static shouldShowNudge(key) {
        const memory = UserMemory.load();
        const today = UserMemory.getTodayString();
        const shown = memory.meta.nudgeShownKeys || {};
        return shown[key] !== today;
    }

    /**
     * 标记主动提醒已展示
     * @param {string} key
     */
    static markNudgeShown(key) {
        const memory = UserMemory.load();
        if (!memory.meta.nudgeShownKeys) memory.meta.nudgeShownKeys = {};
        memory.meta.nudgeShownKeys[key] = UserMemory.getTodayString();
        UserMemory.save(memory);
    }

    /**
     * 记录本会话上下文（短期记忆）
     * @param {string} role - user | assistant
     * @param {string} snippet
     */
    static recordSessionContext(role, snippet) {
        const memory = UserMemory.load();
        if (!memory.sessionContext) memory.sessionContext = [];
        memory.sessionContext.push({
            role,
            text: String(snippet).slice(0, 120),
            at: new Date().toISOString()
        });
        if (memory.sessionContext.length > 12) memory.sessionContext.shift();
        UserMemory.save(memory);
    }

    /**
     * 推迟键：父任务整推迟用任务名；单个子任务用 task::subtask
     * @param {string} taskTitle
     * @param {string|null} [subtaskTitle]
     * @returns {string}
     */
    static planSlotKey(taskTitle, subtaskTitle) {
        const task = UserMemory.normalizeTaskKey(taskTitle);
        if (!subtaskTitle) return task;
        return `${task}::${UserMemory.normalizeTaskKey(subtaskTitle)}`;
    }

    /**
     * 推迟某任务的计划时段 30 分钟（整父任务下所有子任务）
     * @param {string} taskTitle
     */
    static postponePlanTask(taskTitle) {
        UserMemory.postponePlanSlot(taskTitle, null);
    }

    /**
     * 推迟单个计划槽（可指定子任务）
     * @param {string} taskTitle
     * @param {string|null} [subtaskTitle]
     */
    static postponePlanSlot(taskTitle, subtaskTitle) {
        const memory = UserMemory.load();
        if (!memory.planPostpones) memory.planPostpones = {};
        memory.planPostpones[UserMemory.planSlotKey(taskTitle, subtaskTitle)] = Date.now() + 30 * 60 * 1000;
        UserMemory.save(memory);
    }

    /**
     * 父任务是否在推迟期内（整任务推迟）
     * @param {string} taskTitle
     * @returns {boolean}
     */
    static isPlanPostponed(taskTitle) {
        const memory = UserMemory.load();
        const until = memory.planPostpones?.[UserMemory.planSlotKey(taskTitle, null)];
        return until ? Date.now() < until : false;
    }

    /**
     * 单个工作单元是否在推迟期内
     * @param {string} taskTitle
     * @param {string|null} [subtaskTitle]
     * @returns {boolean}
     */
    static isPlanSlotPostponed(taskTitle, subtaskTitle) {
        if (UserMemory.isPlanPostponed(taskTitle)) return true;
        if (!subtaskTitle) return false;
        const memory = UserMemory.load();
        const until = memory.planPostpones?.[UserMemory.planSlotKey(taskTitle, subtaskTitle)];
        return until ? Date.now() < until : false;
    }

    /**
     * 获取短期会话摘要供 AI 使用
     * @returns {string}
     */
    static getSessionSummary() {
        const memory = UserMemory.load();
        if (!memory.sessionContext?.length) return '暂无本会话短期记忆';
        return memory.sessionContext.slice(-6).map(c => `${c.role}: ${c.text}`).join('\n');
    }

    /**
     * 从用户消息中学习显式偏好
     * @param {string} message
     * @returns {string|null} 若有学习到内容则返回提示语
     */
    static learnFromMessage(message) {
        const memory = UserMemory.load();
        let feedback = null;

        const nicknameMatch = message.match(/(?:叫我|称呼我|我的昵称是)[：:\s]*(.+?)$/i);
        if (nicknameMatch) {
            memory.preferences.nickname = nicknameMatch[1].trim().slice(0, 20);
            feedback = `好的，我会称呼您「${memory.preferences.nickname}」`;
        }

        const rememberMatch = message.match(/记住[：:\s]*(.+?)$/i);
        if (rememberMatch) {
            const note = rememberMatch[1].trim().slice(0, 200);
            if (note && !memory.notes.includes(note)) {
                memory.notes.push(note);
                if (memory.notes.length > 20) memory.notes.shift();
                feedback = `已记住：${note}`;
            }
        }

        const focusMatch = message.match(/专注(?:时间|模式)?(?:用|设|改为)?[：:\s]*(\d+)\s*分钟/i);
        if (focusMatch) {
            memory.preferences.focusDurationMinutes = Math.min(120, Math.max(5, parseInt(focusMatch[1], 10)));
            feedback = `已将默认专注时长设为 ${memory.preferences.focusDurationMinutes} 分钟`;
        }

        const priorityMatch = message.match(/默认(?:任务)?(?:用|设)?[：:\s]*(高|中|低)优先级/i);
        if (priorityMatch) {
            const map = { '高': 'high', '中': 'medium', '低': 'low' };
            memory.preferences.defaultPriority = map[priorityMatch[1]] || 'medium';
            feedback = `已记住默认优先级为${priorityMatch[1]}`;
        }

        const prefs = memory.preferences.schedulePreferences
            || UserMemory.getDefaultMemory().preferences.schedulePreferences;

        if (/上午.*(不适合|不要|别).*(难|复杂|高优先级)/.test(message)
            || /难任务.*上午/.test(message)) {
            prefs.avoidHardTasksBeforeHour = 12;
            feedback = '已记住：上午不排高难度任务，排程时会优先安排在下午';
        }

        if (/上午.*(效率|状态).*(高|好)/.test(message)) {
            prefs.peakPeriod = 'morning';
            feedback = '已记住：您上午效率较高，难任务会优先排在上午';
        } else if (/下午.*(效率|状态).*(高|好)/.test(message)) {
            prefs.peakPeriod = 'afternoon';
            feedback = '已记住：您下午效率较高，难任务会优先排在下午';
        } else if (/晚上.*(效率|状态).*(高|好)/.test(message)) {
            prefs.peakPeriod = 'evening';
            feedback = '已记住：您晚上效率较高，难任务会优先排在晚上';
        }

        const noRemindAfter = message.match(/(?:晚上|夜间)?(\d{1,2})点?后.*(别|不要|勿).*提醒/);
        if (noRemindAfter) {
            const h = parseInt(noRemindAfter[1], 10);
            prefs.noRemindersAfter = `${String(h).padStart(2, '0')}:00`;
            feedback = `已记住：${h} 点后不再安排提醒`;
        }

        const hardAfternoon = message.match(/难任务.*安排.*(下午|晚上)/);
        if (hardAfternoon) {
            prefs.avoidHardTasksBeforeHour = 12;
            prefs.peakPeriod = hardAfternoon[1] === '下午' ? 'afternoon' : 'evening';
            feedback = '已记住：高难度任务优先安排在下午/晚上';
        }

        memory.preferences.schedulePreferences = prefs;

        const hobbyMatch = message.match(/^我(?:很)?喜欢(.+)$/);
        const hobbyIsMatch = message.match(/^我的爱好是[：:\s]*(.+)$/i);
        if (!feedback && (hobbyMatch || hobbyIsMatch)) {
            const note = message.trim().slice(0, 200);
            if (note && !memory.notes.includes(note)) {
                memory.notes.push(note);
                if (memory.notes.length > 20) memory.notes.shift();
                feedback = `已记住：${note}`;
            }
        }

        const isReminderInstruction = /提醒|闹钟|值班/.test(message);
        if (!feedback && !isReminderInstruction
            && /(早上|上午|下午|晚上|每晚|每天|平时).{0,12}(喜欢|习惯|会|要)/.test(message)) {
            const note = message.trim().slice(0, 200);
            if (note && !memory.notes.includes(note)) {
                memory.notes.push(note);
                if (memory.notes.length > 20) memory.notes.shift();
                feedback = `已记住：${note}`;
            }
        }

        UserMemory.save(memory);
        return feedback;
    }

    /**
     * 获取时段排程偏好
     * @returns {Object}
     */
    static getSchedulePreferences() {
        const memory = UserMemory.load();
        return {
            ...UserMemory.getDefaultMemory().preferences.schedulePreferences,
            ...(memory.preferences.schedulePreferences || {})
        };
    }

    /**
     * 清除所有计划推迟记录（重排时恢复完整排程）
     */
    static clearPlanPostpones() {
        const memory = UserMemory.load();
        memory.planPostpones = {};
        UserMemory.save(memory);
    }

    /**
     * 清除今日计划中已错过标记（重排前）
     */
    static clearTodayPlanMissed() {
        const memory = UserMemory.load();
        if (memory.meta?.todayPlan?.slots) {
            memory.meta.todayPlan.slots.forEach(s => {
                if (s.status === 'missed') s.status = 'pending';
            });
            UserMemory.save(memory);
        }
    }

    /**
     * 保存用户偏好项
     * @param {string} key
     * @param {string} value
     * @returns {Object}
     */
    static savePreference(key, value) {
        const memory = UserMemory.load();
        const allowed = ['nickname', 'focusDurationMinutes', 'defaultPriority', 'briefingEnabled'];

        if (!allowed.includes(key)) {
            return { success: false, error: `不支持的偏好项：${key}` };
        }

        if (key === 'focusDurationMinutes') {
            memory.preferences[key] = Math.min(120, Math.max(5, parseInt(value, 10) || 25));
        } else if (key === 'briefingEnabled') {
            memory.preferences[key] = value === 'true' || value === true;
        } else {
            memory.preferences[key] = String(value).slice(0, 100);
        }

        UserMemory.save(memory);
        return { success: true, message: `已保存偏好 ${key}` };
    }

    /**
     * 添加长期记忆笔记
     * @param {string} note
     * @returns {Object}
     */
    static rememberNote(note) {
        if (!note || !note.trim()) {
            return { success: false, error: '笔记内容不能为空' };
        }
        const memory = UserMemory.load();
        const text = note.trim().slice(0, 200);
        if (!memory.notes.includes(text)) {
            memory.notes.push(text);
            if (memory.notes.length > 20) memory.notes.shift();
        }
        UserMemory.save(memory);
        return { success: true, message: `已记住：${text}` };
    }

    /**
     * 生成注入 AI 的偏好摘要
     * @returns {string}
     */
    static getPromptSummary() {
        const memory = UserMemory.load();
        const lines = [];

        if (memory.preferences.nickname) {
            lines.push(`用户昵称：${memory.preferences.nickname}`);
        }
        lines.push(`默认专注时长：${memory.preferences.focusDurationMinutes} 分钟`);
        lines.push(`默认任务优先级：${memory.preferences.defaultPriority}`);

        const sp = UserMemory.getSchedulePreferences();
        if (sp.peakPeriod) {
            const map = { morning: '上午', afternoon: '下午', evening: '晚上' };
            lines.push(`高效时段：${map[sp.peakPeriod] || sp.peakPeriod}`);
        }
        if (sp.avoidHardTasksBeforeHour != null) {
            lines.push(`上午 ${sp.avoidHardTasksBeforeHour} 点前不排难任务`);
        }
        if (sp.noRemindersAfter) {
            lines.push(`${sp.noRemindersAfter} 后不安排提醒`);
        }

        if (memory.habits.dailyReminderTimes.length) {
            lines.push(`常用每日提醒时间：${memory.habits.dailyReminderTimes.join('、')}`);
        }
        if (memory.habits.lastFocusTaskTitle) {
            lines.push(`最近专注任务：${memory.habits.lastFocusTaskTitle}`);
        }

        const insights = Object.values(memory.taskInsights || {})
            .filter(i => i.lastFocusAt && !i.lastCompletedAt)
            .slice(-3);
        if (insights.length) {
            lines.push(`进行中任务（有专注记录）：${insights.map(i => i.title).join('、')}`);
        }

        const topKeywords = UserMemory.getTopKeywords(memory.habits.taskKeywords, 5);
        if (topKeywords.length) {
            lines.push(`常关注主题：${topKeywords.join('、')}`);
        }
        if (memory.notes.length) {
            lines.push(`用户要求记住的事项：${memory.notes.slice(-5).join('；')}`);
        }

        const sessionSummary = UserMemory.getSessionSummary();
        if (sessionSummary !== '暂无本会话短期记忆') {
            lines.push(`本会话近期：${sessionSummary}`);
        }

        return lines.length ? lines.join('\n') : '暂无额外用户偏好记录';
    }

    /**
     * 获取完整记忆（供工具查询）
     * @returns {Object}
     */
    static getMemorySnapshot() {
        const memory = UserMemory.load();
        return {
            preferences: memory.preferences,
            habits: {
                dailyReminderTimes: memory.habits.dailyReminderTimes,
                lastFocusTaskTitle: memory.habits.lastFocusTaskTitle,
                focusSessionCount: memory.habits.focusSessionCount,
                tasksCreatedCount: memory.habits.tasksCreatedCount,
                topKeywords: UserMemory.getTopKeywords(memory.habits.taskKeywords, 8)
            },
            taskInsights: memory.taskInsights || {},
            notes: memory.notes
        };
    }

    /**
     * 递增关键词计数
     * @param {Object} keywords
     * @param {string} text
     */
    static incrementKeywords(keywords, text) {
        const words = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
        words.forEach(w => {
            keywords[w] = (keywords[w] || 0) + 1;
        });
    }

    /**
     * 数组去重添加
     * @param {Array<string>} arr
     * @param {string} value
     */
    static addUnique(arr, value) {
        if (value && !arr.includes(value)) {
            arr.push(value);
            if (arr.length > 10) arr.shift();
        }
    }

    /**
     * 获取高频关键词
     * @param {Object} keywords
     * @param {number} limit
     * @returns {Array<string>}
     */
    static getTopKeywords(keywords, limit) {
        return Object.entries(keywords || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([word]) => word);
    }
}
