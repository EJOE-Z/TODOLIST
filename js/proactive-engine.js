/**
 * 情境主动推送引擎 - 截止、课后、提醒前等场景
 */
class ProactiveEngine {
    static CHECK_INTERVAL_MS = 60000;

    /**
     * 启动定时检查
     */
    static init() {
        ProactiveEngine.check();
        setInterval(() => ProactiveEngine.check(), ProactiveEngine.CHECK_INTERVAL_MS);
    }

    /**
     * 执行一轮情境检查并推送
     */
    static check() {
        if (!window.aiAssistant || document.hidden) return;

        const nudges = ProactiveEngine.collectNudges();
        nudges.forEach(nudge => {
            window.aiAssistant.addMessage('assistant', ProactiveEngine.formatText(nudge), {
                type: 'nudge',
                actions: nudge.actions
            });
            UserMemory.markNudgeShown(nudge.key);
        });
    }

    /**
     * 收集当前应推送的情境提醒
     * @returns {Array<Object>}
     */
    static collectNudges() {
        /** @type {Array<Object>} */
        const nudges = [];
        const now = new Date();
        const nowMs = now.getTime();
        const schedule = ActionExecutor.getTodaySchedule();

        if (typeof PlanRescheduleEngine !== 'undefined') {
            const missed = PlanRescheduleEngine.checkMissedSlots();
            missed.forEach(slot => {
                nudges.push(PlanRescheduleEngine.buildMissedNudge(slot));
            });
        }

        (schedule.pendingTasks || []).forEach(task => {
            if (!task.deadline) return;
            const deadline = new Date(task.deadline.split('T')[0] + 'T23:59:59');
            const diffMs = deadline.getTime() - nowMs;
            const diffHours = diffMs / (1000 * 60 * 60);

            if (diffHours > 0 && diffHours <= 2) {
                nudges.push({
                    key: `deadline_2h_${task.title}`,
                    priority: 95,
                    text: `⏰ **2 小时内**截止：「${task.title}」，建议现在处理`,
                    actions: [
                        { label: '开始专注', command: `开始专注：${task.title}` },
                        { label: '推迟30分钟', command: `推迟计划：${task.title}` }
                    ]
                });
            } else if (task.daysUntilDeadline === 1) {
                nudges.push({
                    key: `deadline_1d_${task.title}`,
                    priority: 75,
                    text: `📌 「${task.title}」**明天截止**，今天建议推进`,
                    actions: [{ label: '开始专注', command: `开始专注：${task.title}` }]
                });
            }
        });

        const secretaryNudges = SecretaryEngine.getProactiveNudges();
        secretaryNudges.forEach(n => nudges.push(n));

        ReminderManager.getAll().filter(r => r.isDaily).forEach(r => {
            if (!r.repeatTime) return;
            const [h, m] = r.repeatTime.split(':').map(Number);
            const fire = new Date();
            fire.setHours(h, m, 0, 0);
            const diffMin = (fire.getTime() - nowMs) / 60000;
            if (diffMin > 0 && diffMin <= 10) {
                nudges.push({
                    key: `before_reminder_${r.id}`,
                    priority: 80,
                    text: `🔔 **${Math.round(diffMin)} 分钟后**（${r.repeatTime}）提醒：${r.title}`,
                    actions: [{ label: '知道了', dismiss: true }]
                });
            }
        });

        return nudges
            .filter(n => UserMemory.shouldShowNudge(n.key))
            .sort((a, b) => (b.priority || 0) - (a.priority || 0))
            .slice(0, 2);
    }

    /**
     * @param {Object} nudge
     * @returns {string}
     */
    static formatText(nudge) {
        return `💼 ${nudge.text}`;
    }
}
