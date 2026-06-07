/**
 * AI 工具执行器 - 将 Function Calling 映射到应用操作
 */
class ActionExecutor {
    /**
     * 执行指定工具
     * @param {string} name - 工具名称
     * @param {Object} args - 工具参数
     * @returns {Promise<Object>}
     */
    static async execute(name, args) {
        const handlers = {
            create_task: () => ActionExecutor.createTask(args),
            update_task: () => ActionExecutor.updateTask(args),
            delete_task: () => ActionExecutor.deleteTask(args),
            complete_task: () => ActionExecutor.completeTask(args),
            list_tasks: () => ActionExecutor.listTasks(args),
            add_subtask: () => ActionExecutor.addSubtask(args),
            complete_subtask: () => ActionExecutor.completeSubtask(args),
            add_task_diary: () => ActionExecutor.addTaskDiary(args),
            add_course: () => ActionExecutor.addCourse(args),
            delete_course: () => ActionExecutor.deleteCourse(args),
            list_schedule: () => ActionExecutor.listSchedule(args),
            get_today_schedule: () => ActionExecutor.getTodaySchedule(),
            set_reminder: () => ActionExecutor.setReminder(args),
            create_daily_reminder_task: () => ActionExecutor.createDailyReminderTask(args),
            delete_reminder: () => ActionExecutor.deleteReminder(args),
            list_reminders: () => ActionExecutor.listReminders(args),
            start_focus: () => ActionExecutor.startFocus(args),
            get_statistics: () => ActionExecutor.getStatistics(),
            switch_view: () => ActionExecutor.switchView(args),
            open_create_task_form: () => ActionExecutor.openCreateTaskForm(),
            trigger_schedule_import: () => ActionExecutor.triggerScheduleImport(),
            save_user_preference: () => ActionExecutor.saveUserPreference(args),
            remember_note: () => ActionExecutor.rememberNote(args),
            get_user_memory: () => ActionExecutor.getUserMemory(),
            suggest_daily_plan: () => ActionExecutor.suggestDailyPlan(args),
            get_secretary_nudges: () => ActionExecutor.getSecretaryNudges(),
            suggest_weekly_plan: () => ActionExecutor.suggestWeeklyPlan(args),
            get_weekly_review: () => ActionExecutor.getWeeklyReview(),
            update_reminder: () => ActionExecutor.updateReminder(args)
        };

        const handler = handlers[name];
        if (!handler) {
            return { success: false, error: `未知工具: ${name}` };
        }

        try {
            return await handler();
        } catch (error) {
            return { success: false, error: error.message || String(error) };
        }
    }

    /**
     * 构建当前应用上下文快照
     * @returns {Object}
     */
    static buildContext() {
        const tasks = ActionExecutor.getTasks();
        const courses = ActionExecutor.getCourses();
        const reminders = ActionExecutor.getReminders();
        const today = ActionExecutor.getLocalDateString(new Date());
        const pendingTasks = tasks.filter(t => !t.completed);

        return {
            taskCount: tasks.length,
            pendingCount: pendingTasks.length,
            todayDeadlineCount: pendingTasks.filter(t =>
                t.deadline && ActionExecutor.isSameDate(t.deadline, today)
            ).length,
            courseCount: courses.length,
            reminderCount: reminders.filter(r => !r.triggered).length,
            pendingTasks: pendingTasks.map(t => ({
                title: t.title,
                deadline: t.deadline || '无截止日期',
                priority: t.priority,
                subtaskCount: (t.subtasks || []).length
            })),
            todayCourses: courses.filter(c => String(c.day) === String(new Date().getDay())).map(c => c.name)
        };
    }

    /**
     * 获取本地日期字符串 YYYY-MM-DD（避免 UTC 时区偏差）
     * @param {Date} date
     * @returns {string}
     */
    static getLocalDateString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * 判断日期字符串是否为同一天
     * @param {string} dateStr
     * @param {string} targetDate - YYYY-MM-DD
     * @returns {boolean}
     */
    static isSameDate(dateStr, targetDate) {
        if (!dateStr) return false;
        return dateStr.split('T')[0] === targetDate;
    }

