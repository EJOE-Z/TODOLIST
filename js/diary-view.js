/**
 * 日历页任务日记时间线
 */
class DiaryView {
    constructor() {
        this.init();
    }

    /**
     * 绑定事件
     * @returns {void}
     */
    init() {
        document.getElementById('diary-search-input')?.addEventListener('input', () => this.render());
        document.getElementById('diary-filter-by-date')?.addEventListener('change', () => this.render());
        document.getElementById('toggle-all-diaries')?.addEventListener('click', () => this.togglePanel());
        document.getElementById('open-all-diaries-from-tasks')?.addEventListener('click', () => {
            if (typeof switchTab === 'function') {
                switchTab('calendar');
            }
            this.openPanel(false);
        });
    }

    /**
     * 日记面板是否展开
     * @returns {boolean}
     */
    isPanelOpen() {
        const panel = document.getElementById('all-diaries-panel');
        return panel ? !panel.classList.contains('hidden') : false;
    }

    /**
     * 展开/收起日记面板
     * @returns {void}
     */
    togglePanel() {
        const panel = document.getElementById('all-diaries-panel');
        if (!panel) {
            return;
        }
        const willOpen = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        if (willOpen) {
            this.render();
        }
    }

    /**
     * 打开日记面板
     * @param {boolean} [filterByDate=true] 是否默认按选中日期筛选
     * @returns {void}
     */
    openPanel(filterByDate = true) {
        const panel = document.getElementById('all-diaries-panel');
        const filterInput = document.getElementById('diary-filter-by-date');
        if (filterInput) {
            filterInput.checked = filterByDate;
        }
        panel?.classList.remove('hidden');
        this.render();
        panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * 解析日记时间字符串
     * @param {string} dateStr
     * @returns {number}
     */
    static parseDiaryDate(dateStr) {
        if (!dateStr) {
            return 0;
        }
        const parsed = Date.parse(dateStr);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
        const normalized = dateStr.replace(/\//g, '-');
        const retry = Date.parse(normalized);
        return Number.isNaN(retry) ? 0 : retry;
    }

    /**
     * 收集全部任务日记
     * @returns {Array<Object>}
     */
    static collectAllEntries() {
        const tasks = JSON.parse(UserStorage.getItem('tasks') || '[]');
        /** @type {Array<Object>} */
        const entries = [];

        tasks.forEach((task) => {
            (task.diary || []).forEach((diary) => {
                entries.push({
                    taskId: task.id,
                    taskTitle: task.title,
                    taskCompleted: Boolean(task.completed),
                    diaryId: diary.id,
                    content: diary.content || '',
                    date: diary.date || '',
                    dateMs: DiaryView.parseDiaryDate(diary.date)
                });
            });
        });

        return entries.sort((a, b) => b.dateMs - a.dateMs);
    }

    /**
     * 获取指定日期的日记
     * @param {Date} date
     * @returns {Array<Object>}
     */
    static getEntriesOnDate(date) {
        if (!date || typeof DateUtils === 'undefined') {
            return [];
        }
        const dayTs = DateUtils.dayTimestamp(date);
        return DiaryView.collectAllEntries().filter((entry) => {
            if (!entry.dateMs) {
                return false;
            }
            return DateUtils.dayTimestamp(new Date(entry.dateMs)) === dayTs;
        });
    }

    /**
     * 判断某日期是否有日记
     * @param {Date} date
     * @returns {boolean}
     */
    static hasDiaryOnDate(date) {
        return DiaryView.getEntriesOnDate(date).length > 0;
    }

    /**
     * 格式化时间为 HH:mm
     * @param {string} dateStr
     * @returns {string}
     */
    static formatTime(dateStr) {
        const dateMs = DiaryView.parseDiaryDate(dateStr);
        if (!dateMs) {
            return dateStr || '';
        }
        return new Date(dateMs).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 转义 HTML
     * @param {string} text
     * @returns {string}
     */
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 渲染日记条目 HTML
     * @param {Array<Object>} entries
     * @returns {string}
     */
    static renderEntriesHtml(entries) {
        if (!entries.length) {
            return `
                <div class="diary-empty">
                    <i class="fa fa-book"></i>
                    <p>暂无日记</p>
                    <p class="diary-empty-hint">在任务页点击 📖 写日记，或对助手说「给 xxx 任务写一篇日记」</p>
                </div>
            `;
        }

        /** @type {Record<string, Array<Object>>} */
        const groups = {};
        entries.forEach((entry) => {
            const dayLabel = entry.dateMs
                ? new Date(entry.dateMs).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long'
                })
                : '未知日期';
            if (!groups[dayLabel]) {
                groups[dayLabel] = [];
            }
            groups[dayLabel].push(entry);
        });

        return Object.entries(groups).map(([dayLabel, dayEntries]) => `
            <section class="diary-day-group">
                <h3 class="diary-day-title">${DiaryView.escapeHtml(dayLabel)}</h3>
                <div class="diary-day-items">
                    ${dayEntries.map((entry) => `
                        <article class="diary-entry-card">
                            <div class="diary-entry-header">
                                <span class="diary-entry-time">${DiaryView.escapeHtml(DiaryView.formatTime(entry.date))}</span>
                                <button type="button" class="diary-entry-task-btn" data-task-id="${entry.taskId}">
                                    <i class="fa fa-tasks"></i>
                                    <span>${DiaryView.escapeHtml(entry.taskTitle)}</span>
                                    ${entry.taskCompleted ? '<span class="diary-entry-done">已完成</span>' : ''}
                                </button>
                            </div>
                            <p class="diary-entry-content">${DiaryView.escapeHtml(entry.content).replace(/\n/g, '<br>')}</p>
                        </article>
                    `).join('')}
                </div>
            </section>
        `).join('');
    }

    /**
     * 绑定日记卡片上的任务按钮
     * @param {HTMLElement} container
     * @returns {void}
     */
    static bindEntryActions(container) {
        container.querySelectorAll('.diary-entry-task-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const taskId = button.getAttribute('data-task-id');
                if (typeof switchTab === 'function') {
                    switchTab('tasks');
                }
                setTimeout(() => window.taskManager?.openDiaryModal(taskId), 150);
            });
        });
    }

    /**
     * 渲染日记时间线
     * @returns {void}
     */
    render() {
        const container = document.getElementById('diary-timeline-list');
        const countEl = document.getElementById('diary-total-count');
        if (!container) {
            return;
        }

        const keyword = document.getElementById('diary-search-input')?.value?.trim().toLowerCase() || '';
        const filterByDate = document.getElementById('diary-filter-by-date')?.checked ?? false;
        const selectedDate = window.calendar?.selectedDate || null;

        let entries = DiaryView.collectAllEntries();

        if (filterByDate && selectedDate) {
            entries = DiaryView.getEntriesOnDate(selectedDate);
        }

        if (keyword) {
            entries = entries.filter((entry) =>
                entry.content.toLowerCase().includes(keyword)
                || entry.taskTitle.toLowerCase().includes(keyword)
            );
        }

        if (countEl) {
            countEl.textContent = String(entries.length);
        }

        container.innerHTML = DiaryView.renderEntriesHtml(entries);
        DiaryView.bindEntryActions(container);
    }
}
