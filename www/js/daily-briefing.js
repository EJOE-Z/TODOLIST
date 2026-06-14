/**
 * 主动今日简报生成器
 */
class DailyBriefing {
    /**
     * 生成完整今日简报文本
     * @returns {string}
     */
    static generate() {
        const schedule = ActionExecutor.getTodaySchedule();
        const memory = UserMemory.load();
        const tasks = ActionExecutor.getTasks();
        const completed = tasks.filter(t => t.completed).length;
        const total = tasks.length;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

        const lines = [];
        lines.push(`🌅 **${DailyBriefing.getGreeting(memory.preferences.nickname)}**`);
        lines.push(`📅 ${schedule.date}`);
        lines.push('---');
        lines.push('### 📊 今日概览');

        if (schedule.courses.length) {
            lines.push(`📚 **课程 ${schedule.courses.length} 门**`);
            schedule.courses.forEach((c, i) => {
                lines.push(`${i + 1}. ${c.name} ${c.periods}${c.location ? ` @ ${c.location}` : ''}`);
            });
        } else {
            lines.push('📚 今日无课程');
        }

        const pending = schedule.pendingTasks || [];
        if (pending.length) {
            lines.push(`✅ **待办 ${pending.length} 项**`);
            pending.slice(0, 5).forEach((t, i) => {
                const p = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
                let extra = '';
                if (t.daysUntilDeadline === 0) extra = ' ⚠️今天截止';
                else if (t.daysUntilDeadline != null && t.daysUntilDeadline <= 3) extra = ` ⏰${t.daysUntilDeadline}天后截止`;
                lines.push(`${i + 1}. ${p} ${t.title}${extra}`);
            });
            if (pending.length > 5) lines.push(`…还有 ${pending.length - 5} 项`);
        } else {
            lines.push('✅ 暂无待办任务');
        }

        if (schedule.reminders.length) {
            lines.push(`🔔 **今日提醒 ${schedule.reminders.length} 条**`);
            schedule.reminders.forEach(r => lines.push(`· ${r.time} ${r.title}`));
        }

        lines.push(`📈 总完成率：**${rate}%**（${completed}/${total}）`);

        const suggestions = DailyBriefing.buildSuggestions(schedule, memory, tasks);
        const planPreview = SecretaryEngine.generateDailyPlan();
        const planBlocks = (planPreview.blocks || []).filter(b => b.type === 'suggestion').slice(0, 3);

        if (planBlocks.length) {
            lines.push('---');
            lines.push('### 📋 今日安排建议');
            planBlocks.forEach((b, i) => {
                lines.push(`${i + 1}. **${b.time}** 专注「${b.label}」· ${b.detail || ''}`);
            });
            if (planPreview.topPriority) {
                lines.push(`· 优先：**${planPreview.topPriority.title}**（${planPreview.topPriority.reason}）`);
            }
        }

        if (suggestions.length) {
            lines.push('---');
            lines.push('### 💡 智能建议');
            suggestions.forEach(s => lines.push(`· ${s}`));
        }

        const preferenceNotes = DailyBriefing.getPreferenceNotes(memory);
        if (preferenceNotes.length || memory.preferences.nickname) {
            lines.push('---');
            lines.push('### 🧠 您的偏好');
            if (memory.preferences.nickname) {
                lines.push(`· 我会称呼您「${memory.preferences.nickname}」`);
            }
            preferenceNotes.forEach(n => lines.push(`· ${n}`));
        }

        lines.push('---');
        lines.push('*我是您的学习助手——说「帮我安排今天」获取完整计划，或让我帮您创建任务、开始专注。*');

        return lines.join('\n');
    }

    /**
     * 过滤掉提醒设置类笔记，只保留真实偏好/爱好
     * @param {Object} memory
     * @returns {Array<string>}
     */
    static getPreferenceNotes(memory) {
        return (memory.notes || [])
            .filter(n => !DailyBriefing.isReminderInstructionNote(n))
            .slice(-3);
    }

    /**
     * 判断笔记是否为提醒设置指令（不应出现在偏好区）
     * @param {string} note
     * @returns {boolean}
     */
    static isReminderInstructionNote(note) {
        return /提醒|闹钟|值班|每周[一二三四五六日天]|每天.*点|每晚.*点/.test(note);
    }

    /**
     * 根据时段生成问候语
     * @param {string} nickname
     * @returns {string}
     */
    static getGreeting(nickname) {
        const hour = new Date().getHours();
        let period = '您好';
        if (hour >= 5 && hour < 12) period = '早上好';
        else if (hour >= 12 && hour < 14) period = '中午好';
        else if (hour >= 14 && hour < 18) period = '下午好';
        else if (hour >= 18 && hour < 23) period = '晚上好';
        else period = '夜深了';

        const name = nickname ? `，${nickname}` : '';
        return `${period}${name}！这是您的今日简报`;
    }

    /**
     * 基于数据与记忆生成建议列表
     * @param {Object} schedule
     * @param {Object} memory
     * @param {Array<Object>} tasks
     * @returns {Array<string>}
     */
    static buildSuggestions(schedule, memory, tasks) {
        /** @type {Array<string>} */
        const suggestions = [];
        const pending = schedule.pendingTasks || [];
        const now = new Date();
        const hour = now.getHours();

        const urgent = pending.filter(t =>
            t.priority === 'high' ||
            (t.daysUntilDeadline != null && t.daysUntilDeadline <= 2)
        );
        if (urgent.length) {
            suggestions.push(`优先处理 **${urgent[0].title}**${urgent.length > 1 ? ` 等 ${urgent.length} 项紧急任务` : ''}`);
        }

        if (schedule.courses.length && hour < 12) {
            suggestions.push('上午有课，可利用课间处理短任务');
        } else if (schedule.courses.length === 0 && pending.length && hour >= 9 && hour <= 17) {
            suggestions.push('今日无课，适合安排 25 分钟专注（说「开始专注」）');
        }

        if (memory.habits.dailyReminderTimes.length) {
            const times = memory.habits.dailyReminderTimes.join('、');
            suggestions.push(`您常在 ${times} 有固定提醒，记得完成每日习惯任务`);
        }

        if (memory.habits.lastFocusTaskTitle && pending.some(t => t.title === memory.habits.lastFocusTaskTitle)) {
            suggestions.push(`继续推进「${memory.habits.lastFocusTaskTitle}」？上次的专注任务还没完成`);
        }

        const dueToday = schedule.tasksDueToday || [];
        if (dueToday.length) {
            suggestions.push(`今天截止 ${dueToday.length} 项，建议上午先完成`);
        }

        if (pending.length === 0 && schedule.courses.length === 0) {
            suggestions.push('今日较空闲，可以规划新目标或复习');
        }

        return suggestions.slice(0, 4);
    }
}