    /**
     * 计算距离截止日的天数
     * @param {string} deadline
     * @returns {number|null}
     */
    static daysUntil(deadline) {
        if (!deadline) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(deadline.split('T')[0]);
        target.setHours(0, 0, 0, 0);
        return Math.round((target - today) / (1000 * 60 * 60 * 24));
    }

    /** @returns {Array<Object>} */
    static getTasks() {
        return JSON.parse(UserStorage.getItem('tasks') || '[]');
    }

    /** @param {Array<Object>} tasks */
    static saveTasks(tasks) {
        UserStorage.setItem('tasks', JSON.stringify(tasks));
        if (window.taskManager) {
            window.taskManager.tasks = tasks;
            window.taskManager.renderTasks();
        }
        if (window.calendar) {
            window.calendar.renderCalendar();
        }
    }

    /** @returns {Array<Object>} */
    static getCourses() {
        return JSON.parse(UserStorage.getItem('courses') || '[]');
    }

    /** @param {Array<Object>} courses */
    static saveCourses(courses) {
        UserStorage.setItem('courses', JSON.stringify(courses));
        if (window.schedule) {
            window.schedule.courses = courses;
            window.schedule.saveCourses();
            window.schedule.renderSchedule();
            window.schedule.renderWeekStats();
        }
    }

    /** @returns {Array<Object>} */
    static getReminders() {
        return JSON.parse(UserStorage.getItem('reminders') || '[]');
    }

    /** @param {Array<Object>} reminders */
    static saveReminders(reminders) {
        UserStorage.setItem('reminders', JSON.stringify(reminders));
        if (window.calendar) {
            window.calendar.renderCalendar();
        }
        if (typeof ReminderScheduler !== 'undefined') {
            ReminderScheduler.scheduleAll();
        }
    }

    /**
     * 按关键词查找任务
     * @param {string} query
     * @param {Array<Object>|null} [tasks]
     * @returns {Object|null}
     */
    static findTask(query, tasks = null) {
        const list = tasks || ActionExecutor.getTasks();
        const q = query.toLowerCase().trim();

        let task = list.find(t => t.title.toLowerCase().includes(q))
            || list.find(t => q.includes(t.title.toLowerCase()));
        if (task) {
            return task;
        }

        const aliases = [
            q,
            q.replace(/软件/g, '软工'),
            q.replace(/作业/g, ''),
            q.replace(/任务/g, '')
        ].filter((item, index, arr) => item.length >= 2 && arr.indexOf(item) === index);

        for (const alias of aliases) {
            task = list.find(t => t.title.toLowerCase().includes(alias));
            if (task) {
                return task;
            }
        }

        if (typeof CourseMatcher !== 'undefined') {
            const course = CourseMatcher.matchInText(q, ActionExecutor.getCourses());
            if (course) {
                task = list.find(t =>
                    (t.courseName === course.name || (t.title || '').includes(course.name)) && !t.completed
                );
                if (task) {
                    return task;
                }
            }
        }

        return null;
    }

    /**
     * 按关键词查找课程
     * @param {string} query
     * @returns {Object|null}
     */
    static findCourse(query) {
        const courses = ActionExecutor.getCourses();
        if (typeof CourseMatcher !== 'undefined') {
            return CourseMatcher.findByQuery(query, courses);
        }

        const q = query.toLowerCase();
        return courses.find(c => c.name.toLowerCase().includes(q))
            || courses.find(c => q.includes(c.name.toLowerCase()));
    }

