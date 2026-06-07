class StatisticsManager {
    constructor() {
        this.charts = {
            completion: null,
            priority: null,
            time: null,
            focusDistribution: null
        };
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('statistics-tab')?.addEventListener('click', () => {
            setTimeout(() => this.renderCharts(), 100);
        });
    }

    renderCharts() {
        this.destroyCharts();
        this.renderCompletionChart();
        this.renderPriorityChart();
        this.renderTimeChart();
        this.renderFocusDistributionChart();
        this.updateFocusSummary();
    }

    destroyCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart) {
                chart.destroy();
            }
        });
        this.charts = {
            completion: null,
            priority: null,
            time: null,
            focusDistribution: null
        };
    }

    renderCompletionChart() {
        const ctx = document.getElementById('completion-chart');
        if (!ctx) return;

        const tasks = JSON.parse(UserStorage.getItem('tasks') || '[]');
        const completed = tasks.filter(t => t.completed).length;
        const pending = tasks.filter(t => !t.completed).length;

        this.charts.completion = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['已完成', '待完成'],
                datasets: [{
                    data: [completed, pending],
                    backgroundColor: ['#10b981', '#f59e0b'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }

    renderPriorityChart() {
        const ctx = document.getElementById('priority-chart');
        if (!ctx) return;

        const tasks = JSON.parse(UserStorage.getItem('tasks') || '[]');
        const high = tasks.filter(t => t.priority === 'high').length;
        const medium = tasks.filter(t => t.priority === 'medium').length;
        const low = tasks.filter(t => t.priority === 'low').length;

        this.charts.priority = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['高优先级', '中优先级', '低优先级'],
                datasets: [{
                    label: '任务数量',
                    data: [high, medium, low],
                    backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    renderTimeChart() {
        const ctx = document.getElementById('time-chart');
        if (!ctx) return;

        const tasks = JSON.parse(UserStorage.getItem('tasks') || '[]');
        const completedTasks = tasks.filter(t => t.completed && t.duration);
        
        const durationData = completedTasks.map(task => {
            const match = task.duration.match(/(\d+)小时|(\d+)分钟|(\d+)秒/);
            let minutes = 0;
            if (match) {
                if (match[1]) minutes += parseInt(match[1]) * 60;
                if (match[2]) minutes += parseInt(match[2]);
            }
            return {
                title: task.title.substring(0, 10) + (task.title.length > 10 ? '...' : ''),
                minutes: minutes
            };
        }).sort((a, b) => b.minutes - a.minutes).slice(0, 7);

        this.charts.time = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: durationData.map(d => d.title),
                datasets: [{
                    label: '耗时(分钟)',
                    data: durationData.map(d => d.minutes),
                    backgroundColor: '#3b82f6',
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    renderFocusDistributionChart() {
        const ctx = document.getElementById('focus-distribution-chart');
        if (!ctx) return;

        const tasks = JSON.parse(UserStorage.getItem('tasks') || '[]');
        const tasksWithFocus = tasks.filter(t => t.focusTime && t.focusTime > 0);
        
        const focusData = tasksWithFocus.map(task => ({
            title: task.title.substring(0, 10) + (task.title.length > 10 ? '...' : ''),
            seconds: task.focusTime
        })).sort((a, b) => b.seconds - a.seconds).slice(0, 5);

        this.charts.focusDistribution = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: focusData.map(d => d.title),
                datasets: [{
                    data: focusData.map(d => d.seconds),
                    backgroundColor: [
                        '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#14b8a6'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            padding: 15,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }

    updateFocusSummary() {
        const tasks = JSON.parse(UserStorage.getItem('tasks') || '[]');
        const totalFocusSeconds = tasks.reduce((sum, t) => sum + (t.focusTime || 0), 0);
        const focusMinutes = Math.floor(totalFocusSeconds / 60);
        
        let sessionCount = 0;
        let taskCount = 0;
        
        tasks.forEach(task => {
            if (task.focusSessions && task.focusSessions.length > 0) {
                sessionCount += task.focusSessions.length;
                taskCount++;
            }
        });

        const totalFocusTimeEl = document.getElementById('total-focus-time');
        const focusSessionCountEl = document.getElementById('focus-session-count');
        const focusTaskCountEl = document.getElementById('focus-task-count');
        
        if (totalFocusTimeEl) totalFocusTimeEl.textContent = focusMinutes;
        if (focusSessionCountEl) focusSessionCountEl.textContent = sessionCount;
        if (focusTaskCountEl) focusTaskCountEl.textContent = taskCount;
    }
}