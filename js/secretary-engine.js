/**
 * 助手引擎 - 智能排程、主动提醒与任务优先级
 */
class SecretaryEngine {
    /**
     * 获取节次时间表（与课表模块一致）
     * @returns {Array<{period: number, start: string, end: string}>}
     */
    static getTimeSlots() {
        try {
            const saved = UserStorage.getItem('timeSlots');
            if (saved) {
                const slots = JSON.parse(saved);
                if (Array.isArray(slots) && slots.length) return slots;
            }
        } catch {
            /* 忽略 */
        }
        return [
            { period: 1, start: '08:00', end: '08:45' },
            { period: 2, start: '08:50', end: '09:35' },
            { period: 3, start: '09:50', end: '10:35' },
            { period: 4, start: '10:40', end: '11:25' },
            { period: 5, start: '11:30', end: '12:15' },
            { period: 6, start: '13:30', end: '14:15' },
            { period: 7, start: '14:20', end: '15:05' },
            { period: 8, start: '15:20', end: '16:05' },
            { period: 9, start: '16:10', end: '16:55' },
            { period: 10, start: '17:00', end: '17:45' },
            { period: 11, start: '18:30', end: '19:15' },
            { period: 12, start: '19:20', end: '20:05' }
        ];
    }

    /**
     * 将 HH:mm 转为当日分钟数
     * @param {string} hhmm
     * @returns {number}
     */
    static parseTimeToMinutes(hhmm) {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    }