    /**
     * 创建任务
     * @param {Object} args
     * @returns {Object}
     */
    static createTask(args) {
        const repeat = args.repeat || 'none';
        const dailyReminderTime = args.daily_reminder_time || null;

        if (!args.course_name && !args.courseName && typeof TaskCreationFlow !== 'undefined') {
            const matchedCourse = TaskCreationFlow.matchCourseFromTitle(args.title || '');
            if (matchedCourse) {
                args.course_name = matchedCourse.name;
                args.course_id = matchedCourse.id;
            }
        }

        if (typeof TaskCreationFlow !== 'undefined' && repeat !== 'daily') {
            const validation = TaskCreationFlow.validateCreateArgs(args);
            if (!validation.ok) {
                const needParts = [];
                if (validation.missing.includes('deadline')) {
                    needParts.push('截止时间');
                }
                return {
                    success: false,
                    needMoreInfo: true,
                    missing: validation.missing,
                    matchedCourse: validation.courseName,
                    message: `课程作业「${args.title}」创建前还需补充：${needParts.join('、')}。子任务可选，用户说「无」时可留空。${validation.courseName ? `已匹配课程：${validation.courseName}。` : ''}`
                };
            }
            if (validation.courseName && !args.course_name) {
                args.course_name = validation.courseName;
            }
        }

        const enriched = typeof SubtaskTemplates !== 'undefined'
            ? SubtaskTemplates.enrichCreateArgs(args)
            : { args, autoApplied: false, subtasks: args.subtasks || [] };
        args = enriched.args;

        const task = {
            id: Date.now().toString(),
            title: args.title,
            completed: false,
            priority: args.priority || 'medium',
            deadline: args.deadline || null,
            repeat: repeat,
            dailyReminderTime: dailyReminderTime,
            createdAt: new Date().toISOString(),
            subtasks: (args.subtasks || []).map((title, i) => ({
                id: `${Date.now()}_${i}`,
                title,
                completed: false
            })),
            diary: [],
            duration: null,
            focusTime: 0,
            focusSessions: [],
            courseName: args.course_name || args.courseName || null,
            courseId: args.course_id || args.courseId || null
        };

        const tasks = ActionExecutor.getTasks();
        tasks.push(task);
        ActionExecutor.saveTasks(tasks);

        if (typeof UserMemory !== 'undefined') {
            UserMemory.recordTaskCreated({
                title: task.title,
                priority: task.priority,
                dailyReminderTime: dailyReminderTime
            });
        }

        if (repeat === 'daily' && dailyReminderTime) {
            ActionExecutor.setReminder({
                title: task.title,
                repeat: 'daily',
                time_of_day: dailyReminderTime
            });
        }

        return {
            success: true,
            message: `已创建任务「${task.title}」${task.courseName ? `，关联课程「${task.courseName}」` : ''}${enriched.autoApplied ? `，已自动拆分 ${task.subtasks.length} 个子任务` : task.subtasks.length ? `，含 ${task.subtasks.length} 个子任务` : ''}${task.deadline ? `，截止 ${new Date(task.deadline).toLocaleString('zh-CN')}` : ''}${repeat === 'daily' ? `，每日 ${dailyReminderTime} 提醒` : ''}`,
            task: { id: task.id, title: task.title, subtaskCount: task.subtasks.length, repeat, dailyReminderTime, courseName: task.courseName, deadline: task.deadline },
            autoSubtasks: enriched.autoApplied ? enriched.subtasks : []
        };
    }

    /**
     * 更新任务
     * @param {Object} args
     * @returns {Object}
     */
    static updateTask(args) {
        const tasks = ActionExecutor.getTasks();
        const task = ActionExecutor.findTask(args.task_query, tasks);
        if (!task) {
            return { success: false, error: `未找到任务「${args.task_query}」` };
        }

        if (args.title) task.title = args.title;
        if (args.priority) task.priority = args.priority;
        if (args.deadline !== undefined) task.deadline = args.deadline;
        if (args.course_name !== undefined) task.courseName = args.course_name;
        if (args.completed !== undefined) {
            task.completed = args.completed;
            if (task.completed) {
                task.completedAt = new Date().toISOString();
                if (typeof UserMemory !== 'undefined') {
                    UserMemory.recordTaskCompleted(task.title);
                }
            } else {
                task.completedAt = null;
            }
        }

        ActionExecutor.saveTasks(tasks);

        let message = `已更新任务「${task.title}」`;
        if (args.deadline !== undefined && task.deadline && typeof TaskCreationFlow !== 'undefined') {
            message += `，截止时间改为 ${TaskCreationFlow.formatDeadlineLabel(task.deadline)}`;
        }

        return {
            success: true,
            message,
            task: { id: task.id, title: task.title, deadline: task.deadline }
        };
    }

