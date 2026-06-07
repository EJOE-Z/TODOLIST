class TaskManager {
    constructor() {
        this.tasks = this.loadTasks();
        this.currentTaskId = null;
        this.editingTaskId = null;
        /** @type {Array<Object>} */
        this.modalSubtasks = [];
        this.focusTimer = null;
        this.focusRemainingSeconds = 25 * 60;
        this.FOCUS_DURATION = 25 * 60;
        this.isFocusPaused = false;
        this.currentFocusTaskId = null;
        this.init();
    }

    loadTasks() {
        return JSON.parse(UserStorage.getItem('tasks')) || [];
    }

    saveTasks() {
        UserStorage.setItem('tasks', JSON.stringify(this.tasks));
    }

    init() {
        this.setupEventListeners();
        this.renderTasks();
        this.updateStats();
        this.updateProgress();
        this.checkReminders();
        this.initDragAndDrop();
    }

    setupEventListeners() {
        document.getElementById('open-create-task-from-tasks')?.addEventListener('click', () => this.openCreateTaskModal());
        document.getElementById('confirm-create-task')?.addEventListener('click', () => this.submitTaskModal());
        document.getElementById('cancel-create-task')?.addEventListener('click', () => this.closeTaskModal());
        document.getElementById('close-create-task-modal')?.addEventListener('click', () => this.closeTaskModal());
        document.getElementById('create-task-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'create-task-modal') this.closeTaskModal();
        });
        document.getElementById('add-task-modal-subtask')?.addEventListener('click', () => this.addModalSubtask());
        document.getElementById('task-modal-subtask-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addModalSubtask();
            }
        });

        document.getElementById('add-subtask')?.addEventListener('click', () => this.addSubtask());
        document.getElementById('cancel-subtask')?.addEventListener('click', () => this.closeSubtaskModal());
        document.getElementById('close-subtask-modal')?.addEventListener('click', () => this.closeSubtaskModal());
        
        document.getElementById('save-reminder')?.addEventListener('click', () => this.saveReminder());
        document.getElementById('cancel-reminder')?.addEventListener('click', () => this.closeReminderModal());
        document.getElementById('close-reminder-modal')?.addEventListener('click', () => this.closeReminderModal());
        
        document.getElementById('save-diary')?.addEventListener('click', () => this.saveDiary());
        document.getElementById('cancel-diary')?.addEventListener('click', () => this.closeDiaryModal());
        document.getElementById('close-diary-modal')?.addEventListener('click', () => this.closeDiaryModal());

        document.getElementById('theme-toggle')?.addEventListener('click', () => this.toggleTheme());
    }

    renderTasks() {
        const todoContainer = document.getElementById('todo-tasks');
        const completedContainer = document.getElementById('completed-tasks');

        if (!todoContainer || !completedContainer) return;

        todoContainer.innerHTML = '';
        completedContainer.innerHTML = '';

        this.tasks.forEach(task => {
            const taskElement = this.createTaskElement(task);
            if (task.completed) {
                completedContainer.appendChild(taskElement);
            } else {
                todoContainer.appendChild(taskElement);
            }
        });

        this.saveTasks();
        this.updateStats();
        this.updateProgress();

        if (document.getElementById('calendar-grid')) {
            setTimeout(() => {
                if (window.calendar && typeof window.calendar.renderCalendar === 'function') {
                    window.calendar.renderCalendar();
                }
            }, 100);
        }
    }

    createTaskElement(task) {
        const taskCard = document.createElement('div');
        taskCard.className = `task-card task-card-${task.priority}`;
        taskCard.dataset.id = task.id;

        const priorityText = task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低';
        const priorityColor = task.priority === 'high' ? 'text-danger' : task.priority === 'medium' ? 'text-warning' : 'text-secondary';
        const hasSubtasks = task.subtasks && task.subtasks.length > 0;
        const hasDiary = task.diary && task.diary.length > 0;

        taskCard.innerHTML = `
            <div class="flex items-start">
                <input type="checkbox" class="task-checkbox mt-1 mr-3" ${task.completed ? 'checked' : ''}>
                <div class="flex-grow">
                    <div class="flex justify-between items-start">
                        <h3 class="font-medium ${task.completed ? 'line-through text-gray-500' : ''}">${task.title}</h3>
                        <div class="flex space-x-2">
                            ${hasSubtasks ? `
                                <button class="toggle-subtasks-btn text-gray-500 hover:text-primary p-1" title="展开/收起子任务">
                                    <i class="fa fa-caret-down"></i>
                                </button>
                            ` : ''}
                            <button class="subtask-btn text-gray-500 hover:text-primary p-1" title="添加子任务">
                                <i class="fa fa-list"></i>
                            </button>
                            <button class="diary-btn text-gray-500 hover:text-primary p-1" title="写日记">
                                <i class="fa fa-book"></i>${hasDiary ? '<span class="ml-0.5 text-xs">*</span>' : ''}
                            </button>
                            <button class="focus-btn text-gray-500 hover:text-primary p-1 ${task.focusTime && task.focusTime > 0 ? 'text-orange-500' : ''}" title="专注计时">
                                <i class="fa fa-clock-o"></i>
                            </button>
                            <button class="reminder-btn text-gray-500 hover:text-primary p-1">
                                <i class="fa fa-bell"></i>
                            </button>
                            <button class="edit-task-btn text-gray-500 hover:text-primary p-1">
                                <i class="fa fa-pencil"></i>
                            </button>
                            <button class="delete-task-btn text-gray-500 hover:text-danger p-1">
                                <i class="fa fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="mt-2 text-sm text-gray-500">
                        ${task.courseName ? `<div class="flex items-center mb-1"><i class="fa fa-graduation-cap mr-1 text-primary"></i> 关联课程：${task.courseName}</div>` : ''}
                        ${task.deadline ? `<div class="flex items-center mb-1"><i class="fa fa-calendar mr-1"></i> 截止：${this.formatDate(task.deadline)} ${!task.completed ? `<span class="${this.getRemainingTime(task.deadline).color}">(${this.getRemainingTime(task.deadline).text})</span>` : ''}</div>` : ''}
                        ${task.repeat !== 'none' ? `<div class="flex items-center mb-1"><i class="fa fa-refresh mr-1"></i> 重复：${this.getRepeatText(task.repeat)}${task.dailyReminderTime ? ` · 每日 ${task.dailyReminderTime} 提醒` : ''}</div>` : ''}
                        ${task.priority ? `<div class="flex items-center mb-1"><i class="fa fa-flag ${priorityColor} mr-1"></i> 优先级：${priorityText}</div>` : ''}
                        ${task.createdAt ? `<div class="flex items-center mb-1"><i class="fa fa-clock-o mr-1"></i> 创建：${this.formatDate(task.createdAt)}</div>` : ''}
                        ${task.focusTime && task.focusTime > 0 ? `<div class="flex items-center mb-1"><i class="fa fa-fire mr-1 text-orange-500"></i> 专注：${this.formatFocusTime(task.focusTime)}</div>` : ''}
                        ${task.completed && task.duration ? `<div class="flex items-center"><i class="fa fa-timer mr-1 text-secondary"></i> 耗时：${task.duration}</div>` : ''}
                    </div>
                    ${hasSubtasks ? `
                        <div class="mt-3 pt-3 border-t border-gray-100 subtasks-container">
                            <h4 class="text-sm font-medium mb-2 flex items-center">
                                <span>子任务</span>
                                <span class="ml-2 text-xs text-gray-400">(${task.subtasks.filter(s => s.completed).length}/${task.subtasks.length})</span>
                            </h4>
                            <div class="space-y-1">
                                ${task.subtasks.map(subtask => `
                                    <div class="flex items-center">
                                        <input type="checkbox" class="subtask-checkbox mr-2" ${subtask.completed ? 'checked' : ''} data-subtask-id="${subtask.id}">
                                        <span class="text-sm ${subtask.completed ? 'line-through text-gray-500' : ''}">${subtask.title}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        taskCard.querySelector('.task-checkbox')?.addEventListener('change', () => {
            this.toggleTaskCompletion(task.id);
        });

        if (taskCard.querySelector('.toggle-subtasks-btn')) {
            taskCard.querySelector('.toggle-subtasks-btn').addEventListener('click', () => {
                const container = taskCard.querySelector('.subtasks-container');
                const icon = taskCard.querySelector('.toggle-subtasks-btn i');
                if (container) {
                    if (container.style.display === 'none') {
                        container.style.display = 'block';
                        icon.className = 'fa fa-caret-down';
                    } else {
                        container.style.display = 'none';
                        icon.className = 'fa fa-caret-right';
                    }
                }
            });
        }

        taskCard.querySelector('.subtask-btn')?.addEventListener('click', () => this.openSubtaskModal(task.id));
        taskCard.querySelector('.diary-btn')?.addEventListener('click', () => this.openDiaryModal(task.id));
        taskCard.querySelector('.reminder-btn')?.addEventListener('click', () => this.openReminderModal(task.id));
        taskCard.querySelector('.focus-btn')?.addEventListener('click', () => this.startFocusMode(task.id));
        taskCard.querySelector('.edit-task-btn')?.addEventListener('click', () => this.editTask(task.id));
        taskCard.querySelector('.delete-task-btn')?.addEventListener('click', () => this.deleteTask(task.id));

        const subtaskCheckboxes = taskCard.querySelectorAll('.subtask-checkbox');
        subtaskCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const subtaskId = checkbox.dataset.subtaskId;
                this.toggleSubtaskCompletion(task.id, subtaskId);
            });
        });

        return taskCard;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatFocusTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}小时${minutes}分钟`;
        } else if (minutes > 0) {
            return `${minutes}分钟`;
        } else {
            return `${seconds}秒`;
        }
    }

    getRemainingTime(deadline) {
        const now = new Date();
        const deadlineDate = new Date(deadline);
        const diff = deadlineDate - now;

        if (diff <= 0) {
            return { text: '已过期', color: 'text-red-500' };
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        let text, color;

        if (days > 7) {
            text = `${days}天后`;
            color = 'text-green-500';
        } else if (days > 3) {
            text = `${days}天后`;
            color = 'text-blue-500';
        } else if (days > 0) {
            text = `${days}天${hours}小时后`;
            color = 'text-yellow-600';
        } else if (hours > 0) {
            text = `${hours}小时${minutes}分钟后`;
            color = 'text-orange-500';
        } else {
            text = `${minutes}分钟后`;
            color = 'text-red-500';
        }

        return { text, color };
    }

    getRepeatText(repeat) {
        const repeatMap = {
            'daily': '每天',
            'weekly': '每周',
            'monthly': '每月',
            'yearly': '每年'
        };
        return repeatMap[repeat] || '不重复';
    }

    toggleTaskCompletion(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            if (task.completed) {
                task.completedAt = new Date().toISOString();
                if (!task.createdAt) {
                    task.createdAt = new Date().toISOString();
                }
                const createdAt = new Date(task.createdAt);
                const completedAt = new Date(task.completedAt);
                const timeDiff = completedAt - createdAt;
                task.duration = this.calculateDuration(timeDiff);
            } else {
                task.completedAt = null;
                task.duration = null;
            }
            this.renderTasks();
        }
    }

    calculateDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}天${hours % 24}小时${minutes % 60}分钟`;
        } else if (hours > 0) {
            return `${hours}小时${minutes % 60}分钟`;
        } else if (minutes > 0) {
            return `${minutes}分钟`;
        } else {
            return `${seconds}秒`;
        }
    }

    toggleSubtaskCompletion(taskId, subtaskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task && task.subtasks) {
            const subtask = task.subtasks.find(s => s.id === subtaskId);
            if (subtask) {
                subtask.completed = !subtask.completed;
                this.renderTasks();
            }
        }
    }

    /**
     * 打开创建任务弹窗
     */
    openCreateTaskModal() {
        this.editingTaskId = null;
        this.modalSubtasks = [];
        this.resetTaskModalForm();
        const titleEl = document.getElementById('create-task-modal-title');
        const confirmBtn = document.getElementById('confirm-create-task');
        if (titleEl) titleEl.textContent = '🎯 创建新任务';
        if (confirmBtn) confirmBtn.textContent = '创建任务';
        document.getElementById('create-task-modal')?.classList.remove('hidden');
        document.getElementById('task-modal-title')?.focus();
    }

    /**
     * 打开编辑任务弹窗
     * @param {string} taskId
     */
    openEditTaskModal(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.editingTaskId = taskId;
        this.modalSubtasks = (task.subtasks || []).map(s => ({ ...s }));

        const titleInput = document.getElementById('task-modal-title');
        const startInput = document.getElementById('task-modal-start-date');
        const deadlineInput = document.getElementById('task-modal-deadline');
        const priorityInput = document.getElementById('task-modal-priority');
        const repeatInput = document.getElementById('task-modal-repeat');
        const reminderInput = document.getElementById('task-modal-reminder');

        if (titleInput) titleInput.value = task.title;
        if (startInput) startInput.value = task.startDate ? task.startDate.split('T')[0] : '';
        if (deadlineInput) deadlineInput.value = task.deadline ? task.deadline.split('T')[0] : '';
        if (priorityInput) priorityInput.value = task.priority || 'medium';
        if (repeatInput) repeatInput.value = task.repeat || 'none';
        if (reminderInput) reminderInput.value = task.reminder || '';

        const titleEl = document.getElementById('create-task-modal-title');
        const confirmBtn = document.getElementById('confirm-create-task');
        if (titleEl) titleEl.textContent = '✏️ 编辑任务';
        if (confirmBtn) confirmBtn.textContent = '保存修改';

        this.renderModalSubtaskList();
        document.getElementById('create-task-modal')?.classList.remove('hidden');
    }

    /**
     * 关闭任务弹窗
     */
    closeTaskModal() {
        document.getElementById('create-task-modal')?.classList.add('hidden');
        this.editingTaskId = null;
        this.modalSubtasks = [];
        this.resetTaskModalForm();
    }

    /**
     * 重置任务弹窗表单
     */
    resetTaskModalForm() {
        const titleInput = document.getElementById('task-modal-title');
        const startInput = document.getElementById('task-modal-start-date');
        const deadlineInput = document.getElementById('task-modal-deadline');
        const priorityInput = document.getElementById('task-modal-priority');
        const repeatInput = document.getElementById('task-modal-repeat');
        const reminderInput = document.getElementById('task-modal-reminder');
        const subtaskInput = document.getElementById('task-modal-subtask-input');

        if (titleInput) titleInput.value = '';
        if (startInput) startInput.value = '';
        if (deadlineInput) deadlineInput.value = '';
        if (priorityInput) priorityInput.value = 'medium';
        if (repeatInput) repeatInput.value = 'none';
        if (reminderInput) reminderInput.value = '';
        if (subtaskInput) subtaskInput.value = '';
        this.renderModalSubtaskList();
    }

    /**
     * 向弹窗中添加子任务
     */
    addModalSubtask() {
        const input = document.getElementById('task-modal-subtask-input');
        const title = input?.value?.trim();
        if (!title) return;

        this.modalSubtasks.push({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            title,
            completed: false
        });
        if (input) input.value = '';
        this.renderModalSubtaskList();
    }

    /**
     * 从弹窗中移除子任务
     * @param {string} subtaskId
     */
    removeModalSubtask(subtaskId) {
        this.modalSubtasks = this.modalSubtasks.filter(s => s.id !== subtaskId);
        this.renderModalSubtaskList();
    }

    /**
     * 渲染弹窗中的子任务列表
     */
    renderModalSubtaskList() {
        const listEl = document.getElementById('task-modal-subtask-list');
        if (!listEl) return;

        if (this.modalSubtasks.length === 0) {
            listEl.innerHTML = '<li class="text-xs text-gray-400 py-1">暂无子任务，可在上方添加</li>';
            return;
        }

        listEl.innerHTML = this.modalSubtasks.map(subtask => `
            <li class="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                <span>${subtask.title}</span>
                <button type="button" class="text-red-400 hover:text-red-600 remove-modal-subtask" data-id="${subtask.id}">
                    <i class="fa fa-times"></i>
                </button>
            </li>
        `).join('');

        listEl.querySelectorAll('.remove-modal-subtask').forEach(btn => {
            btn.addEventListener('click', () => {
                this.removeModalSubtask(btn.getAttribute('data-id'));
            });
        });
    }

    /**
     * 提交任务弹窗（创建或编辑）
     */
    submitTaskModal() {
        const title = document.getElementById('task-modal-title')?.value?.trim();
        if (!title) {
            alert('请输入任务标题');
            return;
        }

        const startDate = document.getElementById('task-modal-start-date')?.value || null;
        const deadline = document.getElementById('task-modal-deadline')?.value || null;
        const priority = document.getElementById('task-modal-priority')?.value || 'medium';
        const repeat = document.getElementById('task-modal-repeat')?.value || 'none';
        const reminder = document.getElementById('task-modal-reminder')?.value || '';

        if (this.editingTaskId) {
            const task = this.tasks.find(t => t.id === this.editingTaskId);
            if (task) {
                task.title = title;
                task.startDate = startDate;
                task.deadline = deadline;
                task.priority = priority;
                task.repeat = repeat;
                task.reminder = reminder;
                task.subtasks = [...this.modalSubtasks];
            }
            this.closeTaskModal();
            this.renderTasks();
            if (window.aiAssistant) {
                window.aiAssistant.addMessage('assistant', `✅ 任务「${title}」已更新`);
            }
            return;
        }

        const task = {
            id: Date.now().toString(),
            title,
            startDate,
            completed: false,
            priority,
            deadline,
            repeat,
            reminder,
            createdAt: new Date().toISOString(),
            subtasks: [...this.modalSubtasks],
            diary: [],
            duration: null,
            focusTime: 0,
            focusSessions: []
        };

        this.tasks.push(task);
        const subtaskCount = this.modalSubtasks.length;
        this.closeTaskModal();
        this.renderTasks();

        if (typeof UserMemory !== 'undefined') {
            UserMemory.recordTaskCreated({
                title,
                priority,
                dailyReminderTime: null
            });
        }

        if (window.calendar) {
            window.calendar.renderCalendar();
        }

        if (window.aiAssistant) {
            const priorityLabels = { low: '低', medium: '中', high: '高' };
            let msg = `✅ 任务创建成功！\n\n**任务名称**：${title}\n**优先级**：${priorityLabels[priority]}`;
            if (subtaskCount > 0) {
                msg += `\n**子任务**：${subtaskCount} 项`;
            }
            window.aiAssistant.addMessage('assistant', msg);
        }
    }

    editTask(taskId) {
        this.openEditTaskModal(taskId);
    }

    deleteTask(taskId) {
        if (confirm('确定要删除这个任务吗？')) {
            this.tasks = this.tasks.filter(t => t.id !== taskId);
            this.renderTasks();
        }
    }

    openSubtaskModal(taskId) {
        this.currentTaskId = taskId;
        document.getElementById('subtask-modal')?.classList.remove('hidden');
    }

    closeSubtaskModal() {
        const modal = document.getElementById('subtask-modal');
        const titleInput = document.getElementById('subtask-title');
        if (modal) modal.classList.add('hidden');
        if (titleInput) titleInput.value = '';
    }

    addSubtask() {
        const titleInput = document.getElementById('subtask-title');
        const title = titleInput ? titleInput.value.trim() : '';
        if (!title || !this.currentTaskId) return;

        const task = this.tasks.find(t => t.id === this.currentTaskId);
        if (task) {
            if (!task.subtasks) {
                task.subtasks = [];
            }
            task.subtasks.push({
                id: Date.now().toString(),
                title: title,
                completed: false
            });
            this.renderTasks();
            this.closeSubtaskModal();
        }
    }

    openReminderModal(taskId) {
        this.currentTaskId = taskId;
        const task = this.tasks.find(t => t.id === taskId);
        const reminderInput = document.getElementById('reminder-time');
        const modal = document.getElementById('reminder-modal');
        
        if (task && task.reminder && reminderInput) {
            reminderInput.value = task.reminder;
        }
        if (modal) modal.classList.remove('hidden');
    }

    closeReminderModal() {
        const modal = document.getElementById('reminder-modal');
        if (modal) modal.classList.add('hidden');
    }

    saveReminder() {
        const reminderInput = document.getElementById('reminder-time');
        const reminderTime = reminderInput ? reminderInput.value : '';
        if (!this.currentTaskId) return;

        const task = this.tasks.find(t => t.id === this.currentTaskId);
        if (task) {
            task.reminder = reminderTime;
            this.renderTasks();
            this.closeReminderModal();
        }
    }

    openDiaryModal(taskId) {
        this.currentTaskId = taskId;
        const task = this.tasks.find(t => t.id === taskId);
        const modalTitle = document.getElementById('diary-modal-title');
        const diaryContent = document.getElementById('diary-content');
        const modal = document.getElementById('diary-modal');
        
        if (task) {
            if (modalTitle) modalTitle.textContent = `任务日记 - ${task.title}`;
            if (diaryContent) {
                if (task.diary && task.diary.length > 0) {
                    const latestDiary = task.diary[task.diary.length - 1];
                    diaryContent.value = latestDiary.content;
                } else {
                    diaryContent.value = '';
                }
            }
        }
        if (modal) modal.classList.remove('hidden');
    }

    closeDiaryModal() {
        const modal = document.getElementById('diary-modal');
        const diaryContent = document.getElementById('diary-content');
        if (modal) modal.classList.add('hidden');
        if (diaryContent) diaryContent.value = '';
    }

    saveDiary() {
        const diaryContentEl = document.getElementById('diary-content');
        const diaryContent = diaryContentEl ? diaryContentEl.value.trim() : '';
        if (!diaryContent || !this.currentTaskId) return;

        const task = this.tasks.find(t => t.id === this.currentTaskId);
        if (task) {
            if (!task.diary) {
                task.diary = [];
            }
            task.diary.push({
                id: Date.now().toString(),
                content: diaryContent,
                date: new Date().toLocaleString('zh-CN')
            });
            this.renderTasks();
            this.closeDiaryModal();
        }
    }

    updateStats() {
        const total = this.tasks.length;
        const completed = this.tasks.filter(t => t.completed).length;
        const pending = total - completed;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

        const statsTotal = document.getElementById('stats-total');
        const statsPending = document.getElementById('stats-pending');
        const statsCompleted = document.getElementById('stats-completed');
        const statsRate = document.getElementById('stats-rate');
        
        if (statsTotal) statsTotal.textContent = total;
        if (statsPending) statsPending.textContent = pending;
        if (statsCompleted) statsCompleted.textContent = completed;
        if (statsRate) statsRate.textContent = `${rate}%`;
    }

    updateProgress() {
        const today = new Date().toDateString();
        const todayTasks = this.tasks.filter(t => !t.completed && (!t.deadline || new Date(t.deadline).toDateString() === today));
        const completedToday = todayTasks.filter(t => t.completed).length;
        const totalToday = todayTasks.length;
        const progress = totalToday > 0 ? (completedToday / totalToday) * 100 : 0;

        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        const todayDate = document.getElementById('today-date');
        
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `${completedToday}/${totalToday}`;
        if (todayDate) todayDate.textContent = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    }

    checkReminders() {
        const now = new Date();
        this.tasks.forEach(task => {
            if (task.reminder && !task.completed) {
                const reminderTime = new Date(task.reminder);
                if (reminderTime <= now && reminderTime > now - 60000) {
                    this.showNotification(`任务提醒: ${task.title}`);
                }
            }
        });
    }

    showNotification(message) {
        NotificationSettings.show('TODO清单提醒', message);
    }

    initDragAndDrop() {
        const todoContainer = document.getElementById('todo-tasks');
        const completedContainer = document.getElementById('completed-tasks');

        if (typeof Sortable !== 'undefined') {
            Sortable.create(todoContainer, {
                group: 'tasks',
                animation: 200,
                onEnd: () => this.saveTasks()
            });

            Sortable.create(completedContainer, {
                group: 'tasks',
                animation: 200,
                onEnd: (evt) => {
                    const taskId = evt.item.dataset.id;
                    const task = this.tasks.find(t => t.id === taskId);
                    if (task) {
                        task.completed = evt.to.id === 'completed-tasks';
                        if (task.completed) {
                            task.completedAt = new Date().toISOString();
                        } else {
                            task.completedAt = null;
                        }
                        this.saveTasks();
                        this.updateStats();
                    }
                }
            });
        }
    }

    startFocusMode(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.currentFocusTaskId = taskId;
        this.focusRemainingSeconds = this.FOCUS_DURATION;

        this.showFocusModal(task.title);
        this.startFocusTimer();
    }

    showFocusModal(taskTitle) {
        const existingModal = document.getElementById('focus-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'focus-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]';

        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
                <h3 class="text-xl font-bold text-gray-800 mb-2">专注模式</h3>
                <p class="text-gray-500 mb-6">${taskTitle}</p>

                <div class="relative w-48 h-48 mx-auto mb-6">
                    <svg class="w-full h-full transform -rotate-90">
                        <circle cx="96" cy="96" r="88" stroke="#e5e7eb" stroke-width="8" fill="none"/>
                        <circle id="focus-progress" cx="96" cy="96" r="88" stroke="#f97316" stroke-width="8" fill="none"
                            stroke-dasharray="${2 * Math.PI * 88}" stroke-dashoffset="0" stroke-linecap="round"/>
                    </svg>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <div>
                            <div id="focus-time-display" class="text-4xl font-bold text-gray-800">25:00</div>
                            <div id="focus-status" class="text-sm text-gray-500 mt-2">专注中...</div>
                        </div>
                    </div>
                </div>

                <div class="flex justify-center space-x-4">
                    <button id="focus-pause-btn" class="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-full transition-colors">
                        <i class="fa fa-pause mr-2"></i>暂停
                    </button>
                    <button id="focus-stop-btn" class="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full transition-colors">
                        <i class="fa fa-stop mr-2"></i>结束
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('focus-pause-btn')?.addEventListener('click', () => this.toggleFocusPause());
        document.getElementById('focus-stop-btn')?.addEventListener('click', () => this.stopFocusMode());
    }

    startFocusTimer() {
        const focusStartTime = Date.now();

        this.focusTimer = setInterval(() => {
            this.focusRemainingSeconds--;
            this.updateFocusDisplay();

            if (this.focusRemainingSeconds <= 0) {
                this.completeFocusSession();
            }
        }, 1000);
    }

    updateFocusDisplay() {
        const minutes = Math.floor(this.focusRemainingSeconds / 60);
        const seconds = this.focusRemainingSeconds % 60;
        const timeDisplay = document.getElementById('focus-time-display');
        const progress = document.getElementById('focus-progress');

        if (timeDisplay) {
            timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        if (progress) {
            const circumference = 2 * Math.PI * 88;
            const offset = circumference * (1 - this.focusRemainingSeconds / this.FOCUS_DURATION);
            progress.style.strokeDashoffset = offset;
        }
    }

    toggleFocusPause() {
        const btn = document.getElementById('focus-pause-btn');

        if (this.isFocusPaused) {
            this.isFocusPaused = false;
            btn.innerHTML = '<i class="fa fa-pause mr-2"></i>暂停';
            btn.className = 'px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-full transition-colors';
            this.startFocusTimer();
        } else {
            this.isFocusPaused = true;
            clearInterval(this.focusTimer);
            btn.innerHTML = '<i class="fa fa-play mr-2"></i>继续';
            btn.className = 'px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors';
        }
    }

    stopFocusMode() {
        clearInterval(this.focusTimer);

        const elapsedSeconds = this.FOCUS_DURATION - this.focusRemainingSeconds;
        let taskTitle = '';

        if (elapsedSeconds >= 60 && this.currentFocusTaskId) {
            const task = this.tasks.find(t => t.id === this.currentFocusTaskId);
            if (task) {
                taskTitle = task.title;
                task.focusTime = (task.focusTime || 0) + elapsedSeconds;
                if (!task.focusSessions) {
                    task.focusSessions = [];
                }
                task.focusSessions.push({
                    date: new Date().toISOString().split('T')[0],
                    seconds: elapsedSeconds
                });
                this.saveTasks();
                this.renderTasks();
                if (typeof UserMemory !== 'undefined') {
                    UserMemory.recordFocusStarted(task.title);
                }
            }
        }

        const modal = document.getElementById('focus-modal');
        if (modal) modal.remove();

        if (taskTitle && typeof PlanRescheduleEngine !== 'undefined') {
            PlanRescheduleEngine.onFocusSessionEnd({
                taskTitle,
                completedFully: false,
                stoppedEarly: elapsedSeconds < this.FOCUS_DURATION - 60
            });
        }

        this.currentFocusTaskId = null;
        this.isFocusPaused = false;
    }

    completeFocusSession() {
        clearInterval(this.focusTimer);

        let taskTitle = '';
        if (this.currentFocusTaskId) {
            const task = this.tasks.find(t => t.id === this.currentFocusTaskId);
            if (task) {
                taskTitle = task.title;
                task.focusTime = (task.focusTime || 0) + this.FOCUS_DURATION;
                this.saveTasks();
                this.renderTasks();
                if (typeof UserMemory !== 'undefined') {
                    UserMemory.recordFocusStarted(task.title);
                }
            }
        }

        const modal = document.getElementById('focus-modal');
        if (modal) modal.remove();

        alert('🎉 恭喜！完成了一个番茄钟！休息一下吧～');

        if (taskTitle && typeof PlanRescheduleEngine !== 'undefined') {
            PlanRescheduleEngine.onFocusSessionEnd({
                taskTitle,
                completedFully: true,
                stoppedEarly: false
            });
        }

        this.currentFocusTaskId = null;
        this.isFocusPaused = false;
    }

    toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const nextDark = !isDark;

        if (nextDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.body.classList.add('dark-mode');
        } else {
            document.documentElement.removeAttribute('data-theme');
            document.body.classList.remove('dark-mode');
        }

        localStorage.setItem('darkMode', nextDark.toString());

        const icon = document.getElementById('theme-toggle')?.querySelector('i');
        if (icon) {
            icon.className = nextDark ? 'fa fa-sun-o' : 'fa fa-moon-o';
        }
    }
}