    /**
     * 分钟数格式化为 HH:mm
     * @param {number} minutes
     * @returns {string}
     */
    static formatMinutes(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    /**
     * 获取今日课程并附带起止时间
     * @returns {Array<Object>}
     */
    static getTodayCoursesWithTime() {
        const todayDay = new Date().getDay();
        const slots = SecretaryEngine.getTimeSlots();

        return ActionExecutor.getCourses()
            .filter(c => String(c.day) === String(todayDay))
            .map(c => {
                const sp = parseInt(c.startPeriod, 10);
                const ep = parseInt(c.endPeriod, 10);
                const startSlot = slots.find(s => s.period === sp);
                const endSlot = slots.find(s => s.period === ep);
                const startMinutes = startSlot
                    ? SecretaryEngine.parseTimeToMinutes(startSlot.start)
                    : 480 + (sp - 1) * 50;
                const endMinutes = endSlot
                    ? SecretaryEngine.parseTimeToMinutes(endSlot.end)
                    : startMinutes + (ep - sp + 1) * 45;

                return {
                    name: c.name,
                    startMinutes,
                    endMinutes,
                    startLabel: startSlot?.start || SecretaryEngine.formatMinutes(startMinutes),
                    endLabel: endSlot?.end || SecretaryEngine.formatMinutes(endMinutes),
                    periods: `第${c.startPeriod}-${c.endPeriod}节`,
                    location: c.location || ''
                };
            })
            .sort((a, b) => a.startMinutes - b.startMinutes);
    }

    /**
     * 计算今日课表之间的空闲时段
     * @param {Array<Object>} courses
     * @param {number} [minMinutes=25]
     * @returns {Array<Object>}
     */
    static findFreeGaps(courses, minMinutes = 25) {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const dayStart = 8 * 60;
        const dayEnd = 21 * 60;
        /** @type {Array<Object>} */
        const gaps = [];

        const sorted = [...courses].sort((a, b) => a.startMinutes - b.startMinutes);
        let cursor = Math.max(dayStart, nowMinutes);

        sorted.forEach(course => {
            if (course.startMinutes > cursor) {
                const duration = course.startMinutes - cursor;
                if (duration >= minMinutes) {
                    gaps.push({
                        startMinutes: cursor,
                        endMinutes: course.startMinutes,
                        durationMinutes: duration,
                        startLabel: SecretaryEngine.formatMinutes(cursor),
                        endLabel: SecretaryEngine.formatMinutes(course.startMinutes)
                    });
                }
            }
            cursor = Math.max(cursor, course.endMinutes);
        });

        if (dayEnd > cursor) {
            const duration = dayEnd - cursor;
            if (duration >= minMinutes) {
                gaps.push({
                    startMinutes: cursor,
                    endMinutes: dayEnd,
                    durationMinutes: duration,
                    startLabel: SecretaryEngine.formatMinutes(cursor),
                    endLabel: SecretaryEngine.formatMinutes(dayEnd)
                });
            }
        }

        return gaps;
    }

    /**
     * 为待办任务计算优先级分数
     * @param {Object} task
     * @param {Object} memory
     * @returns {number}
     */
    static scoreTask(task, memory) {
        let score = 0;
        if (task.priority === 'high') score += 30;
        else if (task.priority === 'medium') score += 15;

        if (task.daysUntilDeadline === 0) score += 50;
        else if (task.daysUntilDeadline === 1) score += 35;
        else if (task.daysUntilDeadline != null && task.daysUntilDeadline <= 3) score += 20;

        const insight = UserMemory.getTaskInsight(task.title);
        if (insight?.focusCount) score += Math.min(insight.focusCount * 3, 12);
        if (memory.habits.lastFocusTaskTitle === task.title) score += 15;
        if (typeof PlanningEngine !== 'undefined') {
            score += PlanningEngine.examWeekBoost(task);
        }

        return score;
    }

    /**
     * 生成任务优先处理理由
     * @param {Object} task
     * @returns {string}
     */
    static buildTaskReason(task) {
        if (task.daysUntilDeadline === 0) return '今天截止';
        if (task.daysUntilDeadline === 1) return '明天截止';
        if (task.daysUntilDeadline != null && task.daysUntilDeadline <= 3) {
            return `${task.daysUntilDeadline} 天后截止`;
        }
        if (task.priority === 'high') return '高优先级';
        const insight = UserMemory.getTaskInsight(task.title);
        if (insight?.focusCount) return '已有专注记录，适合继续推进';
        return '待办事项';
    }

    /**
     * 将空闲时段切分为可执行的专注时间块
     * @param {Object} gap
     * @param {number} focusMin
     * @param {number} [breakMin=5]
     * @param {number} [maxSlots=4]
     * @returns {Array<Object>}
     */
    static splitGapIntoFocusSlots(gap, focusMin, breakMin = 5, maxSlots = 4) {
        /** @type {Array<Object>} */
        const slots = [];
        let cursor = gap.startMinutes;

        while (cursor + focusMin <= gap.endMinutes && slots.length < maxSlots) {
            slots.push({
                startMinutes: cursor,
                endMinutes: cursor + focusMin,
                startLabel: SecretaryEngine.formatMinutes(cursor),
                endLabel: SecretaryEngine.formatMinutes(cursor + focusMin),
                durationMinutes: focusMin
            });
            cursor += focusMin + breakMin;
        }

        return slots;
    }

    /**
     * 收集所有空档内的可用专注槽（不在每个空档开头截断）
     * @param {Array<Object>} gaps
     * @param {number} focusMin
     * @param {number} [breakMin=5]
     * @returns {Array<Object>}
     */
    static collectAllFocusSlots(gaps, focusMin, breakMin = 5) {
        /** @type {Array<Object>} */
        const all = [];
        gaps.forEach(gap => {
            SecretaryEngine.splitGapIntoFocusSlots(gap, focusMin, breakMin, 999).forEach(slot => {
                all.push(slot);
            });
        });
        return all;
    }

    /**
     * 从候选槽中均匀抽取 N 个，使任务分布到上午/下午/晚上
     * @param {Array<Object>} slots
     * @param {number} count
     * @returns {Array<Object>}
     */
    static spreadPickSlots(slots, count) {
        if (count <= 0 || !slots.length) return [];
        if (slots.length <= count) return slots;

        /** @type {Array<Object>} */
        const picked = [];
        for (let i = 0; i < count; i++) {
            const idx = Math.round((i * (slots.length - 1)) / Math.max(count - 1, 1));
            picked.push(slots[idx]);
        }
        return picked;
    }

    /**
     * 收集今日固定占用时段（课程 + 提醒前后缓冲）
     * @param {Array<Object>} courses
     * @param {Array<Object>} reminders
     * @returns {Array<Object>}
     */
    static getOccupiedRanges(courses, reminders) {
        /** @type {Array<Object>} */
        const ranges = [];

        courses.forEach(c => {
            ranges.push({
                startMinutes: c.startMinutes,
                endMinutes: c.endMinutes,
                type: 'course'
            });
        });

        reminders.forEach(r => {
            const at = SecretaryEngine.parseTimeToMinutes(r.time);
            ranges.push({
                startMinutes: Math.max(0, at - 10),
                endMinutes: at + 15,
                type: 'reminder'
            });
        });

        return ranges.sort((a, b) => a.startMinutes - b.startMinutes);
    }

    /**
     * 在占用时段之外找出可排程的空档
     * @param {Array<Object>} occupied
     * @param {number} nowMinutes
     * @param {number} [minMinutes=25]
     * @returns {Array<Object>}
     */
    static findSchedulableGaps(occupied, nowMinutes, minMinutes = 25) {
        const dayStart = 8 * 60;
        const dayEnd = 21 * 60;
        let cursor = Math.max(dayStart, nowMinutes);
        /** @type {Array<Object>} */
        const gaps = [];

        occupied.forEach(block => {
            if (block.startMinutes > cursor) {
                const duration = block.startMinutes - cursor;
                if (duration >= minMinutes) {
                    gaps.push({
                        startMinutes: cursor,
                        endMinutes: block.startMinutes,
                        durationMinutes: duration,
                        startLabel: SecretaryEngine.formatMinutes(cursor),
                        endLabel: SecretaryEngine.formatMinutes(block.startMinutes)
                    });
                }
            }
            cursor = Math.max(cursor, block.endMinutes);
        });

        if (dayEnd > cursor) {
            const duration = dayEnd - cursor;
            if (duration >= minMinutes) {
                gaps.push({
                    startMinutes: cursor,
                    endMinutes: dayEnd,
                    durationMinutes: duration,
                    startLabel: SecretaryEngine.formatMinutes(cursor),
                    endLabel: SecretaryEngine.formatMinutes(dayEnd)
                });
            }
        }

        return gaps;
    }

    static isHardTask(task) {
        if (task.priority === 'high') return true;
        if (typeof PlanningEngine !== 'undefined' && PlanningEngine.estimatePomodoros(task) >= 3) {
            return true;
        }
        return false;
    }

    /**
     * 时段与任务匹配分
     * @param {Object} task
     * @param {number} startMinutes
     * @returns {number}
     */
    static slotFitScore(task, startMinutes) {
        const prefs = UserMemory.getSchedulePreferences();
        const hour = Math.floor(startMinutes / 60);
        let score = 0;
        const hard = SecretaryEngine.isHardTask(task);

        if (hard && prefs.avoidHardTasksBeforeHour != null && hour < prefs.avoidHardTasksBeforeHour) {
            score -= 60;
        }
        if (hard && prefs.avoidHardTasksAfterHour != null && hour >= prefs.avoidHardTasksAfterHour) {
            score -= 40;
        }

        const peak = prefs.peakPeriod;
        if (peak === 'morning' && hour >= 8 && hour < 12) score += hard ? 25 : 10;
        if (peak === 'afternoon' && hour >= 14 && hour < 18) score += hard ? 25 : 10;
        if (peak === 'evening' && hour >= 18 && hour < 22) score += hard ? 25 : 10;

        if (!hard && peak === 'morning' && hour >= 14) score += 5;
        return score;
    }

    /**
     * 为时间槽选择最合适的任务
     * @param {Array<Object>} tasks
     * @param {number} startMinutes
     * @param {number} rotateIndex
     * @returns {{ task: Object, index: number }}
     */
    static pickTaskForSlot(tasks, startMinutes, rotateIndex) {
        if (!tasks.length) return { task: null, index: 0 };

        let bestIdx = rotateIndex % tasks.length;
        let bestScore = -Infinity;

        tasks.forEach((task, i) => {
            if (UserMemory.isPlanPostponed(task.title)) return;
            const total = task.score + SecretaryEngine.slotFitScore(task, startMinutes);
            if (total > bestScore) {
                bestScore = total;
                bestIdx = i;
            }
        });

        return { task: tasks[bestIdx], index: bestIdx };
    }

    /**
     * 构建今日待排工作单元（每个未完成子任务 = 1 单元，无子任务则按番茄估算）
     * @param {Array<Object>} tasks
     * @returns {Array<Object>}
     */
    static buildWorkUnits(tasks) {
        /** @type {Array<Array<Object>>} */
        const perTask = tasks.map(task => {
            const subs = (task.subtasks || []).filter(s => !s.completed);
            if (subs.length) {
                return subs.map(sub => ({
                    task,
                    taskTitle: task.title,
                    subtaskTitle: sub.title,
                    label: `${task.title} · ${sub.title}`
                }));
            }
            const count = typeof PlanningEngine !== 'undefined'
                ? Math.min(PlanningEngine.estimatePomodoros(task), 2)
                : 1;
            return Array.from({ length: count }, (_, i) => ({
                task,
                taskTitle: task.title,
                subtaskTitle: null,
                label: count > 1 ? `${task.title} · 第 ${i + 1} 轮` : task.title,
                unitIndex: i
            }));
        });

        /** @type {Array<Object>} */
        const queue = [];
        let hasMore = true;
        while (hasMore) {
            hasMore = false;
            perTask.forEach(units => {
                if (units.length) {
                    queue.push(units.shift());
                    hasMore = true;
                }
            });
        }
        return queue;
    }

    /**
     * 获取专注步骤信息（含子任务）
     * @param {Object} task
     * @param {number} slotIndex
     * @returns {{ label: string, subtaskTitle: string|null, pomodoros: number }}
     */
    static getFocusStepInfo(task, slotIndex) {
        const subtasks = (task.subtasks || []).filter(s => !s.completed);
        const pomodoros = typeof PlanningEngine !== 'undefined'
            ? PlanningEngine.estimatePomodoros(task)
            : 1;
        if (subtasks.length) {
            const sub = subtasks[slotIndex % subtasks.length];
            return {
                label: `${task.title} · ${sub.title}`,
                subtaskTitle: sub.title,
                pomodoros
            };
        }
        return { label: task.title, subtaskTitle: null, pomodoros };
    }

    /**
     * 生成今日智能排程（结构化数据）
     * @returns {Object}
     */
    static generateDailyPlan() {
        const schedule = ActionExecutor.getTodaySchedule();
        const memory = UserMemory.load();
        const courses = SecretaryEngine.getTodayCoursesWithTime();
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const focusMin = memory.preferences.focusDurationMinutes || 25;

        const pending = (schedule.pendingTasks || [])
            .map(t => ({ ...t, score: SecretaryEngine.scoreTask(t, memory) }))
            .sort((a, b) => b.score - a.score);

        const reminderTitles = new Set(
            (schedule.reminders || []).map(r => r.title.trim().toLowerCase())
        );
        const focusTasks = pending.filter(t => !reminderTitles.has(t.title.trim().toLowerCase()));
        const schedulableTasks = focusTasks.length ? focusTasks : pending;

        const occupied = SecretaryEngine.getOccupiedRanges(courses, schedule.reminders || []);
        const gaps = SecretaryEngine.findSchedulableGaps(occupied, nowMinutes, focusMin);
        /** @type {Array<Object>} */
        const blocks = [];

        if (nowMinutes < 8 * 60) {
            blocks.push({
                type: 'note',
                time: '提示',
                startMinutes: nowMinutes,
                label: '当前较早，以下计划从 08:00 起算',
                detail: ''
            });
        } else if (nowMinutes >= 14 * 60) {
            blocks.push({
                type: 'note',
                time: '提示',
                startMinutes: nowMinutes,
                label: '下午时段已过，以下仅从当前时间起安排剩余任务',
                detail: '如需规划明天，可说「这周怎么安排」'
            });
        }

        const currentCourse = courses.find(
            c => nowMinutes >= c.startMinutes && nowMinutes < c.endMinutes
        );
        if (currentCourse) {
            blocks.push({
                type: 'now',
                time: SecretaryEngine.formatMinutes(nowMinutes),
                startMinutes: nowMinutes,
                label: `上课中：${currentCourse.name}`,
                detail: `${currentCourse.periods}${currentCourse.location ? ` @ ${currentCourse.location}` : ''}`
            });
        }

        const workUnits = SecretaryEngine.buildWorkUnits(schedulableTasks);
        /** @type {Array<Object>} */
        const remainingUnits = workUnits.filter(u => !UserMemory.isPlanPostponed(u.taskTitle));

        const allPossibleSlots = SecretaryEngine.collectAllFocusSlots(gaps, focusMin);
        const focusSlots = SecretaryEngine.spreadPickSlots(allPossibleSlots, remainingUnits.length);

        focusSlots.forEach(slot => {
            if (!remainingUnits.length) return;

            let bestIdx = 0;
            let bestScore = -Infinity;
            remainingUnits.forEach((unit, i) => {
                const score = (unit.task.score || 0) + SecretaryEngine.slotFitScore(unit.task, slot.startMinutes);
                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = i;
                }
            });

            const unit = remainingUnits.splice(bestIdx, 1)[0];
            const pomodoros = typeof PlanningEngine !== 'undefined'
                ? PlanningEngine.estimatePomodoros(unit.task)
                : 1;
            const backwardHint = typeof PlanningEngine !== 'undefined'
                ? PlanningEngine.backwardPlanHint(unit.task)
                : null;

            blocks.push({
                type: 'suggestion',
                time: `${slot.startLabel}-${slot.endLabel}`,
                startMinutes: slot.startMinutes,
                endMinutes: slot.endMinutes,
                label: unit.label,
                taskTitle: unit.taskTitle,
                subtaskTitle: unit.subtaskTitle,
                duration: focusMin,
                detail: `专注 ${focusMin} 分钟 · 约 ${pomodoros} 🍅${backwardHint ? ` · ${backwardHint}` : ''}`
            });
        });

        courses.forEach(c => {
            blocks.push({
                type: 'course',
                time: `${c.startLabel}-${c.endLabel}`,
                startMinutes: c.startMinutes,
                label: c.name,
                detail: c.periods
            });
        });

        (schedule.reminders || []).forEach(r => {
            blocks.push({
                type: 'reminder',
                time: r.time,
                startMinutes: SecretaryEngine.parseTimeToMinutes(r.time),
                label: r.title,
                detail: '到点提醒'
            });
        });

        const unscheduled = remainingUnits.slice(0, 5).map(u => ({
            title: u.label,
            reason: '今日时段已满，建议明日继续'
        }));

        blocks.sort((a, b) => (a.startMinutes ?? 9999) - (b.startMinutes ?? 9999));

        return {
            success: true,
            date: schedule.date,
            blocks,
            unscheduledTasks: unscheduled,
            freeGaps: gaps.map(g => ({
                time: `${g.startLabel}-${g.endLabel}`,
                minutes: g.durationMinutes
            })),
            topPriority: pending[0] ? {
                title: pending[0].title,
                reason: SecretaryEngine.buildTaskReason(pending[0])
            } : null,
            summary: SecretaryEngine.buildPlanSummary(blocks, unscheduled, courses.length)
        };
    }

