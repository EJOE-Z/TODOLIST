/**
 * 课程作业类任务的创建引导（截止日、子任务、课表关联）
 */
class TaskCreationFlow {
    /** @type {RegExp} */
    static HOMEWORK_PATTERN = /作业|报告|实验|论文|设计|项目|大作业|小作业|assignment|homework|课程设计|实训/i;

    /**
     * 是否为课程作业类任务
     * @param {string} title
     * @returns {boolean}
     */
    static isHomeworkTask(title) {
        return TaskCreationFlow.HOMEWORK_PATTERN.test(title || '');
    }

    /**
     * 从标题匹配课表课程（最长匹配优先）
     * @param {string} title
     * @returns {Object|null}
     */
    static matchCourseFromTitle(title) {
        if (!title || typeof ActionExecutor === 'undefined') {
            return null;
        }

        const courses = ActionExecutor.getCourses();
        if (!courses.length) {
            return null;
        }

        if (typeof CourseMatcher !== 'undefined') {
            return CourseMatcher.matchInText(title, courses);
        }

        /** @type {Object|null} */
        let best = null;

        courses.forEach((course) => {
            const name = course.name || '';
            if (!name) {
                return;
            }
            if (title.includes(name) && (!best || name.length > best.name.length)) {
                best = course;
            }
        });

        return best;
    }

    /** @type {RegExp} */
    static TASK_ACTION_PATTERN = /^(删除|移除|去掉|删掉|取消|完成|标记|修改|更新|编辑|改)/;

    /**
     * 解析任务管理指令（删除/完成等），优先于创建流程
     * @param {string} message
     * @returns {{ action: 'delete'|'complete', query: string }|null}
     */
    static parseTaskCommand(message) {
        const trimmed = message.trim();
        if (!trimmed) {
            return null;
        }

        const deletePatterns = [
            /^删除(.+?)任务$/i,
            /^删除任务[：:\s]+(.+)$/i,
            /^删掉(.+?)任务$/i,
            /^移除(.+?)任务$/i,
            /^去掉(.+?)任务$/i,
            /^删除(.+)$/i
        ];

        for (const pattern of deletePatterns) {
            const match = trimmed.match(pattern);
            if (match) {
                const query = match[1].trim().replace(/任务$/i, '').trim();
                if (query) {
                    return { action: 'delete', query };
                }
            }
        }

        const completePatterns = [
            /^完成任务[：:\s]+(.+)$/i,
            /^完成(.+?)任务$/i,
            /^标记(.+?)为?已完成?$/i,
            /^标记完成[：:\s]+(.+)$/i
        ];

        for (const pattern of completePatterns) {
            const match = trimmed.match(pattern);
            if (match) {
                const query = match[1].trim().replace(/任务$/i, '').trim();
                if (query) {
                    return { action: 'complete', query };
                }
            }
        }

        const updateDeadline = TaskCreationFlow.parseTaskDeadlineUpdate(trimmed);
        if (updateDeadline) {
            return updateDeadline;
        }

        return null;
    }

    /**
     * 解析修改任务截止时间指令
     * @param {string} message
     * @returns {{ action: 'update_deadline', query: string, deadlineText: string }|null}
     */
    static parseTaskDeadlineUpdate(message) {
        const trimmed = message.trim();
        if (!/(修改|改成|改为|调整|更新|变更)/.test(trimmed)) {
            return null;
        }
        if (!/(截止|截至|deadline)/i.test(trimmed)) {
            return null;
        }

        const patterns = [
            /^(?:把|将)?(.+?)(?:的)?(?:截止(?:时间)?|截至(?:时间)?|deadline)(?:修改成|修改为|改成|改为|调整为|更新为|变更为?|修改)[：:\s]*(.+)$/i,
            /^修改(.+?)(?:的)?(?:截止(?:时间)?|截至(?:时间)?|deadline)(?:为|到|至|成)?[：:\s]*(.+)$/i
        ];

        for (const pattern of patterns) {
            const match = trimmed.match(pattern);
            if (match) {
                const query = match[1].trim().replace(/任务$/i, '').trim();
                const deadlineText = match[2].trim();
                if (query && deadlineText) {
                    return { action: 'update_deadline', query, deadlineText };
                }
            }
        }

        return null;
    }

