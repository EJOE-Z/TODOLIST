/**
 * 计划自动重排 - 跟踪今日计划槽位，检测错过并触发重排
 */
class PlanRescheduleEngine {
    static GRACE_MINUTES = 8;

    /**
     * 保存今日计划快照（展示计划时调用）
     * @param {Object} plan
     */
    static saveTodayPlan(plan) {
        const memory = UserMemory.load();
        const today = UserMemory.getTodayString();
        const slots = (plan.blocks || [])
            .filter(b => b.type === 'suggestion')
            .map((b, i) => ({
                id: `${today}_${i}_${b.startMinutes}`,
                startMinutes: b.startMinutes,
                endMinutes: b.endMinutes || (b.startMinutes + (b.duration || 25)),
                taskTitle: b.taskTitle,
                subtaskTitle: b.subtaskTitle || null,
                label: b.label,
                status: 'pending'
            }));

        memory.meta.todayPlan = { date: today, slots, savedAt: new Date().toISOString() };
        UserMemory.save(memory);
    }

    /**
     * 获取今日计划快照
     * @returns {Object|null}
     */
    static getTodayPlan() {
        const memory = UserMemory.load();
        const plan = memory.meta?.todayPlan;
        if (!plan || plan.date !== UserMemory.getTodayString()) return null;
        return plan;
    }

    /**
     * 标记某计划槽为已完成
     * @param {string} taskTitle
     * @param {string|null} [subtaskTitle]
     */
    static markSlotDone(taskTitle, subtaskTitle) {
        const plan = PlanRescheduleEngine.getTodayPlan();
        if (!plan) return;

        const slot = plan.slots.find(s =>
            s.status === 'pending'
            && s.taskTitle === taskTitle
            && (!subtaskTitle || s.subtaskTitle === subtaskTitle)
        ) || plan.slots.find(s => s.status === 'pending' && s.taskTitle === taskTitle);

        if (slot) {
            slot.status = 'done';
            slot.doneAt = new Date().toISOString();
            PlanRescheduleEngine.persistPlan(plan);
        }
    }

    /**
     * @param {Object} plan
     */
    static persistPlan(plan) {
        const memory = UserMemory.load();
        memory.meta.todayPlan = plan;
        UserMemory.save(memory);
    }

    /**
     * 检测错过的计划时段
     * @returns {Array<Object>}
     */
    static checkMissedSlots() {
        const plan = PlanRescheduleEngine.getTodayPlan();
        if (!plan) return [];

        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        /** @type {Array<Object>} */
        const missed = [];

        plan.slots.forEach(slot => {
            if (slot.status !== 'pending') return;
            const deadline = slot.endMinutes + PlanRescheduleEngine.GRACE_MINUTES;
            if (nowMinutes > deadline) {
                slot.status = 'missed';
                missed.push(slot);
            }
        });

        if (missed.length) {
            PlanRescheduleEngine.persistPlan(plan);
        }

        return missed;
    }

    /**
     * 专注结束后回调
     * @param {{ taskTitle: string, completedFully: boolean, stoppedEarly: boolean }} info
     */
    static onFocusSessionEnd(info) {
        if (!info.taskTitle) return;

        PlanRescheduleEngine.markSlotDone(info.taskTitle);

        if (!window.aiAssistant) return;

        const next = PlanRescheduleEngine.getNextPendingSlot();

        if (info.completedFully) {
            const lines = [`✅ **${info.taskTitle}** 专注完成！`];
            if (next) {
                lines.push(`\n下一段计划：**${next.timeLabel || PlanRescheduleEngine.formatSlotTime(next)}** ${next.label}`);
                window.aiAssistant.addMessage('assistant', lines.join(''), {
                    actions: [
                        { label: '开始下一段', command: `开始专注：${next.taskTitle}` },
                        { label: '重排计划', command: '重排今日计划' }
                    ]
                });
            } else {
                lines.push('\n今日计划时段已全部完成 🎉');
                window.aiAssistant.addMessage('assistant', lines.join(''));
            }
            return;
        }

        if (info.stoppedEarly) {
            window.aiAssistant.addMessage('assistant',
                `⏸️ 「${info.taskTitle}」专注已提前结束。后面的计划可能跟不上进度了，要重排吗？`,
                {
                    actions: [
                        { label: '重排今日计划', command: '重排今日计划' },
                        { label: '继续下一段', command: next ? `开始专注：${next.taskTitle}` : '帮我安排今天' }
                    ]
                }
            );
        }
    }

    /**
     * 获取下一个待执行计划槽
     * @returns {Object|null}
     */
    static getNextPendingSlot() {
        const plan = PlanRescheduleEngine.getTodayPlan();
        if (!plan) return null;

        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        const pending = plan.slots
            .filter(s => s.status === 'pending' && s.startMinutes >= nowMinutes - 5)
            .sort((a, b) => a.startMinutes - b.startMinutes);

        const slot = pending[0];
        if (!slot) return null;

        return {
            ...slot,
            timeLabel: PlanRescheduleEngine.formatSlotTime(slot)
        };
    }

    /**
     * @param {Object} slot
     * @returns {string}
     */
    static formatSlotTime(slot) {
        const start = SecretaryEngine.formatMinutes(slot.startMinutes);
        const end = SecretaryEngine.formatMinutes(slot.endMinutes || slot.startMinutes + 25);
        return `${start}-${end}`;
    }

    /**
     * 重算并返回新计划 Markdown
     * @returns {string}
     */
    static rescheduleToday() {
        UserMemory.clearTodayPlanMissed();
        const plan = SecretaryEngine.generateDailyPlan();
        PlanRescheduleEngine.saveTodayPlan(plan);
        return SecretaryEngine.formatDailyPlanMarkdown(plan);
    }

    /**
     * 生成错过时段的主动提醒
     * @param {Object} slot
     * @returns {Object}
     */
    static buildMissedNudge(slot) {
        const timeLabel = PlanRescheduleEngine.formatSlotTime(slot);
        return {
            key: `missed_plan_${slot.id}`,
            priority: 85,
            type: 'missed_plan',
            text: `计划时段 **${timeLabel}**「${slot.label}」已错过，要重排后面的安排吗？`,
            actions: [
                { label: '重排今日计划', command: '重排今日计划' },
                { label: '跳过继续', command: `开始专注：${slot.taskTitle}` }
            ]
        };
    }

    /**
     * 跳过当前错过槽
     * @param {string} slotId
     */
    static skipSlot(slotId) {
        const plan = PlanRescheduleEngine.getTodayPlan();
        if (!plan) return;
        const slot = plan.slots.find(s => s.id === slotId);
        if (slot) {
            slot.status = 'skipped';
            PlanRescheduleEngine.persistPlan(plan);
        }
    }
}