    /**
     * 生成排程摘要一句话
     * @param {Array<Object>} blocks
     * @param {Array<Object>} unscheduled
     * @param {number} courseCount
     * @returns {string}
     */
    static buildPlanSummary(blocks, unscheduled, courseCount) {
        const suggestions = blocks.filter(b => b.type === 'suggestion');
        const parts = [];
        parts.push(courseCount ? `今日 ${courseCount} 门课` : '今日无课');
        parts.push(suggestions.length ? `已为您排入 ${suggestions.length} 段专注时间` : '空档较少，建议见缝插针');
        if (unscheduled.length) parts.push(`另有 ${unscheduled.length} 项待灵活安排`);
        return parts.join('；');
    }

    /**
     * 将排程格式化为 Markdown 文本
     * @param {Object} [plan]
     * @returns {string}
     */
    static formatDailyPlanMarkdown(plan) {
        plan = plan || SecretaryEngine.generateDailyPlan();
        const memory = UserMemory.load();
        const nickname = memory.preferences.nickname;
        const lines = [];

        lines.push(`📋 **${DailyBriefing.getGreeting(nickname).replace('这是您的今日简报', '为您安排的今日计划')}**`);
        lines.push(`📅 ${plan.date}`);
        lines.push('---');
        lines.push('### ⏰ 时间线');

        if (!plan.blocks.length) {
            lines.push('今日暂无固定安排，适合自由规划。');
        } else {
            plan.blocks.forEach((b, i) => {
                const icon = SecretaryEngine.getBlockIcon(b.type);
                if (b.type === 'suggestion') {
                    lines.push(`${i + 1}. ${icon} **${b.time}** 专注「${b.label}」 · ${b.detail || ''}`);
                } else {
                    let line = `${i + 1}. ${icon} **${b.time}** ${b.label}`;
                    if (b.detail) line += ` · ${b.detail}`;
                    lines.push(line);
                }
            });
        }

        if (plan.unscheduledTasks.length) {
            lines.push('---');
            lines.push('### 📌 今日未排入');
            plan.unscheduledTasks.forEach((t, i) => {
                lines.push(`${i + 1}. ${t.title}（${t.reason}）`);
            });
        }

        if (plan.topPriority) {
            lines.push('---');
            lines.push(`💡 **助手建议**：优先推进「${plan.topPriority.title}」（${plan.topPriority.reason}）`);
        }

        lines.push('---');
        lines.push(`*${plan.summary}。说「开始专注」即可执行。*`);

        return lines.join('\n');
    }

