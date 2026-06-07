class ScheduleManager {
    constructor() {
        this.courses = this.loadCourses();
        this.timeSlots = this.getDefaultTimeSlots();
        this.currentWeekOffset = 0;
        this.firstWeekDate = this.loadFirstWeekDate();
        this.currentCourseId = null;
        this.init();
    }

    loadCourses() {
        return JSON.parse(UserStorage.getItem('courses')) || [];
    }

    loadFirstWeekDate() {
        const saved = UserStorage.getItem('firstWeekDate');
        const date = saved ? new Date(saved) : this.getFirstWeekOfMonth();
        return this.normalizeToMonday(date);
    }

    /**
     * 将日期对齐到所在周的周一
     * @param {Date} date
     * @returns {Date}
     */
    normalizeToMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        if (day !== 1) {
            const diff = day === 0 ? -6 : 1 - day;
            d.setDate(d.getDate() + diff);
        }
        return d;
    }

    saveFirstWeekDate(date) {
        UserStorage.setItem('firstWeekDate', date.toISOString().split('T')[0]);
        this.firstWeekDate = date;
    }

    getFirstWeekOfMonth() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const dayOfWeek = firstDay.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        return new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + mondayOffset);
    }

    getDefaultTimeSlots() {
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

    saveCourses() {
        UserStorage.setItem('courses', JSON.stringify(this.courses));
    }

    init() {
        this.setupEventListeners();
        this.goToCurrentWeek();
        this.renderSchedule();
        this.renderWeekStats();
        this.updateWeekNavigation();
    }

    /**
     * 跳转到包含今天的那一周
     */
    goToCurrentWeek() {
        const todayMonday = this.normalizeToMonday(new Date());
        const firstMonday = this.normalizeToMonday(new Date(this.firstWeekDate));
        const diffMs = todayMonday.getTime() - firstMonday.getTime();
        this.currentWeekOffset = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
        this.updateWeekNavigation();
    }

    setupEventListeners() {
        document.getElementById('add-course-btn')?.addEventListener('click', () => this.openAddCourseModal());
        document.getElementById('save-course')?.addEventListener('click', () => this.saveCourse());
        document.getElementById('cancel-course')?.addEventListener('click', () => this.closeCourseModal());
        document.getElementById('close-course-modal')?.addEventListener('click', () => this.closeCourseModal());

        document.getElementById('prev-week-btn')?.addEventListener('click', () => this.prevWeek());
        document.getElementById('next-week-btn')?.addEventListener('click', () => this.nextWeek());
        document.getElementById('current-week-btn')?.addEventListener('click', () => {
            this.goToCurrentWeek();
            this.renderSchedule();
            this.renderWeekStats();
        });
        document.getElementById('week-settings-btn')?.addEventListener('click', () => this.openWeekSettingsModal());
        document.getElementById('save-week-settings')?.addEventListener('click', () => this.saveWeekSettings());
        document.getElementById('cancel-week-settings')?.addEventListener('click', () => this.closeWeekSettingsModal());

        document.getElementById('time-settings-btn')?.addEventListener('click', () => this.openTimeSettingsModal());
        document.getElementById('save-time-settings')?.addEventListener('click', () => this.saveTimeSettings());
        document.getElementById('cancel-time-settings')?.addEventListener('click', () => this.closeTimeSettingsModal());
        document.getElementById('close-time-settings-modal')?.addEventListener('click', () => this.closeTimeSettingsModal());
        document.getElementById('reset-time-settings')?.addEventListener('click', () => this.resetTimeSettings());

        document.getElementById('import-schedule-btn')?.addEventListener('click', () => {
            document.getElementById('schedule-file-input')?.click();
        });
        document.getElementById('schedule-file-input')?.addEventListener('change', (e) => this.importSchedule(e));

        document.getElementById('close-course-detail-modal')?.addEventListener('click', () => this.closeCourseDetailModal());
    }

    getCurrentWeekDates() {
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(this.firstWeekDate);
            date.setDate(date.getDate() + this.currentWeekOffset * 7 + i);
            dates.push(date);
        }
        return dates;
    }

    updateWeekNavigation() {
        const dates = this.getCurrentWeekDates();
        const startDate = dates[0];
        const endDate = dates[6];
        
        const format = (date) => {
            return `${date.getMonth() + 1}月${date.getDate()}日`;
        };
        
        const currentWeekEl = document.getElementById('current-week');
        if (currentWeekEl) currentWeekEl.textContent = `${format(startDate)} - ${format(endDate)}`;
    }

    prevWeek() {
        this.currentWeekOffset--;
        this.updateWeekNavigation();
        this.renderSchedule();
        this.renderWeekStats();
    }

    nextWeek() {
        this.currentWeekOffset++;
        this.updateWeekNavigation();
        this.renderSchedule();
        this.renderWeekStats();
    }

    /**
     * 课表列顺序：周一至周日（与 course.day 取值一致：1=周一 … 0=周日）
     * @returns {Array<{ day: number, label: string }>}
     */
    getDayColumns() {
        return [
            { day: 1, label: '周一' },
            { day: 2, label: '周二' },
            { day: 3, label: '周三' },
            { day: 4, label: '周四' },
            { day: 5, label: '周五' },
            { day: 6, label: '周六' },
            { day: 0, label: '周日' }
        ];
    }

    /**
     * 当前查看周的单双周类型
     * @returns {'odd'|'even'}
     */
    getCurrentWeekParity() {
        const weekNumber = Math.abs(this.currentWeekOffset) + 1;
        return weekNumber % 2 === 1 ? 'odd' : 'even';
    }

    /**
     * 判断课程在当前周是否应显示
     * @param {Object} course
     * @returns {boolean}
     */
    isCourseVisible(course) {
        const start = parseInt(course.startPeriod, 10);
        const end = parseInt(course.endPeriod, 10);
        if (isNaN(start) || isNaN(end) || start < 1 || end > this.timeSlots.length || start > end) {
            return false;
        }

        const weekType = String(course.weekType || 'all').toLowerCase();
        if (weekType === 'all') {
            return true;
        }
        return weekType === this.getCurrentWeekParity();
    }

    /**
     * 查找某天某节次在课表上显示的课程（与网格渲染逻辑一致）
     * @param {number} day
     * @param {number} period
     * @returns {Object|null}
     */
    findCourseAtSlot(day, period) {
        return this.courses.find(c => {
            if (!this.isCourseVisible(c)) {
                return false;
            }
            if (parseInt(c.day, 10) !== day) {
                return false;
            }
            const start = parseInt(c.startPeriod, 10);
            const end = parseInt(c.endPeriod, 10);
            return start <= period && end >= period;
        }) || null;
    }

    /**
     * 获取某天在课表上实际显示的课程（去重）
     * @param {number} day
     * @returns {Array<Object>}
     */
    getDisplayedCoursesForDay(day) {
        const seen = new Set();
        /** @type {Array<Object>} */
        const list = [];

        this.timeSlots.forEach((slot) => {
            const course = this.findCourseAtSlot(day, slot.period);
            if (course && !seen.has(course.id)) {
                seen.add(course.id);
                list.push(course);
            }
        });

        return list;
    }

    renderSchedule() {
        const tbody = document.getElementById('schedule-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        this.timeSlots.forEach((slot) => {
            const row = document.createElement('tr');
            row.className = 'schedule-row';

            row.innerHTML = `
                <td class="schedule-time-cell">
                    <div class="schedule-period-label">第${slot.period}节</div>
                    <div class="schedule-period-time">${slot.start}-${slot.end}</div>
                </td>
                ${this.renderDayCells(slot.period)}
            `;

            tbody.appendChild(row);
        });
    }

    /**
     * 渲染某一节次下周一至周日单元格
     * @param {number} period - 节次
     * @returns {string}
     */
    renderDayCells(period) {
        const dates = this.getCurrentWeekDates();

        return this.getDayColumns().map((col, colIndex) => {
            const date = dates[colIndex];
            const course = this.findCourseAtSlot(col.day, period);

            if (course) {
                if (parseInt(course.startPeriod, 10) !== period) {
                    return '';
                }

                const rowspan = parseInt(course.endPeriod, 10) - parseInt(course.startPeriod, 10) + 1;

                return `
                    <td class="schedule-course-cell course-cell"
                        rowspan="${rowspan}"
                        style="--course-color: ${course.color}; background: ${course.color}18; border-color: ${course.color}40;"
                        data-course-id="${course.id}"
                        onclick="window.schedule.openCourseDetailModal('${course.id}')">
                        <div class="schedule-course-inner" style="background: ${course.color}22;">
                            <div class="schedule-course-name" style="color: ${course.color};">${course.name}</div>
                            ${course.location ? `<div class="schedule-course-location">${course.location}</div>` : ''}
                        </div>
                    </td>
                `;
            }

            return `<td class="schedule-empty-cell" data-date="${date.toISOString().split('T')[0]}"></td>`;
        }).join('');
    }

    renderWeekStats() {
        const statsContainer = document.getElementById('week-stats');
        if (!statsContainer) return;

        const dates = this.getCurrentWeekDates();
        const today = new Date();

        statsContainer.innerHTML = this.getDayColumns().map((col, index) => {
            const date = dates[index];
            const dayCourses = this.getDisplayedCoursesForDay(col.day);
            const isToday = date.toDateString() === today.toDateString();

            return `
                <div class="schedule-stat-day${isToday ? ' schedule-stat-today' : ''}">
                    <div class="schedule-stat-label">${col.label}</div>
                    <div class="schedule-stat-date">${date.getDate()}日</div>
                    <div class="schedule-stat-count">${dayCourses.length}</div>
                </div>
            `;
        }).join('');
    }

    openAddCourseModal(isEdit = false, courseId = null) {
        if (isEdit && courseId) {
            this.closeCourseDetailModal();
        }

        if (courseId) {
            const course = this.courses.find(c => c.id === courseId);
            if (course) {
                const nameInput = document.getElementById('course-name');
                const dayInput = document.getElementById('course-day');
                const startInput = document.getElementById('course-start');
                const endInput = document.getElementById('course-end');
                const locationInput = document.getElementById('course-location');
                const teacherInput = document.getElementById('course-teacher');
                const colorInput = document.getElementById('course-color');
                const modalTitle = document.getElementById('course-modal-title');
                
                if (nameInput) nameInput.value = course.name;
                if (dayInput) dayInput.value = course.day;
                if (startInput) startInput.value = course.startPeriod;
                if (endInput) endInput.value = course.endPeriod;
                if (locationInput) locationInput.value = course.location;
                if (teacherInput) teacherInput.value = course.teacher;
                if (colorInput) colorInput.value = course.color;
                if (modalTitle) modalTitle.textContent = '编辑课程';
                this.currentCourseId = courseId;
            }
        } else {
            this.resetCourseForm();
            const modalTitle = document.getElementById('course-modal-title');
            if (modalTitle) modalTitle.textContent = '添加课程';
            this.currentCourseId = null;
        }
        
        const modal = document.getElementById('add-course-modal');
        if (modal) modal.classList.remove('hidden');
    }

    closeCourseModal() {
        const modal = document.getElementById('add-course-modal');
        if (modal) modal.classList.add('hidden');
        this.resetCourseForm();
    }

    resetCourseForm() {
        const nameInput = document.getElementById('course-name');
        const dayInput = document.getElementById('course-day');
        const startInput = document.getElementById('course-start');
        const endInput = document.getElementById('course-end');
        const locationInput = document.getElementById('course-location');
        const teacherInput = document.getElementById('course-teacher');
        const colorInput = document.getElementById('course-color');
        
        if (nameInput) nameInput.value = '';
        if (dayInput) dayInput.value = '1';
        if (startInput) startInput.value = '1';
        if (endInput) endInput.value = '1';
        if (locationInput) locationInput.value = '';
        if (teacherInput) teacherInput.value = '';
        if (colorInput) colorInput.value = '#3b82f6';
        this.currentCourseId = null;
    }

    saveCourse() {
        const nameInput = document.getElementById('course-name');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) {
            alert('请输入课程名称');
            return;
        }

        const dayInput = document.getElementById('course-day');
        const startInput = document.getElementById('course-start');
        const endInput = document.getElementById('course-end');
        const locationInput = document.getElementById('course-location');
        const teacherInput = document.getElementById('course-teacher');
        const colorInput = document.getElementById('course-color');

        const courseData = {
            name: name,
            day: dayInput ? dayInput.value : '1',
            startPeriod: startInput ? startInput.value : '1',
            endPeriod: endInput ? endInput.value : '1',
            location: locationInput ? locationInput.value : '',
            teacher: teacherInput ? teacherInput.value : '',
            color: colorInput ? colorInput.value : '#3b82f6'
        };

        if (this.currentCourseId) {
            const index = this.courses.findIndex(c => c.id === this.currentCourseId);
            if (index !== -1) {
                this.courses[index] = { ...this.courses[index], ...courseData };
            }
        } else {
            this.courses.push({
                id: Date.now().toString(),
                ...courseData
            });
        }

        this.saveCourses();
        this.renderSchedule();
        this.renderWeekStats();
        this.closeCourseModal();
    }

    openWeekSettingsModal() {
        const dateInput = document.getElementById('first-week-date');
        if (dateInput) dateInput.value = this.firstWeekDate.toISOString().split('T')[0];
        const modal = document.getElementById('week-settings-modal');
        if (modal) modal.classList.remove('hidden');
    }

    closeWeekSettingsModal() {
        const modal = document.getElementById('week-settings-modal');
        if (modal) modal.classList.add('hidden');
    }

    saveWeekSettings() {
        const dateInput = document.getElementById('first-week-date');
        const dateStr = dateInput ? dateInput.value : '';
        if (dateStr) {
            const date = new Date(dateStr);
            if (date.getDay() !== 1) {
                const diff = 1 - date.getDay();
                date.setDate(date.getDate() + diff);
            }
            this.saveFirstWeekDate(date);
            this.currentWeekOffset = 0;
            this.updateWeekNavigation();
            this.renderSchedule();
            this.renderWeekStats();
        }
        this.closeWeekSettingsModal();
    }

    openTimeSettingsModal() {
        const content = document.getElementById('time-settings-content');
        if (!content) return;

        content.innerHTML = this.timeSlots.map((slot, index) => `
            <div class="schedule-time-setting-row">
                <span class="schedule-time-setting-label">第${slot.period}节</span>
                <input type="time" value="${slot.start}" class="input-field schedule-time-input" id="time-start-${index}">
                <span class="schedule-time-setting-sep">~</span>
                <input type="time" value="${slot.end}" class="input-field schedule-time-input" id="time-end-${index}">
            </div>
        `).join('');

        const modal = document.getElementById('time-settings-modal');
        if (modal) modal.classList.remove('hidden');
    }

    closeTimeSettingsModal() {
        const modal = document.getElementById('time-settings-modal');
        if (modal) modal.classList.add('hidden');
    }

    saveTimeSettings() {
        this.timeSlots = this.timeSlots.map((slot, index) => {
            const startInput = document.getElementById(`time-start-${index}`);
            const endInput = document.getElementById(`time-end-${index}`);
            return {
                period: slot.period,
                start: startInput ? startInput.value : slot.start,
                end: endInput ? endInput.value : slot.end
            };
        });

        UserStorage.setItem('timeSlots', JSON.stringify(this.timeSlots));
        this.renderSchedule();
        this.closeTimeSettingsModal();
    }

    resetTimeSettings() {
        this.timeSlots = this.getDefaultTimeSlots();
        UserStorage.setItem('timeSlots', JSON.stringify(this.timeSlots));
        this.openTimeSettingsModal();
    }

    /**
     * 应用导入的课程数据
     * @param {Array<Object>} courses
     * @param {string} [parseMethod]
     * @returns {void}
     */
    applyImportedCourses(courses, parseMethod) {
        this.courses = courses;
        this.saveCourses();
        this.renderSchedule();
        this.renderWeekStats();

        const methodLabel = {
            json: 'JSON',
            txt: 'TXT',
            rule: '文本规则',
            ai: 'AI 智能解析'
        }[parseMethod] || '文件';

        const message = `✅ 课程表导入成功！\n\n共导入 ${courses.length} 门课程（${methodLabel}）。`;
        if (window.aiAssistant) {
            window.aiAssistant.addMessage('assistant', message);
        } else {
            alert(`课程表导入成功！共 ${courses.length} 门课程。`);
        }
    }

    /**
     * 导入课表文件（JSON / TXT / PDF）
     * @param {Event} event
     * @returns {Promise<void>}
     */
    async importSchedule(event) {
        const file = event.target.files[0];
        if (!file) return;

        const notifyError = (msg) => {
            if (window.aiAssistant) {
                window.aiAssistant.addMessage('assistant', `❌ ${msg}`);
            } else {
                alert(msg);
            }
        };

        try {
            if (window.aiAssistant) {
                window.aiAssistant.addMessage('assistant', `📂 正在解析课表文件「${file.name}」…`);
            }
            const { courses, parseMethod } = await ScheduleParser.parseFile(file);
            this.applyImportedCourses(courses, parseMethod);
        } catch (error) {
            notifyError(error.message || '导入失败，请检查文件格式');
        } finally {
            event.target.value = '';
        }
    }

    openCourseDetailModal(courseId) {
        const course = this.courses.find(c => c.id === courseId);
        if (!course) return;

        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        
        const contentEl = document.getElementById('course-detail-content');
        if (contentEl) contentEl.innerHTML = `
            <div class="space-y-4">
                <div class="p-4 rounded-lg" style="background: ${course.color}20;">
                    <h4 class="text-lg font-bold" style="color: ${course.color};">${course.name}</h4>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="p-3 bg-gray-50 rounded-lg">
                        <div class="text-sm text-gray-500">上课时间</div>
                        <div class="font-medium">${dayNames[parseInt(course.day)]} 第${course.startPeriod}-${course.endPeriod}节</div>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg">
                        <div class="text-sm text-gray-500">上课地点</div>
                        <div class="font-medium">${course.location || '未设置'}</div>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg">
                        <div class="text-sm text-gray-500">授课教师</div>
                        <div class="font-medium">${course.teacher || '未设置'}</div>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg">
                        <div class="text-sm text-gray-500">课程时长</div>
                        <div class="font-medium">${parseInt(course.endPeriod) - parseInt(course.startPeriod) + 1}节课</div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button class="flex-1 btn btn-primary" onclick="window.schedule.openAddCourseModal(true, '${course.id}')">
                        <i class="fa fa-edit mr-1"></i>编辑
                    </button>
                    <button class="flex-1 btn btn-danger" onclick="window.schedule.deleteCourse('${course.id}')">
                        <i class="fa fa-trash mr-1"></i>删除
                    </button>
                </div>
            </div>
        `;

        const modal = document.getElementById('course-detail-modal');
        if (modal) modal.classList.remove('hidden');
    }

    closeCourseDetailModal() {
        const modal = document.getElementById('course-detail-modal');
        if (modal) modal.classList.add('hidden');
    }

    deleteCourse(courseId) {
        if (confirm('确定要删除这门课程吗？')) {
            this.courses = this.courses.filter(c => c.id !== courseId);
            this.saveCourses();
            this.renderSchedule();
            this.renderWeekStats();
            this.closeCourseDetailModal();
        }
    }

    getTodayCourses() {
        const today = new Date().getDay();
        return this.courses.filter(c => c.day === today.toString());
    }
}