    /**
     * 删除任务
     * @param {Object} args
     * @returns {Object}
     */
    static deleteTask(args) {
        let tasks = ActionExecutor.getTasks();
        const task = ActionExecutor.findTask(args.task_query);
        if (!task) {
            return { success: false, error: `未找到任务「${args.task_query}」` };
        }

        const title = task.title;
        tasks = tasks.filter(t => t.id !== task.id);
        ActionExecutor.saveTasks(tasks);
        return { success: true, message: `已删除任务「${title}」` };
    }

    /**
     * 完成任务
     * @param {Object} args
     * @returns {Object}
     */
    static completeTask(args) {
        return ActionExecutor.updateTask({ task_query: args.task_query, completed: true });
    }

    /**
     * 列出任务
     * @param {Object} args
     * @returns {Object}
     */
    static listTasks(args) {
        let tasks = ActionExecutor.getTasks();
        const filter = args.filter || 'all';
        const today = new Date().toISOString().split('T')[0];

        if (filter === 'pending') {
            tasks = tasks.filter(t => !t.completed);
        } else if (filter === 'completed') {
            tasks = tasks.filter(t => t.completed);
        } else if (filter === 'today') {
            tasks = tasks.filter(t =>
                !t.completed && t.deadline && ActionExecutor.isSameDate(t.deadline, ActionExecutor.getLocalDateString(new Date()))
            );
        } else if (filter === 'high_priority') {
            tasks = tasks.filter(t => t.priority === 'high' && !t.completed);
        }

        return {
            success: true,
            count: tasks.length,
            tasks: tasks.map(t => ({
                id: t.id,
                title: t.title,
                completed: t.completed,
                priority: t.priority,
                deadline: t.deadline,
                subtaskCount: (t.subtasks || []).length
            }))
        };
    }

    /**
     * 添加子任务
     * @param {Object} args
     * @returns {Object}
     */
    static addSubtask(args) {
        const tasks = ActionExecutor.getTasks();
        const task = ActionExecutor.findTask(args.task_query, tasks);
        if (!task) {
            return { success: false, error: `未找到任务「${args.task_query}」` };
        }

        if (!task.subtasks) task.subtasks = [];
        task.subtasks.push({
            id: Date.now().toString(),
            title: args.subtask_title,
            completed: false
        });

        ActionExecutor.saveTasks(tasks);
        return { success: true, message: `已为「${task.title}」添加子任务「${args.subtask_title}」` };
    }

    /**
     * 完成子任务
     * @param {Object} args
     * @returns {Object}
     */
    static completeSubtask(args) {
        const tasks = ActionExecutor.getTasks();
        const task = ActionExecutor.findTask(args.task_query, tasks);
        if (!task || !task.subtasks) {
            return { success: false, error: `未找到任务「${args.task_query}」` };
        }

        const q = args.subtask_query.toLowerCase();
        const subtask = task.subtasks.find(s => s.title.toLowerCase().includes(q));
        if (!subtask) {
            return { success: false, error: `未找到子任务「${args.subtask_query}」` };
        }

        subtask.completed = true;
        ActionExecutor.saveTasks(tasks);
        return { success: true, message: `已完成子任务「${subtask.title}」` };
    }

    /**
     * 添加任务日记
     * @param {Object} args
     * @returns {Object}
     */
    static addTaskDiary(args) {
        const tasks = ActionExecutor.getTasks();
        const task = ActionExecutor.findTask(args.task_query, tasks);
        if (!task) {
            return { success: false, error: `未找到任务「${args.task_query}」` };
        }

        if (!task.diary) task.diary = [];
        task.diary.push({
            id: Date.now().toString(),
            content: args.content,
            date: new Date().toLocaleString('zh-CN')
        });

        ActionExecutor.saveTasks(tasks);
        return { success: true, message: `已为「${task.title}」添加日记` };
    }

    /**
     * 添加课程
     * @param {Object} args
     * @returns {Object}
     */
    static addCourse(args) {
        const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];
        const course = {
            id: Date.now().toString(),
            name: args.name,
            day: String(args.day),
            startPeriod: String(args.start_period),
            endPeriod: String(args.end_period),
            location: args.location || '',
            teacher: args.teacher || '',
            color: colors[Math.floor(Math.random() * colors.length)]
        };