    /**
     * 是否为任务管理指令（非创建）
     * @param {string} message
     * @returns {boolean}
     */
    static isTaskManagementCommand(message) {
        return TaskCreationFlow.parseTaskCommand(message) !== null;
    }

    /**
     * 从用户消息提取任务标题
     * @param {string} message
     * @returns {string|null}
     */
    static extractTaskTitle(message) {
        const trimmed = message.trim();
        if (!trimmed || /^(创建|添加|新建).*任务$/i.test(trimmed)) {
            return null;
        }

        if (TaskCreationFlow.isTaskManagementCommand(trimmed)) {
            return null;
        }

        if (/(修改|改成|改为|调整|更新|变更).*(截止|截至|deadline)/i.test(trimmed)) {
            return null;
        }

        if (TaskCreationFlow.TASK_ACTION_PATTERN.test(trimmed) && !TaskCreationFlow.isHomeworkTask(trimmed)) {
            return null;
        }

        const explicit = trimmed.match(/(?:创建|添加|新建|我要|帮我).{0,8}任务[：:\s]+(.+)/i);
        if (explicit) {
            const title = explicit[1].trim();
            if (TaskCreationFlow.isTaskManagementCommand(title)) {
                return null;
            }
            return title;
        }

        if (TaskCreationFlow.isHomeworkTask(trimmed) && trimmed.length >= 4 && trimmed.length <= 60) {
            return trimmed;
        }

        const course = TaskCreationFlow.matchCourseFromTitle(trimmed);
        if (course && /^(完成|写|做|提交|准备|复习)/i.test(trimmed) && !/^(删除|移除|完成.+任务)/i.test(trimmed)) {
            return trimmed;
        }

        return null;
    }

    /**
     * 初始化作业任务草稿
     * @param {string} title
     * @returns {Object|null}
     */
    static initiateDraft(title) {
        const normalizedTitle = title.trim();
        if (!normalizedTitle) {
            return null;
        }

        const course = TaskCreationFlow.matchCourseFromTitle(normalizedTitle);
        const isHomework = TaskCreationFlow.isHomeworkTask(normalizedTitle) || !!course;
        if (!isHomework) {
            return null;
        }

        return {
            step: 'deadline',
            title: normalizedTitle,
            courseName: course ? course.name : null,
            courseId: course ? course.id : null,
            deadline: null,
            subtasks: [],
            priority: 'medium'
        };
    }

    /**
     * 格式化课程关联说明
     * @param {Object} draft
     * @returns {string}
     */
    static formatCourseHint(draft) {
        if (!draft.courseName) {
            return '📚 暂未在课表中匹配到对应课程。若有关联课程，创建后可在任务中补充。';
        }

        const course = ActionExecutor.getCourses().find(c => c.id === draft.courseId)
            || ActionExecutor.findCourse(draft.courseName);
        if (!course) {
            return `📚 已关联课程：**${draft.courseName}**`;
        }

        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const dayLabel = dayNames[parseInt(course.day, 10)] || '';
        const timeLabel = `第${course.startPeriod}-${course.endPeriod}节`;
        const location = course.location ? ` · ${course.location}` : '';
        return `📚 已关联课程：**${course.name}**（${dayLabel} ${timeLabel}${location}）`;
    }

    /**
     * 询问截止时间
     * @param {Object} draft
     * @returns {string}
     */
    static formatDeadlinePrompt(draft) {
        return [
            `好的，我来帮您创建「${draft.title}」。`,
            '',
            TaskCreationFlow.formatCourseHint(draft),
            '',
            '请问这项任务的**截止时间**是什么时候？',
            '例如：`6月12日`、`下周五 18:00`、`下周本课程上课前`'
        ].join('\n');
    }

