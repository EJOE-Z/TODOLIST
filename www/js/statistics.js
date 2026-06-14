/**
 * 学习数据统计面板
 */
class StatisticsManager {
    constructor() {
        /** @type {Record<string, Chart|null>} */
        this.charts = {};
        this.init();
    }

    init() {
        document.getElementById('statistics-tab')?.addEventListener('click', () => {
            setTimeout(() => this.renderCharts(), 100);
        });
    }

    renderCharts() {
        this.destroyCharts();
        const metrics = StatisticsManager.collectMetrics();
        this.renderKPIs(metrics);
        this.renderInsights(metrics);
        this.renderWeeklyActivityChart(metrics);
        this.renderHealthChart(metrics);
        this.renderTimeChart(metrics);
        this.renderFocusTopChart(metrics);
        this.renderTaskSnapshot(metrics);
    }

    destroyCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};
        ['weekly-activity-chart', 'health-chart', 'time-chart', 'focus-top-chart'].forEach(id => {
            StatisticsManager.clearChartEmpty(id);
        });
    }

    /**
     * @returns {Object}
     */
    static collectMetrics() {
        const tasks = JSON.parse(UserStorage.getItem('tasks') || '[]');
        const now = new Date();
        const todayStr = StatisticsManager.toDateKey(now);

        const pending = tasks.filter(t => !t.completed);
        const completed = tasks.filter(t => t.completed);

        const overdue = pending.filter(t =>
            t.deadline && new Date(t.deadline).getTime() < now.getTime()
        );
        const dueSoon = pending.filter(t => {
            if (!t.deadline) return false;
            const days = StatisticsManager.daysUntil(t.deadline);
            return days >= 0 && days <= 3;
        });
        const noDeadline = pending.filter(t => !t.deadline);

        const weekStart = StatisticsManager.startOfWeek(now);
        const lastWeekStart = new Date(weekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(weekStart);
        lastWeekEnd.setMilliseconds(-1);

        const completedThisWeek = completed.filter(t =>
            t.completedAt && new Date(t.completedAt) >= weekStart
        ).length;
        const completedLastWeek = completed.filter(t => {
            if (!t.completedAt) return false;
            const d = new Date(t.completedAt);
            return d >= lastWeekStart && d <= lastWeekEnd;
        }).length;

        let focusMinutesToday = 0;
        let focusMinutesWeek = 0;
        let focusSessions = 0;

        tasks.forEach(task => {
            (task.focusSessions || []).forEach(session => {
                const min = Math.round((session.seconds || 0) / 60);
                focusSessions += 1;
                const key = StatisticsManager.normalizeDateKey(session.date);
                if (key === todayStr) focusMinutesToday += min;
                if (key && StatisticsManager.isWithinLastDays(key, 7)) {
                    focusMinutesWeek += min;
                }
            });
            if (!task.focusSessions?.length && task.focusTime > 0) {
                const min = Math.round(task.focusTime / 60);
                focusSessions += 1;
                focusMinutesWeek += min;
            }
        });

        const weeklyDays = StatisticsManager.buildLast7Days();
        completed.forEach(task => {
            if (!task.completedAt) return;
            const key = StatisticsManager.toDateKey(new Date(task.completedAt));
            const day = weeklyDays.find(d => d.key === key);
            if (day) day.completed += 1;
        });
        tasks.forEach(task => {
            (task.focusSessions || []).forEach(session => {
                const key = StatisticsManager.normalizeDateKey(session.date);
                const day = weeklyDays.find(d => d.key === key);
                if (day) day.focusMin += Math.round((session.seconds || 0) / 60);
            });
        });

        const getMinutes = typeof TaskDuration !== 'undefined'
            ? (task) => TaskDuration.getCompletionMinutes(task)
            : (task) => StatisticsManager.parseDurationMinutes(task.duration);

        const durationTop = completed
            .map(t => ({ title: t.title, minutes: getMinutes(t) }))
            .filter(d => d.minutes > 0)
            .sort((a, b) => b.minutes - a.minutes)
            .slice(0, 7);

        const focusTop = tasks
            .filter(t => t.focusTime > 0)
            .map(t => ({ title: t.title, minutes: Math.max(1, Math.round(t.focusTime / 60)) }))
            .sort((a, b) => b.minutes - a.minutes)
            .slice(0, 7);

        const diaryCount = tasks.reduce((sum, t) => sum + (t.diary?.length || 0), 0);

        return {
            tasks,
            pending,
            completed,
            total: tasks.length,
            overdue,
            dueSoon,
            noDeadline,
            completedThisWeek,
            completedLastWeek,
            focusMinutesToday,
            focusMinutesWeek,
            focusSessions,
            weeklyDays,
            durationTop,
            focusTop,
            diaryCount,
            completionRate: tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0
        };
    }

    renderKPIs(metrics) {
        const grid = document.getElementById('stats-kpi-grid');
        if (!grid) return;

        const weekDelta = metrics.completedThisWeek - metrics.completedLastWeek;
        const weekDeltaText = weekDelta > 0 ? `+${weekDelta}` : String(weekDelta);

        const cards = [
            {
                label: '本周完成',
                value: metrics.completedThisWeek,
                sub: `上周 ${metrics.completedLastWeek}（${weekDeltaText}）`,
                color: '#10b981',
                bg: 'rgba(16,185,129,0.12)',
                icon: 'fa-check-circle'
            },
            {
                label: '今日专注',
                value: `${metrics.focusMinutesToday} 分`,
                sub: `本周累计 ${metrics.focusMinutesWeek} 分`,
                color: '#8b5cf6',
                bg: 'rgba(139,92,246,0.12)',
                icon: 'fa-fire'
            },
            {
                label: '即将到期',
                value: metrics.dueSoon.length,
                sub: metrics.overdue.length ? `另有 ${metrics.overdue.length} 项已逾期` : '未来 3 天内截止',
                color: '#f59e0b',
                bg: 'rgba(245,158,11,0.12)',
                icon: 'fa-hourglass-half'
            },
            {
                label: '待办进行中',
                value: metrics.pending.length,
                sub: `总完成率 ${metrics.completionRate}%`,
                color: 'var(--color-primary)',
                bg: 'var(--color-primary-soft)',
                icon: 'fa-tasks'
            }
        ];

        grid.innerHTML = cards.map(card => `
            <div class="stat-card card-hover">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="stat-card-label">${card.label}</p>
                        <p class="stat-card-value" style="color:${card.color}">${card.value}</p>
                        <p class="stats-kpi-sub">${card.sub}</p>
                    </div>
                    <div class="stat-card-icon" style="background:${card.bg};color:${card.color}">
                        <i class="fa ${card.icon}"></i>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderInsights(metrics) {
        const box = document.getElementById('stats-insights');
        if (!box) return;

        const tips = [];

        if (metrics.overdue.length) {
            tips.push(`⚠️ 有 **${metrics.overdue.length}** 项已逾期，建议优先处理：${metrics.overdue.slice(0, 2).map(t => t.title).join('、')}`);
        }
        if (metrics.dueSoon.length) {
            tips.push(`⏰ 未来 3 天内有 **${metrics.dueSoon.length}** 项截止，可提前规划专注时段`);
        }
        if (metrics.completedThisWeek > metrics.completedLastWeek) {
            tips.push(`📈 本周完成 **${metrics.completedThisWeek}** 项，比上周多 ${metrics.completedThisWeek - metrics.completedLastWeek} 项，保持节奏！`);
        } else if (metrics.completedThisWeek === 0 && metrics.pending.length) {
            tips.push('💪 本周还没有完成任务，从一个小目标开始吧');
        }
        if (metrics.focusMinutesWeek === 0 && metrics.pending.length) {
            tips.push('🍅 本周尚未记录专注，在任务卡片点击专注按钮开启番茄钟');
        } else if (metrics.focusMinutesWeek >= 60) {
            tips.push(`🔥 本周专注 **${metrics.focusMinutesWeek}** 分钟，学习投入不错`);
        }
        if (metrics.diaryCount > 0) {
            tips.push(`📔 已积累 **${metrics.diaryCount}** 篇任务日记，便于回顾学习过程`);
        }
        if (!tips.length) {
            tips.push('✨ 创建任务、完成打卡、使用专注模式后，这里会出现个性化建议');
        }

        box.innerHTML = `
            <h3 class="font-medium mb-3">💡 数据洞察</h3>
            <ul class="stats-insights-list">
                ${tips.slice(0, 4).map(t => `<li>${StatisticsManager.formatInsight(t)}</li>`).join('')}
            </ul>
        `;
        box.classList.remove('hidden');
    }

    renderWeeklyActivityChart(metrics) {
        const ctx = document.getElementById('weekly-activity-chart');
        if (!ctx) return;

        this.charts.weekly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: metrics.weeklyDays.map(d => d.label),
                datasets: [
                    {
                        label: '完成任务',
                        data: metrics.weeklyDays.map(d => d.completed),
                        backgroundColor: 'rgba(16,185,129,0.75)',
                        borderRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        label: '专注(分钟)',
                        data: metrics.weeklyDays.map(d => d.focusMin),
                        type: 'line',
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139,92,246,0.15)',
                        tension: 0.35,
                        fill: true,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: StatisticsManager.mixedChartOptions()
        });
    }

    renderHealthChart(metrics) {
        const ctx = document.getElementById('health-chart');
        if (!ctx) return;

        const onTrack = metrics.pending.filter(t => {
            if (!t.deadline) return false;
            const days = StatisticsManager.daysUntil(t.deadline);
            return days > 3;
        }).length;
        const data = [
            metrics.overdue.length,
            metrics.dueSoon.length,
            metrics.noDeadline.length,
            onTrack
        ];
        const hasData = data.some(v => v > 0) || metrics.completed.length > 0;

        if (!hasData && !metrics.pending.length) {
            StatisticsManager.showChartEmpty('health-chart', '暂无待办，创建任务后可查看健康度分布');
            return;
        }

        StatisticsManager.clearChartEmpty('health-chart');
        this.charts.health = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['已逾期', '3天内截止', '无截止', '时间充裕'],
                datasets: [{
                    data: data.map(v => Math.max(0, v)),
                    backgroundColor: ['#ef4444', '#f59e0b', '#94a3b8', '#10b981'],
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true } }
                }
            }
        });
    }

    renderTimeChart(metrics) {
        const ctx = document.getElementById('time-chart');
        if (!ctx) return;

        if (!metrics.durationTop.length) {
            StatisticsManager.showChartEmpty(
                'time-chart',
                '暂无完成耗时。勾选完成任务后，会统计从创建到完成的用时。'
            );
            return;
        }

        StatisticsManager.clearChartEmpty('time-chart');
        this.charts.time = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: metrics.durationTop.map(d => StatisticsManager.shortenTitle(d.title)),
                datasets: [{
                    label: '完成耗时',
                    data: metrics.durationTop.map(d => d.minutes),
                    backgroundColor: '#3b82f6',
                    borderRadius: 6
                }]
            },
            options: StatisticsManager.horizontalBarOptions(StatisticsManager.formatMinutesLabel)
        });
    }

    renderFocusTopChart(metrics) {
        const ctx = document.getElementById('focus-top-chart');
        if (!ctx) return;

        if (!metrics.focusTop.length) {
            StatisticsManager.showChartEmpty(
                'focus-top-chart',
                '暂无专注记录。在任务卡片点击专注按钮开始番茄钟。'
            );
            return;
        }

        StatisticsManager.clearChartEmpty('focus-top-chart');
        this.charts.focusTop = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: metrics.focusTop.map(d => StatisticsManager.shortenTitle(d.title)),
                datasets: [{
                    label: '专注(分钟)',
                    data: metrics.focusTop.map(d => d.minutes),
                    backgroundColor: '#8b5cf6',
                    borderRadius: 6
                }]
            },
            options: StatisticsManager.horizontalBarOptions((v) => `${v} 分`)
        });
    }

    renderTaskSnapshot(metrics) {
        const box = document.getElementById('stats-task-snapshot');
        if (!box) return;

        const rows = [];

        metrics.overdue.forEach(t => {
            rows.push({ task: t, tag: '已逾期', tagClass: 'stats-tag-danger', extra: StatisticsManager.formatDeadline(t.deadline) });
        });
        metrics.dueSoon.filter(t => !metrics.overdue.includes(t)).forEach(t => {
            const days = StatisticsManager.daysUntil(t.deadline);
            rows.push({ task: t, tag: `${days}天后截止`, tagClass: 'stats-tag-warning', extra: StatisticsManager.formatDeadline(t.deadline) });
        });
        metrics.pending
            .filter(t => !metrics.overdue.includes(t) && !metrics.dueSoon.includes(t))
            .slice(0, 3)
            .forEach(t => {
                rows.push({ task: t, tag: '推进中', tagClass: 'stats-tag-neutral', extra: t.deadline ? StatisticsManager.formatDeadline(t.deadline) : '无截止' });
            });

        if (!rows.length) {
            box.innerHTML = '<div class="stats-snapshot-empty">🎉 当前没有需要特别关注的待办，状态良好</div>';
            return;
        }

        box.innerHTML = rows.slice(0, 6).map(row => `
            <div class="stats-snapshot-row">
                <div class="stats-snapshot-main">
                    <span class="stats-snapshot-title">${StatisticsManager.escape(row.task.title)}</span>
                    <span class="stats-snapshot-meta">${row.extra}</span>
                </div>
                <span class="stats-tag ${row.tagClass}">${row.tag}</span>
            </div>
        `).join('');
    }

    static mixedChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom' } },
            scales: {
                y: {
                    beginAtZero: true,
                    position: 'left',
                    title: { display: true, text: '完成数' },
                    ticks: { stepSize: 1 }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: '专注(分)' }
                }
            }
        };
    }

    static horizontalBarOptions(tickCallback) {
        return {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { callback: (v) => tickCallback(v) }
                }
            }
        };
    }

    static formatMinutesLabel(minutes) {
        if (minutes >= 24 * 60) return `${Math.round(minutes / 60 / 24)}天`;
        if (minutes >= 60) return `${Math.round(minutes / 60)}时`;
        return `${minutes}分`;
    }

    static formatDeadline(deadline) {
        if (!deadline) return '无截止';
        return new Date(deadline).toLocaleString('zh-CN', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    static formatInsight(text) {
        return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }

    static escape(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static buildLast7Days() {
        const days = [];
        const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - i);
            days.push({
                key: StatisticsManager.toDateKey(d),
                label: i === 0 ? '今天' : weekLabels[d.getDay()],
                completed: 0,
                focusMin: 0
            });
        }
        return days;
    }

    static startOfWeek(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1;
        d.setDate(d.getDate() - diff);
        return d;
    }

    static toDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    static normalizeDateKey(dateStr) {
        if (!dateStr) return '';
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
        const parsed = Date.parse(dateStr);
        if (Number.isNaN(parsed)) return '';
        return StatisticsManager.toDateKey(new Date(parsed));
    }

    static isWithinLastDays(dateKey, days) {
        const target = new Date(`${dateKey}T12:00:00`);
        const now = new Date();
        const diff = (now - target) / (24 * 60 * 60 * 1000);
        return diff >= 0 && diff < days;
    }

    static daysUntil(deadline) {
        if (!deadline) return null;
        const end = new Date(deadline);
        const now = new Date();
        return Math.ceil((end - now) / (24 * 60 * 60 * 1000));
    }

    static parseDurationMinutes(durationStr) {
        if (!durationStr) return 0;
        let minutes = 0;
        const dayMatch = durationStr.match(/(\d+)天/);
        const hourMatch = durationStr.match(/(\d+)小时/);
        const minMatch = durationStr.match(/(\d+)分钟/);
        const secMatch = durationStr.match(/(\d+)秒/);
        if (dayMatch) minutes += parseInt(dayMatch[1], 10) * 24 * 60;
        if (hourMatch) minutes += parseInt(hourMatch[1], 10) * 60;
        if (minMatch) minutes += parseInt(minMatch[1], 10);
        if (secMatch) minutes += Math.ceil(parseInt(secMatch[1], 10) / 60);
        return minutes;
    }

    static showChartEmpty(canvasId, message) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const wrap = canvas.parentElement;
        if (!wrap) return;
        let empty = wrap.querySelector('.chart-empty');
        if (!empty) {
            empty = document.createElement('div');
            empty.className = 'chart-empty';
            wrap.appendChild(empty);
        }
        empty.textContent = message;
        empty.classList.remove('hidden');
        canvas.classList.add('hidden');
    }

    static clearChartEmpty(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        canvas.classList.remove('hidden');
        canvas.parentElement?.querySelector('.chart-empty')?.classList.add('hidden');
    }

    static shortenTitle(title) {
        const text = String(title || '');
        return text.length > 12 ? `${text.substring(0, 12)}…` : text;
    }
}