    /**
     * 获取时间块图标
     * @param {string} type
     * @returns {string}
     */
    static getBlockIcon(type) {
        const icons = {
            now: '🔴',
            upcoming: '🟡',
            course: '📚',
            reminder: '🔔',
            suggestion: '✅',
            note: '💡'
        };
        return icons[type] || '·';
    }

    /**
     * 生成主动跟进提醒（助手型 nudge）
     * @returns {Array<Object>}
     */
    static getProactiveNudges() {
        /** @type {Array<Object>} */
        const nudges = [];
        const schedule = ActionExecutor.getTodaySchedule();
        const memory = UserMemory.load();
        const now = new Date();
        const hour = now.getHours();
        const nowMinutes = hour * 60 + now.getMinutes();

        const dueToday = schedule.tasksDueToday || [];
        if (dueToday.length && hour >= 8 && hour < 21) {
            nudges.push({
                key: 'deadline_today',
                priority: 90,
                type: 'deadline',
                text: dueToday.length === 1
                    ? `助手提醒：「${dueToday[0].title}」**今天截止**，建议优先完成`
                    : `助手提醒：今天还有 **${dueToday.length} 项**任务截止，别拖到最后`,
                actions: dueToday.length === 1
                    ? [
                        { label: '开始专注', command: `开始专注：${dueToday[0].title}` },
                        { label: '查看计划', command: '帮我安排今天' }
                    ]
                    : [{ label: '帮我安排今天', command: '帮我安排今天' }]
            });
        }

        const dueTomorrow = (schedule.pendingTasks || []).filter(t => t.daysUntilDeadline === 1);
        if (dueTomorrow.length && !dueToday.length) {
            nudges.push({
                key: 'deadline_tomorrow',
                priority: 70,
                type: 'deadline_soon',
                text: `「${dueTomorrow[0].title}」**明天截止**，今天要不要推进一下？`,
                actions: [
                    { label: '开始专注', command: `开始专注：${dueTomorrow[0].title}` },
                    { label: '稍后提醒', command: '30分钟后提醒我处理截止任务' }
                ]
            });
        }

        const courses = SecretaryEngine.getTodayCoursesWithTime();
        const justEnded = courses.find(
            c => nowMinutes >= c.endMinutes && nowMinutes <= c.endMinutes + 25
        );
        if (justEnded) {
            const gaps = SecretaryEngine.findFreeGaps(courses);
            const nextGap = gaps.find(g => g.startMinutes >= nowMinutes - 5 && g.durationMinutes >= 25);
            if (nextGap) {
                nudges.push({
                    key: `after_class_${justEnded.name}`,
                    priority: 65,
                    type: 'free_time',
                    text: `${justEnded.name} 刚下课，**${nextGap.startLabel}-${nextGap.endLabel}** 有约 ${nextGap.durationMinutes} 分钟空档，适合处理待办`,
                    actions: [
                        { label: '帮我安排', command: '帮我安排今天' },
                        { label: '开始专注', command: '开始专注' }
                    ]
                });
            }
        }

        if (memory.habits.lastFocusTaskTitle) {
            const stillPending = (schedule.pendingTasks || []).find(
                t => t.title === memory.habits.lastFocusTaskTitle
            );
            if (stillPending && hour >= 9 && hour <= 22) {
                nudges.push({
                    key: `continue_${stillPending.title}`,
                    priority: 50,
                    type: 'continue_focus',
                    text: `上次您在推进「${stillPending.title}」，**要继续吗？**`,
                    actions: [
                        { label: '继续专注', command: `开始专注：${stillPending.title}` }
                    ]
                });
            }
        }

        const dailyTasks = ActionExecutor.getTasks().filter(t => t.repeat === 'daily' && !t.completed);
        if (dailyTasks.length >= 2 && hour >= 17) {
            nudges.push({
                key: 'daily_habits',
                priority: 55,
                type: 'daily_habit',
                text: `今日还有 **${dailyTasks.length} 个**每日习惯任务未完成，睡前记得打卡`,
                actions: [{ label: '查看安排', command: '今天有什么安排' }]
            });
        }

        return nudges
            .filter(n => UserMemory.shouldShowNudge(n.key))
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 2);
    }

    /**
     * 将 nudge 格式化为聊天消息
     * @param {Object} nudge
     * @returns {string}
     */
    static formatNudgeText(nudge) {
        return `💼 ${nudge.text}`;
    }
}
