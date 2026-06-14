/**
 * 动态话术推荐引擎 - 仅推荐快捷命令中未出现的 contextual 项
 */
class SuggestionEngine {
    /** @type {Set<string>} 快捷命令固定项（与 index.html 保持一致） */
    static QUICK_COMMANDS = new Set([
        '今日简报',
        '今天有什么安排',
        '帮我安排今天',
        '创建任务',
        '开始专注'
    ]);

    /**
     * 根据当前数据生成推荐话术（排除与快捷命令重复项）
     * @returns {Array<{ label: string, command: string }>}
     */
    static getSuggestions() {
        /** @type {Array<{ label: string, command: string, priority: number }>} */
        const items = [];
        const schedule = ActionExecutor.getTodaySchedule();
        const pending = schedule.pendingTasks || [];
        const dueToday = schedule.tasksDueToday || [];
        const memory = UserMemory.load();

        if (dueToday.length) {
            const t = dueToday[0];
            items.push({
                label: `截止今日·${SuggestionEngine.truncate(t.title, 8)}`,
                command: `开始专注：${t.title}`,
                priority: 95
            });
        }

        if (memory.habits.lastFocusTaskTitle) {
            const last = pending.find(t => t.title === memory.habits.lastFocusTaskTitle);
            if (last) {
                items.push({
                    label: `继续·${SuggestionEngine.truncate(last.title, 8)}`,
                    command: `开始专注：${last.title}`,
                    priority: 88
                });
            }
        }

        if (PlanningEngine.isExamWeek()) {
            items.push({ label: '本周计划', command: '这周怎么安排', priority: 82 });
        }

        const overdue = ActionExecutor.getTasks().filter(t => {
            if (t.completed || !t.deadline) return false;
            const d = ActionExecutor.daysUntil(t.deadline);
            return d !== null && d < 0;
        });
        if (overdue.length) {
            items.push({
                label: `跟进 ${overdue.length} 项过期`,
                command: '任务进度',
                priority: 78
            });
        }

        if (ReminderManager.getAll().length) {
            items.push({ label: '全部提醒', command: '列出所有提醒', priority: 70 });
        }

        items.push({ label: '本周复盘', command: '本周复盘', priority: 55 });

        const deduped = SuggestionEngine.deduplicate(items);

        return deduped
            .filter(item => !SuggestionEngine.QUICK_COMMANDS.has(item.command))
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 4)
            .map(({ label, command }) => ({ label, command }));
    }

    /**
     * 按 command 去重，保留高优先级
     * @param {Array<Object>} items
     * @returns {Array<Object>}
     */
    static deduplicate(items) {
        const map = new Map();
        items.forEach(item => {
            const prev = map.get(item.command);
            if (!prev || item.priority > prev.priority) {
                map.set(item.command, item);
            }
        });
        return Array.from(map.values());
    }

    /**
     * 截断标题
     * @param {string} text
     * @param {number} maxLen
     * @returns {string}
     */
    static truncate(text, maxLen) {
        const t = String(text);
        return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
    }

    /**
     * 渲染到助手侧栏
     */
    static render() {
        const container = document.getElementById('dynamic-suggestions');
        if (!container) return;

        const suggestions = SuggestionEngine.getSuggestions();

        if (!suggestions.length) {
            container.innerHTML = '<div class="suggestion-empty">暂无额外推荐<br><span>快捷命令已覆盖常用操作</span></div>';
            return;
        }

        container.innerHTML = suggestions.map(s =>
            `<button type="button" class="quick-command qc-dynamic" data-command="${SuggestionEngine.escapeAttr(s.command)}">
                <i class="fa fa-lightbulb-o"></i><span>${SuggestionEngine.escapeHtml(s.label)}</span>
            </button>`
        ).join('');

        container.querySelectorAll('.qc-dynamic').forEach(btn => {
            btn.addEventListener('click', () => {
                const chatInput = document.getElementById('chat-input');
                if (chatInput) chatInput.value = btn.getAttribute('data-command') || '';
                window.aiAssistant?.sendMessage();
            });
        });
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    static escapeAttr(text) {
        return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    static escapeHtml(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    }
}