        const courses = ActionExecutor.getCourses();
        courses.push(course);
        ActionExecutor.saveCourses(courses);

        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return {
            success: true,
            message: `已添加课程「${course.name}」`,
            course: {
                name: course.name,
                time: `${dayNames[parseInt(course.day)]} 第${course.startPeriod}-${course.endPeriod}节`
            }
        };
    }

    /**
     * 删除课程
     * @param {Object} args
     * @returns {Object}
     */
    static deleteCourse(args) {
        let courses = ActionExecutor.getCourses();
        const course = ActionExecutor.findCourse(args.course_query);
        if (!course) {
            return { success: false, error: `未找到课程「${args.course_query}」` };
        }

        const name = course.name;
        courses = courses.filter(c => c.id !== course.id);
        ActionExecutor.saveCourses(courses);
        return { success: true, message: `已删除课程「${name}」` };
    }

    /**
     * 查看课表
     * @param {Object} args
     * @returns {Object}
     */
    static listSchedule(args) {
        let courses = ActionExecutor.getCourses();
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

        if (args.day !== undefined && args.day !== null) {
            courses = courses.filter(c => String(c.day) === String(args.day));
        }

        return {
            success: true,
            count: courses.length,
            courses: courses.map(c => ({
                name: c.name,
                day: dayNames[parseInt(c.day)] || c.day,
                periods: `第${c.startPeriod}-${c.endPeriod}节`,
                location: c.location || '未设置',
                teacher: c.teacher || '未设置'
            }))
        };
    }

    /**
     * 获取今日综合安排
     * @returns {Object}
     */
    static getTodaySchedule() {
        const today = new Date();
        const todayDate = ActionExecutor.getLocalDateString(today);
        const todayDay = today.getDay();

        const courses = ActionExecutor.getCourses().filter(c => String(c.day) === String(todayDay));
        const allTasks = ActionExecutor.getTasks();
        const pendingTasks = allTasks.filter(t => !t.completed);

        const tasksDueToday = pendingTasks.filter(t =>
            t.deadline && ActionExecutor.isSameDate(t.deadline, todayDate)
        );

        const reminders = ActionExecutor.getReminders().filter(r => {
            if (r.triggered || !r.time) return false;
            return ActionExecutor.isSameDate(r.time, todayDate);
        });

        const mapTask = (t) => ({
            title: t.title,
            completed: t.completed,
            priority: t.priority,
            deadline: t.deadline || null,
            daysUntilDeadline: ActionExecutor.daysUntil(t.deadline),
            subtasks: (t.subtasks || []).map(s => ({
                title: s.title,
                completed: s.completed
            }))
        });

        return {
            success: true,
            date: today.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
            courses: courses.map(c => ({
                name: c.name,
                periods: `第${c.startPeriod}-${c.endPeriod}节`,
                location: c.location,
                teacher: c.teacher
            })),
            tasksDueToday: tasksDueToday.map(mapTask),
            pendingTasks: pendingTasks.map(mapTask),
            reminders: reminders.map(r => ({
                title: r.title,
                time: new Date(r.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            })),
            summary: {
                courseCount: courses.length,
                pendingTaskCount: pendingTasks.length,
                tasksDueTodayCount: tasksDueToday.length,
                reminderCount: reminders.length,
                note: 'pendingTaskCount=全部未完成待办；tasksDueTodayCount=仅今天截止的任务，两者不可混为一谈'
            },
            summaryText: ActionExecutor.buildTodaySummaryText(courses.length, pendingTasks.length, tasksDueToday.length, reminders.length)
        };
    }

    /**
     * 生成今日安排摘要文本（供 AI 引用，避免逻辑矛盾）
     * @param {number} courseCount
     * @param {number} pendingCount
     * @param {number} dueTodayCount
     * @param {number} reminderCount
     * @returns {string}
     */
    static buildTodaySummaryText(courseCount, pendingCount, dueTodayCount, reminderCount) {
        const parts = [];
        parts.push(`今日课程 ${courseCount} 门`);
        parts.push(`待办任务共 ${pendingCount} 项`);
        parts.push(`今日截止 ${dueTodayCount} 项`);
        parts.push(`今日提醒 ${reminderCount} 条`);
        if (pendingCount > 0 && dueTodayCount === 0) {
            parts.push('说明：有待办任务但今日无截止任务，不可说待办为空');
        }
        return parts.join('；');
    }

    /**
     * 设置提醒（支持相对时间、每日重复）
     * @param {Object} args
     * @returns {Object}
     */
    static setReminder(args) {
        let time = null;
        let repeat = args.repeat || 'none';
        let repeatTime = args.time_of_day || null;

        if (args.minutes_from_now) {
            time = new Date(Date.now() + args.minutes_from_now * 60 * 1000);
        } else         if (repeat === 'daily' && repeatTime) {
            time = ReminderScheduler.computeNextDailyTime(repeatTime);
            if (typeof UserMemory !== 'undefined') {
                const prefs = UserMemory.getSchedulePreferences();
                const [rh, rm] = repeatTime.split(':').map(Number);
                const [afterH, afterM] = (prefs.noRemindersAfter || '23:59').split(':').map(Number);
                const [beforeH] = (prefs.noRemindersBefore || '00:00').split(':').map(Number);
                const tMin = rh * 60 + rm;
                const afterMin = afterH * 60 + afterM;
                const beforeMin = beforeH * 60;
                if (tMin >= afterMin) {
                    return {
                        success: false,
                        error: `您设置了 ${prefs.noRemindersAfter} 后不提醒，请选更早的时间或修改偏好`
                    };
                }
                if (tMin < beforeMin) {
                    return {
                        success: false,
                        error: `您设置了 ${prefs.noRemindersBefore} 前不提醒，请选更晚的时间`
                    };
                }
            }
        } else if (args.time) {
            time = new Date(args.time);
        }

        if (!time || isNaN(time.getTime())) {
            return { success: false, error: `无效的时间：${args.time || args.time_of_day || ''}` };
        }

        if (time.getTime() <= Date.now() && repeat !== 'daily') {
            return { success: false, error: '提醒时间必须在未来，请检查时间是否正确' };
        }

        const reminder = {
            id: Date.now().toString(),
            title: args.title,
            time: time.toISOString(),
            createdAt: new Date().toISOString(),
            triggered: false,
            type: 'reminder',
            repeat: repeat,
            repeatTime: repeatTime
        };

        const reminders = ActionExecutor.getReminders();
        reminders.push(reminder);
        ActionExecutor.saveReminders(reminders);

        if (typeof ReminderManager !== 'undefined') {
            ReminderManager.syncToServiceWorker();
        }

        const timeLabel = repeat === 'daily'
            ? `每日 ${repeatTime}`
            : time.toLocaleString('zh-CN');

        return {
            success: true,
            message: `已设置提醒「${reminder.title}」`,
            reminder: {
                title: reminder.title,
                time: timeLabel,
                repeat: repeat
            }
        };
    }

    /**
     * 设置每日重复提醒（不创建待办任务）
     * @param {Object} args
     * @returns {Object}
     */
    static createDailyReminderTask(args) {
        return ActionExecutor.setReminder({
            title: args.title,
            repeat: 'daily',
            time_of_day: args.time_of_day
        });
    }

    /**
     * 删除提醒
     * @param {Object} args
     * @returns {Object}
     */
    static deleteReminder(args) {
        let reminders = ActionExecutor.getReminders();
        const q = args.reminder_query.toLowerCase();
        const initialLength = reminders.length;

        reminders = reminders.filter(r => {
            if (!r.title) return true;
            const title = r.title.toLowerCase();
            return !title.includes(q) && !q.includes(title);
        });

        if (reminders.length === initialLength) {
            return { success: false, error: `未找到提醒「${args.reminder_query}」` };
        }

        ActionExecutor.saveReminders(reminders);
        return { success: true, message: `已删除匹配的提醒` };
    }

    /**
     * 列出提醒
     * @param {Object} args
     * @returns {Object}
     */
    static listReminders(args) {
        args = args || {};
        let reminders = ActionExecutor.getReminders().filter(r => r.repeat === 'daily' || !r.triggered);

        if (args.date) {
            reminders = reminders.filter(r => {
                if (r.repeat === 'daily') return true;
                if (!r.time) return false;
                return ActionExecutor.getLocalDateString(new Date(r.time)) === args.date;
            });
        }

        const enriched = typeof ReminderManager !== 'undefined'
            ? reminders.map(r => ReminderManager.enrichReminder(r))
            : reminders;

        return {
            success: true,
            count: enriched.length,
            reminders: enriched.map(r => ({
                id: r.id,
                title: r.title,
                time: r.timeLabel || (r.time ? new Date(r.time).toLocaleString('zh-CN') : ''),
                repeat: r.repeat || 'none',
                nextTime: r.nextTimeLabel || null
            }))
        };
    }

    /**
     * 启动专注模式
     * @param {Object} args
     * @returns {Object}
     */
    static startFocus(args) {
        args = args || {};

        if (args.task_query) {
            const task = ActionExecutor.findTask(args.task_query);
            if (!task) {
                return { success: false, error: `未找到任务「${args.task_query}」` };
            }
            if (task.completed) {
                return { success: false, error: `任务「${task.title}」已完成，请选择其他待办任务` };
            }
            if (window.taskManager) {
                window.taskManager.startFocusMode(task.id);
            }
            if (typeof UserMemory !== 'undefined') {
                UserMemory.recordFocusStarted(task.title);
            }
            return { success: true, started: true, message: `已为「${task.title}」启动专注模式（25分钟）` };
        }

        const pending = ActionExecutor.getTasks().filter(t => !t.completed);

        if (pending.length === 0) {
            return { success: false, error: '暂无待办任务，请先创建任务再开始专注' };
        }

        if (pending.length === 1) {
            if (window.taskManager) {
                window.taskManager.startFocusMode(pending[0].id);
            }
            if (typeof UserMemory !== 'undefined') {
                UserMemory.recordFocusStarted(pending[0].title);
            }
            return { success: true, started: true, message: `已为「${pending[0].title}」启动专注模式（25分钟）` };
        }

        if (window.aiAssistant) {
            window.aiAssistant.showFocusTaskPicker(pending);
        }

        return {
            success: true,
            started: false,
            needSelection: true,
            message: `您有 ${pending.length} 个待办任务，请在弹窗中选择要专注的任务`,
            tasks: pending.map(t => ({ id: t.id, title: t.title, priority: t.priority }))
        };
    }

    /**
     * 获取统计数据
     * @returns {Object}
     */
    static getStatistics() {
        const tasks = ActionExecutor.getTasks();
        const completed = tasks.filter(t => t.completed).length;
        const pending = tasks.filter(t => !t.completed).length;
        const total = tasks.length;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const highPriority = tasks.filter(t => t.priority === 'high' && !t.completed).length;
        const focusSeconds = tasks.reduce((sum, t) => sum + (t.focusTime || 0), 0);

        if (typeof window.switchTab === 'function') {
            window.switchTab('statistics');
        }
        if (window.statistics) {
            setTimeout(() => window.statistics.renderCharts(), 200);
        }

        return {
            success: true,
            statistics: {
                total,
                completed,
                pending,
                completionRate: `${rate}%`,
                highPriorityPending: highPriority,
                totalFocusMinutes: Math.floor(focusSeconds / 60)
            }
        };
    }

    /**
     * 切换视图
     * @param {Object} args
     * @returns {Object}
     */
    static switchView(args) {
        const viewMap = {
            'ai-assistant': 'ai-assistant',
            'tasks': 'tasks',
            'schedule': 'schedule',
            'calendar': 'calendar',
            'statistics': 'statistics'
        };

        const tabId = viewMap[args.view];
        if (!tabId) {
            return { success: false, error: `未知视图: ${args.view}` };
        }

        if (typeof window.switchTab === 'function') {
            window.switchTab(tabId);
        }

        const tabBtn = document.querySelector(`[data-tab="${tabId}"]`);
        if (tabBtn) {
            tabBtn.click();
        }

        if (tabId === 'statistics' && window.statistics) {
            setTimeout(() => window.statistics.renderCharts(), 200);
        }

        const viewNames = {
            'ai-assistant': 'AI助手',
            'tasks': '任务管理',
            'schedule': '课程表',
            'calendar': '日历',
            'statistics': '数据统计'
        };

        return { success: true, message: `已切换到${viewNames[tabId]}视图` };
    }

    /**
     * 打开创建任务表单
     * @returns {Object}
     */
    static openCreateTaskForm() {
        if (window.taskManager) {
            window.taskManager.openCreateTaskModal();
        } else {
            document.getElementById('create-task-modal')?.classList.remove('hidden');
        }
        return { success: true, message: '已打开创建任务表单' };
    }

    /**
     * 触发课程表导入
     * @returns {Object}
     */
    static triggerScheduleImport() {
        const fileInput = document.getElementById('global-schedule-file-input')
            || document.getElementById('schedule-file-input');
        if (fileInput) {
            fileInput.click();
            return { success: true, message: '已打开文件选择器，请选择 JSON / TXT / PDF 格式的课程表文件' };
        }
        return { success: false, error: '找不到文件输入控件' };
    }

    /**
     * 保存用户偏好
     * @param {Object} args
     * @returns {Object}
     */
    static saveUserPreference(args) {
        if (typeof UserMemory === 'undefined') {
            return { success: false, error: '记忆模块未加载' };
        }
        return UserMemory.savePreference(args.key, args.value);
    }

    /**
     * 记住用户笔记
     * @param {Object} args
     * @returns {Object}
     */
    static rememberNote(args) {
        if (typeof UserMemory === 'undefined') {
            return { success: false, error: '记忆模块未加载' };
        }
        return UserMemory.rememberNote(args.note);
    }

    /**
     * 获取用户记忆快照
     * @returns {Object}
     */
    static getUserMemory() {
        if (typeof UserMemory === 'undefined') {
            return { success: false, error: '记忆模块未加载' };
        }
        return { success: true, memory: UserMemory.getMemorySnapshot() };
    }

    /**
     * 生成今日智能排程
     * @param {Object} [args]
     * @returns {Object}
     */
    static suggestDailyPlan(args) {
        args = args || {};
        const plan = SecretaryEngine.generateDailyPlan();
        const markdown = SecretaryEngine.formatDailyPlanMarkdown(plan);
        return {
            success: true,
            message: '已生成今日智能排程',
            plan,
            markdown,
            format: args.format || 'structured'
        };
    }

    /**
     * 获取助手型主动提醒
     * @returns {Object}
     */
    static getSecretaryNudges() {
        const nudges = SecretaryEngine.getProactiveNudges();
        return {
            success: true,
            count: nudges.length,
            nudges: nudges.map(n => ({
                type: n.type,
                text: n.text,
                actions: n.actions
            }))
        };
    }

    /**
     * 更新提醒
     * @param {Object} args
     * @returns {Object}
     */
    static updateReminder(args) {
        if (!args.reminder_id && !args.reminder_query) {
            return { success: false, error: '请提供 reminder_id 或 reminder_query' };
        }
        let id = args.reminder_id;
        if (!id && args.reminder_query) {
            const q = args.reminder_query.toLowerCase();
            const found = ActionExecutor.getReminders().find(r => r.title.toLowerCase().includes(q));
            if (!found) return { success: false, error: `未找到提醒「${args.reminder_query}」` };
            id = found.id;
        }
        return ReminderManager.updateReminder(id, {
            title: args.title,
            time_of_day: args.time_of_day,
            time: args.time
        });
    }

    /**
     * 生成本周计划
     * @returns {Object}
     */
    static suggestWeeklyPlan() {
        const plan = PlanningEngine.generateWeeklyPlan();
        return {
            success: true,
            plan,
            markdown: PlanningEngine.formatWeeklyPlanMarkdown(plan)
        };
    }

    /**
     * 获取本周复盘
     * @returns {Object}
     */
    static getWeeklyReview() {
        const markdown = WeeklyReview.generate();
        return { success: true, markdown };
    }
}
