document.addEventListener('DOMContentLoaded', function() {
    UserStorage.init();
    initTabs();
    initTheme();
    initModules();
    initScheduleImport();
    if (typeof PwaInstall !== 'undefined') {
        PwaInstall.init();
    }
    if (typeof ReminderScheduler !== 'undefined') {
        ReminderScheduler.init();
    }
});

function initTabs() {
    const tabs = document.querySelectorAll('#tab-nav button, #tab-nav-mobile button');

    /**
     * 同步所有导航按钮的激活状态
     * @param {string} activeTabId - 当前选中的 tab id
     */
    function setActiveNav(activeTabId) {
        tabs.forEach(t => {
            const isActive = t.getAttribute('data-tab') === activeTabId;
            t.classList.toggle('nav-tab-active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            setActiveNav(tabId);
            switchTab(tabId);
        });
    });

    const backButtons = document.querySelectorAll('.back-to-assistant');
    backButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            setActiveNav('ai-assistant');
            switchTab('ai-assistant');
        });
    });
}

function switchTab(tabId) {
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabPanes.forEach(pane => {
        pane.classList.add('hidden');
    });

    document.getElementById(tabId)?.classList.remove('hidden');

    if (tabId === 'ai-assistant' && window.aiAssistant) {
        window.aiAssistant.renderChatHistory();
    }

    if (tabId === 'statistics' && window.statistics) {
        setTimeout(() => window.statistics.renderCharts(), 100);
    }

    if (tabId === 'calendar' && window.calendar) {
        window.calendar.renderCalendar();
        if (window.calendar.selectedDate) {
            window.calendar.syncDayTasksPanel();
        }
    }

    if (tabId === 'schedule' && window.schedule) {
        window.schedule.renderSchedule();
        window.schedule.renderWeekStats();
    }
}

window.switchTab = switchTab;

function initTheme() {
    const savedTheme = localStorage.getItem('darkMode');
    if (savedTheme === 'true') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.classList.add('dark-mode');
        const icon = document.getElementById('theme-toggle')?.querySelector('i');
        if (icon) {
            icon.className = 'fa fa-sun-o';
        }
    }
}

function initModules() {
    window.taskManager = new TaskManager();
    window.schedule = new ScheduleManager();
    window.calendar = new CalendarManager();
    window.statistics = new StatisticsManager();
    window.reminderManagerUI = new ReminderManagerUI();
    window.settingsManager = new SettingsManager();
    SettingsManager.showAuthGateIfNeeded();
    window.aiAssistant = new AIAssistant();
    if (typeof ProactiveEngine !== 'undefined') {
        ProactiveEngine.init();
    }
}

document.getElementById('settings-btn')?.addEventListener('click', function() {
    window.settingsManager?.open();
});

// 创建任务模态框由 TaskManager 统一管理

// 通过AI助手导入课程表
function triggerImportSchedule() {
    const fileInput = document.getElementById('global-schedule-file-input');
    if (fileInput) {
        fileInput.click();
    }
}

// 初始化课程表导入功能
function initScheduleImport() {
    document.getElementById('global-schedule-file-input')?.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const notifyError = (msg) => {
            if (window.aiAssistant) {
                window.aiAssistant.addMessage('assistant', `❌ ${msg}`);
            }
        };

        try {
            if (window.aiAssistant) {
                window.aiAssistant.addMessage('assistant', `📂 正在解析课表文件「${file.name}」…`);
            }
            const { courses, parseMethod } = await ScheduleParser.parseFile(file);
            if (window.schedule) {
                window.schedule.applyImportedCourses(courses, parseMethod);
            } else {
                UserStorage.setItem('courses', JSON.stringify(courses));
                if (window.aiAssistant) {
                    window.aiAssistant.addMessage('assistant', `✅ 课程表导入成功！共 ${courses.length} 门课程。`);
                }
            }
        } catch (error) {
            notifyError(error.message || '导入失败，请检查文件格式');
        } finally {
            e.target.value = '';
        }
    });
}