    /**
     * 获取节次时间表
     * @returns {Array<{ period: number, start: string, end: string }>}
     */
    static getTimeSlots() {
        if (window.schedule?.timeSlots?.length) {
            return window.schedule.timeSlots;
        }
        try {
            const saved = JSON.parse(UserStorage.getItem('timeSlots') || 'null');
            if (Array.isArray(saved) && saved.length) {
                return saved;
            }
        } catch (e) {
            /* ignore */
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
     * 获取某节次开始/结束时间
     * @param {number} period
     * @param {'start'|'end'} type
     * @returns {string}
     */
    static getPeriodTime(period, type = 'start') {
        const slots = TaskCreationFlow.getTimeSlots();
        const slot = slots.find(s => parseInt(s.period, 10) === period) || slots[period - 1];
        if (!slot) {
            return type === 'end' ? '23:59' : '08:00';
        }
        return type === 'end' ? slot.end : slot.start;
    }

    /**
     * 对齐到所在周的周一
     * @param {Date} date
     * @returns {Date}
     */
    static normalizeToMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /**
     * 获取指定周偏移下课程上课日期
     * @param {number} weekOffset - 0=本周，1=下周
     * @param {number} courseDay - 0=周日 … 6=周六
     * @returns {Date}
     */
    static getCourseDateInWeek(weekOffset, courseDay) {
        /** @type {Date} */
        let monday;
        if (window.schedule?.firstWeekDate) {
            monday = TaskCreationFlow.normalizeToMonday(new Date(window.schedule.firstWeekDate));
            monday.setDate(monday.getDate() + ((window.schedule.currentWeekOffset || 0) + weekOffset) * 7);
        } else {
            monday = TaskCreationFlow.normalizeToMonday(new Date());
            monday.setDate(monday.getDate() + weekOffset * 7);
        }

        const dayOffset = courseDay === 0 ? 6 : courseDay - 1;
        const result = new Date(monday);
        result.setDate(result.getDate() + dayOffset);
        return result;
    }

    /**
     * 将 HH:mm 应用到日期
     * @param {Date} date
     * @param {string} timeStr
     * @returns {Date}
     */
    static applyTimeToDate(date, timeStr) {
        const match = String(timeStr).match(/(\d{1,2}):(\d{2})/);
        const hours = match ? parseInt(match[1], 10) : 23;
        const minutes = match ? parseInt(match[2], 10) : 59;
        date.setHours(hours, minutes, 0, 0);
        return date;
    }

    /**
     * 根据关联课程解析「上课前/下课后」类截止时间
     * @param {string} text
     * @param {Object} draft
     * @returns {string|null}
     */
    static parseCourseRelativeDeadline(text, draft) {
        const trimmed = text.trim();
        const course = ActionExecutor.getCourses().find(c => c.id === draft.courseId)
            || ActionExecutor.findCourse(draft.courseName || '');
        if (!course) {
            return null;
        }

        const isCourseRelative = /(上课前|课前|下课后|课后|下节课|这节课|本课程|这门课|该课程|这科|本课)/.test(trimmed);
        if (!isCourseRelative) {
            return null;
        }

        const courseDay = parseInt(course.day, 10);
        const startPeriod = parseInt(course.startPeriod, 10);
        const endPeriod = parseInt(course.endPeriod, 10);
        const beforeClass = /(上课前|课前|下节课前|下次上课前)/.test(trimmed);
        const afterClass = /(下课后|课后)/.test(trimmed);

        /** @type {number|null} */
        let weekOffset = null;
        if (/下下周/.test(trimmed)) {
            weekOffset = 2;
        } else if (/下周/.test(trimmed)) {
            weekOffset = 1;
        } else if (/本周|这周/.test(trimmed)) {
            weekOffset = 0;
        }

        /** @type {Date|null} */
        let classDate = null;

        if (weekOffset !== null) {
            classDate = TaskCreationFlow.getCourseDateInWeek(weekOffset, courseDay);
        } else {
            const now = new Date();
            for (let offset = 0; offset <= 3; offset++) {
                const candidate = TaskCreationFlow.getCourseDateInWeek(offset, courseDay);
                TaskCreationFlow.applyTimeToDate(
                    candidate,
                    beforeClass || !afterClass
                        ? TaskCreationFlow.getPeriodTime(startPeriod, 'start')
                        : TaskCreationFlow.getPeriodTime(endPeriod, 'end')
                );
                if (candidate.getTime() > now.getTime()) {
                    classDate = candidate;
                    break;
                }
            }
        }

        if (!classDate) {
            classDate = TaskCreationFlow.getCourseDateInWeek(weekOffset ?? 1, courseDay);
        }

        const timeStr = afterClass
            ? TaskCreationFlow.getPeriodTime(endPeriod, 'end')
            : TaskCreationFlow.getPeriodTime(startPeriod, 'start');

        TaskCreationFlow.applyTimeToDate(classDate, timeStr);

        if (beforeClass || !afterClass) {
            classDate.setMinutes(classDate.getMinutes() - 1);
        }

        return classDate.toISOString();
    }

    /**
     * 格式化截止时间展示
     * @param {string} isoString
     * @returns {string}
     */
    static formatDeadlineLabel(isoString) {
        return new Date(isoString).toLocaleString('zh-CN', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 询问具体作业内容
     * @param {Object} draft
     * @returns {string}
     */
    static formatSubtasksPrompt(draft) {
        const deadlineText = draft.deadline
            ? TaskCreationFlow.formatDeadlineLabel(draft.deadline)
            : '未设置';

        return [
            `截止时间：**${deadlineText}**`,
            '',
            '请告诉我**具体要做什么**，我会拆成子任务（可选）。',
            '可以一次说多项，用逗号或换行分隔；若暂时没有，回复 **无** 或 **跳过** 即可。',
            '例如：',
            '- 完成需求分析报告',
            '- 绘制用例图',
            '- 提交实验代码'
        ].join('\n');
    }

    /**
     * 用户是否选择跳过子任务
     * @param {string} text
     * @returns {boolean}
     */
    static isSubtasksSkipped(text) {
        const trimmed = text.trim();
        return !trimmed || /^(跳过|稍后|无|暂无|没有|不需要|不必|暂不|none|no)$/i.test(trimmed);
    }

    /**
     * 完成草稿并创建任务
     * @param {Object} draft
     * @returns {string}
     */
    static finalizeDraft(draft) {
        const result = ActionExecutor.createTask({
            title: draft.title,
            deadline: draft.deadline,
            subtasks: draft.subtasks || [],
            course_name: draft.courseName,
            course_id: draft.courseId,
            priority: draft.priority,
            force: true
        });

        if (!result.success) {
            return `❌ ${result.error || result.message}`;
        }

        const subtasks = draft.subtasks || [];
        const parts = [
            `✅ 已创建任务「${draft.title}」`,
            draft.courseName ? `📚 关联课程：${draft.courseName}` : '',
            draft.deadline ? `📅 截止：${TaskCreationFlow.formatDeadlineLabel(draft.deadline)}` : ''
        ];

        if (subtasks.length) {
            parts.push(`📝 子任务 ${subtasks.length} 项：`);
            subtasks.forEach((item, index) => parts.push(`${index + 1}. ${item}`));
        } else {
            parts.push('📝 未添加子任务，之后可在任务详情中补充。');
        }

        return parts.filter(Boolean).join('\n');
    }

    /**
     * 从文本提取时分（支持 19:00、晚上19点、19点30分 等）
     * @param {string} text
     * @returns {{ hour: number, minute: number }|null}
     */
    static extractTimeFromText(text) {
        const trimmed = text.trim();

        let match = trimmed.match(/(\d{1,2})[:：](\d{2})/);
        if (match) {
            return { hour: parseInt(match[1], 10), minute: parseInt(match[2], 10) };
        }

        match = trimmed.match(/(\d{1,2})点(\d{1,2})分/);
        if (match) {
            return { hour: parseInt(match[1], 10), minute: parseInt(match[2], 10) };
        }

        match = trimmed.match(/(\d{1,2})点半/);
        if (match) {
            let hour = parseInt(match[1], 10);
            hour = TaskCreationFlow.normalizeHourWithPeriod(hour, trimmed);
            return { hour, minute: 30 };
        }

        match = trimmed.match(/(?:晚上|夜间|傍晚|午夜)?(\d{1,2})[点时](?:整)?/);
        if (match) {
            let hour = parseInt(match[1], 10);
            hour = TaskCreationFlow.normalizeHourWithPeriod(hour, trimmed);
            return { hour, minute: 0 };
        }

        match = trimmed.match(/(?:上午|早上|清晨|中午|下午|晚上|夜间|傍晚)(\d{1,2})/);
        if (match) {
            let hour = parseInt(match[1], 10);
            hour = TaskCreationFlow.normalizeHourWithPeriod(hour, trimmed);
            return { hour, minute: 0 };
        }

        return null;
    }

    /**
     * 结合上午/下午/晚上修正小时
     * @param {number} hour
     * @param {string} text
     * @returns {number}
     */
    static normalizeHourWithPeriod(hour, text) {
        if (/中午/.test(text) && hour <= 2) {
            return 12;
        }
        if (/下午|晚上|夜间|傍晚/.test(text) && hour >= 1 && hour <= 11) {
            return hour + 12;
        }
        if (/晚上|夜间|傍晚/.test(text) && hour === 12) {
            return 12;
        }
        return hour;
    }

    /**
     * 规范化截止时间文本
     * @param {string} text
     * @returns {string}
     */
    static normalizeDeadlineText(text) {
        return text
            .replace(/(\d{1,2})[.\-/](\d{1,2})(?![.\-\d])/g, (_, month, day) => `${month}月${day}日`)
            .replace(/截至/g, '截止');
    }

    /**
     * 解析截止时间
     * @param {string} text
     * @param {Object|null} [draft]
     * @returns {string|null}
     */
    static parseDeadline(text, draft = null) {
        const trimmed = TaskCreationFlow.normalizeDeadlineText(text.trim());
        if (!trimmed || /^(跳过|不设|无|暂无|不知道)$/i.test(trimmed)) {
            return null;
        }

        if (draft && (draft.courseId || draft.courseName)) {
            const courseDeadline = TaskCreationFlow.parseCourseRelativeDeadline(trimmed, draft);
            if (courseDeadline) {
                return courseDeadline;
            }
        }

        const isoMatch = trimmed.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (isoMatch) {
            const time = TaskCreationFlow.extractTimeFromText(trimmed);
            const date = new Date(
                parseInt(isoMatch[1], 10),
                parseInt(isoMatch[2], 10) - 1,
                parseInt(isoMatch[3], 10),
                time ? time.hour : 23,
                time ? time.minute : 59,
                0
            );
            if (!isNaN(date.getTime())) {
                return date.toISOString();
            }
        }

        const cnMatch = trimmed.match(/(\d{1,2})月(\d{1,2})日/);
        if (cnMatch) {
            const now = new Date();
            const time = TaskCreationFlow.extractTimeFromText(trimmed);
            const date = new Date(
                now.getFullYear(),
                parseInt(cnMatch[1], 10) - 1,
                parseInt(cnMatch[2], 10),
                time ? time.hour : 23,
                time ? time.minute : 59,
                0
            );
            if (!isNaN(date.getTime())) {
                return date.toISOString();
            }
        }

        const now = new Date();
        const base = new Date(now);

        if (/后天/.test(trimmed)) {
            base.setDate(base.getDate() + 2);
        } else if (/大后天/.test(trimmed)) {
            base.setDate(base.getDate() + 3);
        } else if (/明天/.test(trimmed)) {
            base.setDate(base.getDate() + 1);
        } else if (/下周五/.test(trimmed)) {
            const day = base.getDay();
            const diff = day <= 5 ? 5 - day + 7 : 5 - day + 14;
            base.setDate(base.getDate() + diff);
        } else if (/本周五|这周五/.test(trimmed)) {
            const day = base.getDay();
            const diff = day <= 5 ? 5 - day : 5 - day + 7;
            base.setDate(base.getDate() + diff);
        } else if (/下周四/.test(trimmed)) {
            const day = base.getDay();
            const diff = day <= 4 ? 4 - day + 7 : 4 - day + 14;
            base.setDate(base.getDate() + diff);
        } else if (/本周四|这周四/.test(trimmed)) {
            const day = base.getDay();
            const diff = day <= 4 ? 4 - day : 4 - day + 7;
            base.setDate(base.getDate() + diff);
        } else if (/下周/.test(trimmed)) {
            return null;
        } else {
            const parsed = Date.parse(trimmed);
            if (!isNaN(parsed)) {
                return new Date(parsed).toISOString();
            }
            return null;
        }

        const time = TaskCreationFlow.extractTimeFromText(trimmed);
        if (time) {
            base.setHours(time.hour, time.minute, 0, 0);
        } else {
            base.setHours(23, 59, 0, 0);
        }

        return base.toISOString();
    }

    /**
     * 解析子任务列表
     * @param {string} text
     * @returns {Array<string>}
     */
    static parseSubtasks(text) {
        const trimmed = text.trim();
        if (TaskCreationFlow.isSubtasksSkipped(trimmed)) {
            return [];
        }

        return trimmed
            .split(/[\n,，、;；]+/)
            .map(item => item.replace(/^[-*•\d]+[.、)）]\s*/, '').trim())
            .filter(item => item.length >= 2);
    }

    /**
     * 推进草稿流程
     * @param {AIAssistant} assistant
     * @param {string} message
     * @returns {string|null}
     */
    static advanceDraft(assistant, message) {
        const draft = assistant.taskDraft;
        if (!draft) {
            return null;
        }

        const trimmed = message.trim();
        if (/^取消$/i.test(trimmed)) {
            assistant.taskDraft = null;
            return '好的，已取消创建任务。';
        }

        if (draft.step === 'title') {
            const nextDraft = TaskCreationFlow.initiateDraft(trimmed);
            if (!nextDraft) {
                const result = ActionExecutor.createTask({ title: trimmed, force: true });
                assistant.taskDraft = null;
                return result.success ? `✅ ${result.message}` : `❌ ${result.error || result.message}`;
            }
            assistant.taskDraft = nextDraft;
            return TaskCreationFlow.formatDeadlinePrompt(nextDraft);
        }

        if (draft.step === 'deadline') {
            const deadline = TaskCreationFlow.parseDeadline(trimmed, draft);
            if (!deadline) {
                return '我没有识别到有效的截止时间，请再说一次，例如：`6月12日`、`下周五 18:00`、`下周本课程上课前`。';
            }
            draft.deadline = deadline;
            draft.step = 'subtasks';
            return TaskCreationFlow.formatSubtasksPrompt(draft);
        }

        if (draft.step === 'subtasks') {
            draft.subtasks = TaskCreationFlow.parseSubtasks(trimmed);
            const reply = TaskCreationFlow.finalizeDraft(draft);
            assistant.taskDraft = null;
            return reply;
        }

        assistant.taskDraft = null;
        return null;
    }

    /**
     * 校验 create_task 参数是否完整
     * @param {Object} args
     * @returns {{ ok: boolean, missing: Array<string>, courseName: string|null }}
     */
    static validateCreateArgs(args) {
        const course = args.course_name || args.courseName
            ? { name: args.course_name || args.courseName }
            : TaskCreationFlow.matchCourseFromTitle(args.title || '');

        const courseName = course ? course.name : null;
        const isHomework = TaskCreationFlow.isHomeworkTask(args.title || '') || !!courseName;
        if (!isHomework || args.force || args.repeat === 'daily') {
            return { ok: true, missing: [], courseName };
        }

        /** @type {Array<string>} */
        const missing = [];
        if (!args.deadline) {
            missing.push('deadline');
        }

        return { ok: missing.length === 0, missing, courseName };
    }
}
