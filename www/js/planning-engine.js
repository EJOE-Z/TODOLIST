/**
 * 规划引擎 - 本周计划、倒推排程、番茄估算
 */
class PlanningEngine {
    /**
     * 估算任务剩余番茄钟数
     * @param {Object} task
     * @param {number} [focusMin=25]
     * @returns {number}
     */
    static estimatePomodoros(task, focusMin = 25) {
        const subtasks = (task.subtasks || []).filter(s => !s.completed);
        if (subtasks.length) return subtasks.length;
        if (task.priority === 'high') return 4;
        if (task.priority === 'medium') return 2;
        return 1;
    }

    /**
     * 根据截止日倒推每日建议专注数
     * @param {Object} task
     * @returns {string|null}
     */
    static backwardPlanHint(task) {
        if (!task.deadline || task.completed) return null;
        const days = ActionExecutor.daysUntil(task.deadline);
        if (days === null || days <= 0) return null;

        const pomos = PlanningEngine.estimatePomodoros(task);
        const perDay = Math.max(1, Math.ceil(pomos / Math.max(days, 1)));
        return `距截止 ${days} 天，建议每天 ${perDay} 个番茄（约 ${perDay * 25} 分钟）`;
    }

    /**
     * 是否为考试周（7 天内 ≥3 项截止）
     * @returns {boolean}
     */
    static isExamWeek() {
        const pending = ActionExecutor.getTasks().filter(t => !t.completed && t.deadline);
        const within7 = pending.filter(t => {
            const d = ActionExecutor.daysUntil(t.deadline);
            return d !== null && d >= 0 && d <= 7;
        });
        return within7.length >= 3;
    }

    /**
     * 提升考试周任务分数
     * @param {Object} task
     * @returns {number}
     */
    static examWeekBoost(task) {
        if (!PlanningEngine.isExamWeek()) return 0;
        const d = ActionExecutor.daysUntil(task.deadline);
        if (d === null || d < 0 || d > 7) return 0;
        return 20 - d * 2;
    }

    /**
     * 生成本周计划
     * @returns {Object}
     */
    static generateWeeklyPlan() {
        const tasks = ActionExecutor.getTasks().filter(t => !t.completed);
        const courses = ActionExecutor.getCourses();
        const today = new Date();
        /** @type {Array<Object>} */
        const days = [];

        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            const dayIndex = date.getDay();
            const dateStr = ActionExecutor.getLocalDateString(date);
            const dayCourses = courses.filter(c => String(c.day) === String(dayIndex));

            const dayTasks = tasks.filter(t => {
                if (!t.deadline) return i === 0;
                const d = ActionExecutor.daysUntil(t.deadline);
                return d !== null && d >= 0 && d <= 7 - i;
            }).slice(0, 5);

            days.push({
                date: date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }),
                dateStr,
                courses: dayCourses.map(c => c.name),
                tasks: dayTasks.map(t => ({
                    title: t.title,
                    hint: PlanningEngine.backwardPlanHint(t),
                    pomodoros: PlanningEngine.estimatePomodoros(t)
                }))
            });
        }

        return {
            success: true,
            examWeek: PlanningEngine.isExamWeek(),
            days,
            summary: PlanningEngine.isExamWeek()
                ? '本周进入考试/密集截止周，建议优先处理临近截止任务'
                : '已按截止日与课表生成本周概览'
        };
    }

    /**
     * 格式化为 Markdown
     * @param {Object} [plan]
     * @returns {string}
     */
    static formatWeeklyPlanMarkdown(plan) {
        plan = plan || PlanningEngine.generateWeeklyPlan();
        const lines = ['📆 **本周计划**', '---'];
        if (plan.examWeek) {
            lines.push('⚠️ **本周任务较密集**，建议每天预留专注时间');
            lines.push('---');
        }
        plan.days.forEach((day, idx) => {
            lines.push(`### ${day.date}${idx === 0 ? '（今天）' : ''}`);
            if (day.courses.length) {
                lines.push(`📚 课程：${day.courses.join('、')}`);
            }
            if (day.tasks.length) {
                day.tasks.forEach((t, i) => {
                    lines.push(`${i + 1}. ${t.title}（约 ${t.pomodoros} 🍅${t.hint ? ` · ${t.hint}` : ''}）`);
                });
            } else {
                lines.push('· 暂无重点待办');
            }
        });
        lines.push('---');
        lines.push(`*${plan.summary}。说「帮我安排今天」查看今日时间线。*`);
        return lines.join('\n');
    }

    /**
     * 为今日计划块附加可执行操作
     * @param {Object} block
     * @returns {Array<Object>}
     */
    static getBlockActions(block) {
        if (block.type !== 'suggestion' || !block.taskTitle) return [];
        const actions = [
            { label: '开始专注', command: `开始专注：${block.taskTitle}`, actionType: 'command' }
        ];
        if (block.subtaskTitle) {
            actions.push({
                label: '标记完成',
                command: `完成子任务：${block.taskTitle} ${block.subtaskTitle}`,
                actionType: 'command'
            });
        }
        actions.push({
            label: '推迟30分',
            command: block.subtaskTitle
                ? `推迟计划：${block.taskTitle}|${block.subtaskTitle}`
                : `推迟计划：${block.taskTitle}`,
            actionType: 'command'
        });
        return actions;
    }
}
