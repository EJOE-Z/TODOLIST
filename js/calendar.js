class CalendarManager {
    constructor() {
        this.currentDate = new Date();
        this.selectedDate = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.currentDate = new Date();
        this.selectedDate = new Date();
        this.renderCalendar();
        this.populateYearSelect();
        this.showDayTasks(new Date());
        if (typeof ReminderScheduler !== 'undefined') {
            ReminderScheduler.scheduleAll();
        }
    }

    setupEventListeners() {
        document.getElementById('prev-month')?.addEventListener('click', () => this.prevMonth());
        document.getElementById('next-month')?.addEventListener('click', () => this.nextMonth());
        document.getElementById('today-btn')?.addEventListener('click', () => this.goToToday());
        document.getElementById('year-select')?.addEventListener('change', (e) => this.changeYear(e.target.value));
        document.getElementById('month-select')?.addEventListener('change', (e) => this.changeMonth(e.target.value));
    }

    populateYearSelect() {
        const select = document.getElementById('year-select');
        if (!select) return;

        const currentYear = new Date().getFullYear();
        select.innerHTML = '';

        for (let year = currentYear - 5; year <= currentYear + 5; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year + '年';
            if (year === this.currentDate.getFullYear()) {
                option.selected = true;
            }
            select.appendChild(option);
        }
    }

    prevMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.updateSelects();
        this.renderCalendar();
        this.syncDayTasksPanel();
    }

    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.updateSelects();
        this.renderCalendar();
        this.syncDayTasksPanel();
    }

    goToToday() {
        this.currentDate = new Date();
        this.selectedDate = new Date();
        this.updateSelects();
        this.renderCalendar();
        this.showDayTasks(new Date());
    }

    changeYear(year) {
        this.currentDate.setFullYear(parseInt(year, 10));
        this.renderCalendar();
        this.syncDayTasksPanel();
    }

    changeMonth(month) {
        this.currentDate.setMonth(parseInt(month, 10));
        this.renderCalendar();
        this.syncDayTasksPanel();
    }

    /**
     * 切换月份后，若选中日期不在当前月则提示重新选择
     */
    syncDayTasksPanel() {
        const title = document.getElementById('day-tasks-title');
        const list = document.getElementById('day-tasks-list');
        if (!title || !list || !this.selectedDate) return;

        const sameMonth = this.selectedDate.getFullYear() === this.currentDate.getFullYear()
            && this.selectedDate.getMonth() === this.currentDate.getMonth();

        if (sameMonth) {
            this.showDayTasks(this.selectedDate);
        } else {
            title.textContent = `${this.currentDate.getFullYear()}年${this.currentDate.getMonth() + 1}月 — 请点击日期查看详情`;
            list.innerHTML = '<div class="calendar-detail-empty">当前月份与已选日期不同，请在左侧日历选择日期</div>';
        }
    }

    updateSelects() {
        const yearSelect = document.getElementById('year-select');
        const monthSelect = document.getElementById('month-select');
        if (yearSelect) yearSelect.value = this.currentDate.getFullYear();
        if (monthSelect) monthSelect.value = this.currentDate.getMonth();
    }

    /**
     * @returns {Array<Object>}
     */
    getTasks() {
        return JSON.parse(UserStorage.getItem('tasks') || '[]');
    }

    /**
     * @returns {Array<Object>}
     */
    getReminders() {
        return JSON.parse(UserStorage.getItem('reminders') || '[]');
    }

    /**
     * 判断任务在指定日期是否应显示
     * @param {Object} task
     * @param {Date} date
     * @returns {boolean}
     */
    taskAppliesToDate(task, date) {
        if (task.completed) return false;

        const dayTs = DateUtils.dayTimestamp(date);

        if (task.repeat === 'daily') {
            const start = task.startDate
                ? DateUtils.parseLocalDate(task.startDate)
                : (task.createdAt ? DateUtils.parseLocalDate(task.createdAt) : null);
            if (start && dayTs < DateUtils.dayTimestamp(start)) return false;
            if (task.deadline) {
                const deadline = DateUtils.parseLocalDate(task.deadline);
                if (deadline && dayTs > DateUtils.dayTimestamp(deadline)) return false;
            }
            return true;
        }

        if (task.deadline) {
            const deadline = DateUtils.parseLocalDate(task.deadline);
            if (!deadline) return false;

            const start = task.startDate
                ? DateUtils.parseLocalDate(task.startDate)
                : (task.createdAt ? DateUtils.parseLocalDate(task.createdAt) : deadline);
            const startTs = start ? DateUtils.dayTimestamp(start) : dayTs;
            const deadlineTs = DateUtils.dayTimestamp(deadline);

            return dayTs >= startTs && dayTs <= deadlineTs;
        }

        if (task.createdAt) {
            const created = DateUtils.parseLocalDate(task.createdAt);
            return created ? dayTs >= DateUtils.dayTimestamp(created) : true;
        }

        return !task.completed;
    }

    /**
     * 获取指定日期的任务列表
     * @param {Date} date
     * @returns {Array<Object>}
     */
    getTasksOnDate(date) {
        return this.getTasks().filter(task => this.taskAppliesToDate(task, date));
    }

    /**
     * 获取指定日期的提醒列表
     * @param {Date} date
     * @returns {Array<Object>}
     */
    getRemindersOnDate(date) {
        const dateStr = DateUtils.formatLocalDate(date);

        return this.getReminders().filter(reminder => {
            if (reminder.repeat === 'daily' && reminder.repeatTime) {
                return true;
            }
            if (reminder.repeat === 'weekly' && reminder.repeatTime && reminder.repeatWeekday === date.getDay()) {
                return true;
            }
            if (reminder.triggered) return false;
            if (!reminder.time) return false;
            const reminderDate = DateUtils.parseLocalDate(reminder.time);
            return reminderDate && DateUtils.formatLocalDate(reminderDate) === dateStr;
        }).sort((a, b) => {
            const ta = a.repeatTime || (a.time ? a.time.slice(11, 16) : '99:99');
            const tb = b.repeatTime || (b.time ? b.time.slice(11, 16) : '99:99');
            return ta.localeCompare(tb);
        });
    }

    /**
     * 获取指定日期的课程
     * @param {Date} date
     * @returns {Array<Object>}
     */
    getCoursesOnDate(date) {
        const dayIndex = date.getDay();
        return JSON.parse(UserStorage.getItem('courses') || '[]')
            .filter(c => String(c.day) === String(dayIndex));
    }

    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        if (!grid) return;

        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDay = firstDay.getDay();

        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

        let html = `
            <div class="calendar-compact-grid">
                ${dayNames.map(name => `
                    <div class="calendar-weekday">${name}</div>
                `).join('')}
        `;

        for (let i = 0; i < startDay; i++) {
            html += '<div class="calendar-day-cell calendar-day-empty"></div>';
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = this.isToday(date);
            const isSelected = this.selectedDate && this.isSameDate(date, this.selectedDate);
            const dayTasks = this.getTasksOnDate(date);
            const dayReminders = this.getRemindersOnDate(date);
            const hasDiaries = typeof DiaryView !== 'undefined' && DiaryView.hasDiaryOnDate(date);
            const hasTasks = dayTasks.length > 0;
            const hasReminders = dayReminders.length > 0;
            const dateKey = DateUtils.formatLocalDate(date);

            html += `
                <div
                    class="calendar-day-cell${isToday ? ' calendar-day-today' : ''}${isSelected && !isToday ? ' calendar-day-selected' : ''}${hasTasks ? ' calendar-day-has-task' : ''}${hasReminders ? ' calendar-day-has-reminder' : ''}${hasDiaries ? ' calendar-day-has-diary' : ''}"
                    data-date="${dateKey}"
                    onclick="window.calendar.selectDate(new Date(${year}, ${month}, ${day}))">
                    <span class="calendar-day-num">${day}</span>
                    <div class="calendar-day-dots">
                        ${hasTasks ? '<span class="calendar-dot calendar-dot-task"></span>' : ''}
                        ${hasReminders ? '<span class="calendar-dot calendar-dot-reminder"></span>' : ''}
                        ${hasDiaries ? '<span class="calendar-dot calendar-dot-diary"></span>' : ''}
                    </div>
                </div>
            `;
        }

        html += '</div>';
        grid.innerHTML = html;
    }

    isToday(date) {
        return DateUtils.isSameLocalDay(date, new Date());
    }

    isSameDate(date1, date2) {
        return DateUtils.isSameLocalDay(date1, date2);
    }

    hasTasksOnDate(date) {
        return this.getTasksOnDate(date).length > 0;
    }

    hasRemindersOnDate(date) {
        return this.getRemindersOnDate(date).length > 0;
    }

    schedulePendingReminders() {
        if (typeof ReminderScheduler !== 'undefined') {
            ReminderScheduler.scheduleAll();
        }
    }

    selectDate(date) {
        this.selectedDate = date;
        this.renderCalendar();
        this.showDayTasks(date);
        if (window.diaryView?.isPanelOpen()) {
            window.diaryView.render();
        }
    }

    showDayTasks(date) {
        const title = document.getElementById('day-tasks-title');
        const list = document.getElementById('day-tasks-list');

        if (!title || !list) return;

        const dateStr = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        title.textContent = `${dateStr} 的任务和提醒`;

        const dayTasks = this.getTasksOnDate(date);
        const dayReminders = this.getRemindersOnDate(date);
        const dayCourses = this.getCoursesOnDate(date);

        let html = '';

        if (dayCourses.length > 0) {
            html += `
                <div class="calendar-detail-section">
                    <h3 class="calendar-detail-heading calendar-detail-course">
                        <i class="fa fa-book"></i> 课程 (${dayCourses.length})
                    </h3>
                    <div class="calendar-detail-list">
            `;
            dayCourses.forEach(c => {
                html += `
                    <div class="calendar-detail-item calendar-detail-item-course">
                        <div class="calendar-detail-item-main">
                            <div>
                                <h4>${c.name}</h4>
                                <p>第${c.startPeriod}-${c.endPeriod}节${c.location ? ` · ${c.location}` : ''}</p>
                            </div>
                        </div>
                    </div>`;
            });
            html += `</div></div>`;
        }

        if (dayReminders.length > 0) {
            html += `
                <div class="calendar-detail-section">
                    <h3 class="calendar-detail-heading calendar-detail-reminder">
                        <i class="fa fa-bell"></i> 提醒 (${dayReminders.length})
                    </h3>
                    <div class="calendar-detail-list">
            `;

            dayReminders.forEach(reminder => {
                const timeStr = reminder.repeatTime
                    || (reminder.time ? new Date(reminder.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '');
                let repeatLabel = '';
                if (reminder.repeat === 'daily') {
                    repeatLabel = ' · 每日';
                } else if (reminder.repeat === 'weekly') {
                    const dayLabel = typeof ReminderScheduler !== 'undefined'
                        ? ReminderScheduler.WEEKDAY_LABELS[reminder.repeatWeekday]
                        : '';
                    repeatLabel = dayLabel ? ` · 每周${dayLabel}` : ' · 每周';
                }
                html += `
                    <div class="calendar-detail-item calendar-detail-item-reminder">
                        <div class="calendar-detail-item-main">
                            <i class="fa fa-bell-o"></i>
                            <div>
                                <h4>${reminder.title}</h4>
                                <p>${timeStr}${repeatLabel}</p>
                            </div>
                        </div>
                        <div class="calendar-detail-item-actions">
                            <button type="button" class="calendar-detail-edit" onclick="window.reminderManagerUI?.openEdit('${reminder.id}')" title="编辑提醒">
                                <i class="fa fa-pencil"></i>
                            </button>
                            <button type="button" class="calendar-detail-delete" onclick="window.calendar.deleteReminder('${reminder.id}')" title="删除提醒">
                                <i class="fa fa-trash-o"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            html += `</div></div>`;
        }

        if (dayTasks.length > 0) {
            html += `
                <div class="calendar-detail-section">
                    <h3 class="calendar-detail-heading calendar-detail-task">
                        <i class="fa fa-calendar-check-o"></i> 任务 (${dayTasks.length})
                    </h3>
                    <div class="calendar-detail-list">
            `;

            dayTasks.forEach(task => {
                const priorityClass = task.priority === 'high' ? 'priority-high'
                    : task.priority === 'medium' ? 'priority-medium' : 'priority-low';
                const priorityText = task.priority === 'high' ? '高优先级'
                    : task.priority === 'medium' ? '中优先级' : '低优先级';
                let meta = priorityText;
                if (task.courseName) meta += ` · 📚 ${task.courseName}`;
                if (task.repeat === 'daily') {
                    meta += task.dailyReminderTime ? ` · 每日 ${task.dailyReminderTime}` : ' · 每日重复';
                } else if (task.deadline) {
                    const deadline = DateUtils.parseLocalDate(task.deadline);
                    if (deadline) {
                        meta += ` · 截止 ${deadline.getMonth() + 1}/${deadline.getDate()}`;
                        if (DateUtils.isSameLocalDay(deadline, date)) {
                            meta += ' ⚠️';
                        }
                    }
                }

                html += `
                    <div class="calendar-detail-item calendar-detail-item-task ${priorityClass}">
                        <div class="calendar-detail-item-main">
                            <div>
                                <h4 class="${task.completed ? 'line-through opacity-60' : ''}">${task.title}</h4>
                                <p>${meta}</p>
                            </div>
                        </div>
                        <input type="checkbox" ${task.completed ? 'checked' : ''}
                            onchange="window.calendar.toggleTaskCompletion('${task.id}')"
                            class="calendar-task-check">
                    </div>
                `;
            });

            html += `</div></div>`;
        }

        if (dayTasks.length === 0 && dayReminders.length === 0 && dayCourses.length === 0) {
            html = '<div class="calendar-detail-empty">这一天没有课程、任务和提醒</div>';
        }

        list.innerHTML = html;
    }

    toggleTaskCompletion(taskId) {
        const tasks = this.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            UserStorage.setItem('tasks', JSON.stringify(tasks));
            this.renderCalendar();
            if (this.selectedDate) {
                this.showDayTasks(this.selectedDate);
            }
            if (window.taskManager) {
                window.taskManager.tasks = tasks;
                window.taskManager.renderTasks();
            }
        }
    }

    deleteReminder(reminderId) {
        if (typeof ReminderManager !== 'undefined') {
            ReminderManager.deleteById(reminderId);
            return;
        }
        if (confirm('确定要删除这个提醒吗？')) {
            let reminders = this.getReminders();
            reminders = reminders.filter(r => r.id !== reminderId);
            ActionExecutor.saveReminders(reminders);
        }
    }
}
