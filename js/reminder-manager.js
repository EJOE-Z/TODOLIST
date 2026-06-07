/**
 * 提醒管理中心 - 查询、编辑、格式化全部提醒
 */
class ReminderManager {
    /**
     * 获取全部有效提醒（含每日重复）
     * @returns {Array<Object>}
     */
    static getAll() {
        const reminders = JSON.parse(UserStorage.getItem('reminders') || '[]');
        return reminders
            .filter(r => r.repeat === 'daily' || !r.triggered)
            .map(r => ReminderManager.enrichReminder(r))
            .sort((a, b) => {
                const ta = a.sortTime || '99:99';
                const tb = b.sortTime || '99:99';
                return ta.localeCompare(tb);
            });
    }

    /**
     * 补充提醒展示字段
     * @param {Object} reminder
     * @returns {Object}
     */
    static enrichReminder(reminder) {
        const isDaily = reminder.repeat === 'daily';
        const repeatTime = reminder.repeatTime || null;
        let nextTime = reminder.time ? new Date(reminder.time) : null;
        if (isDaily && repeatTime && typeof ReminderScheduler !== 'undefined') {
            nextTime = ReminderScheduler.computeNextDailyTime(repeatTime);
        }
        const sortTime = repeatTime || (reminder.time ? reminder.time.slice(11, 16) : '99:99');
        return {
            ...reminder,
            isDaily,
            repeatTime,
            nextTimeLabel: nextTime ? nextTime.toLocaleString('zh-CN') : '未知',
            timeLabel: isDaily ? `每日 ${repeatTime}` : (nextTime ? nextTime.toLocaleString('zh-CN') : ''),
            sortTime
        };
    }

    /**
     * 格式化为 Markdown 列表（供助手展示）
     * @returns {string}
     */
    static formatListMarkdown() {
        const all = ReminderManager.getAll();
        if (!all.length) {
            return '🔔 当前没有进行中的提醒。\n\n说「每晚九点提醒我…」即可创建每日提醒。';
        }

        const daily = all.filter(r => r.isDaily);
        const once = all.filter(r => !r.isDaily);
        const lines = ['🔔 **全部提醒**', '---'];

        if (daily.length) {
            lines.push(`### 每日提醒（${daily.length}）`);
            daily.forEach((r, i) => {
                lines.push(`${i + 1}. **${r.title}** · 每天 ${r.repeatTime}（下次：${r.nextTimeLabel}）`);
            });
        }
        if (once.length) {
            lines.push(`### 一次性提醒（${once.length}）`);
            once.forEach((r, i) => {
                lines.push(`${i + 1}. **${r.title}** · ${r.timeLabel}`);
            });
        }
        lines.push('---');
        lines.push('*在「日历 → 全部提醒」可编辑标题与时间。*');
        return lines.join('\n');
    }

    /**
     * 规范化 HH:mm
     * @param {string} timeStr
     * @returns {string|null}
     */
    static normalizeTimeOfDay(timeStr) {
        if (!timeStr) return null;
        const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        if (h < 0 || h > 23 || min < 0 || min > 59) return null;
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }

    /**
     * 更新提醒
     * @param {string} id
     * @param {{ title?: string, time_of_day?: string, time?: string }} updates
     * @returns {Object}
     */
    static updateReminder(id, updates) {
        const reminders = JSON.parse(UserStorage.getItem('reminders') || '[]');
        const index = reminders.findIndex(r => r.id === id);
        if (index === -1) {
            return { success: false, error: '提醒不存在' };
        }

        const r = reminders[index];
        if (updates.title !== undefined) {
            const title = updates.title.trim();
            if (!title) return { success: false, error: '标题不能为空' };
            r.title = title;
        }

        if (updates.time_of_day !== undefined && r.repeat === 'daily') {
            const normalized = ReminderManager.normalizeTimeOfDay(updates.time_of_day);
            if (!normalized) {
                return { success: false, error: '时间格式无效，请使用 HH:mm，如 18:30' };
            }
            r.repeatTime = normalized;
            r.time = ReminderScheduler.computeNextDailyTime(normalized).toISOString();
            r.triggered = false;
        } else if (updates.time !== undefined) {
            const d = new Date(updates.time);
            if (isNaN(d.getTime())) {
                return { success: false, error: '提醒时间无效' };
            }
            r.time = d.toISOString();
            r.triggered = false;
        }

        reminders[index] = r;
        UserStorage.setItem('reminders', JSON.stringify(reminders));
        ReminderScheduler.scheduleAll();
        ReminderManager.syncToServiceWorker();
        if (window.reminderManagerUI) window.reminderManagerUI.render();
        if (window.calendar) {
            window.calendar.renderCalendar();
            if (window.calendar.selectedDate) {
                window.calendar.showDayTasks(window.calendar.selectedDate);
            }
        }

        return { success: true, message: `已更新提醒「${r.title}」` };
    }

    /**
     * 删除提醒
     * @param {string} id
     * @returns {Object}
     */
    static deleteById(id) {
        let reminders = JSON.parse(UserStorage.getItem('reminders') || '[]');
        const target = reminders.find(r => r.id === id);
        reminders = reminders.filter(r => r.id !== id);
        UserStorage.setItem('reminders', JSON.stringify(reminders));
        ReminderScheduler.scheduleAll();
        ReminderManager.syncToServiceWorker();
        if (window.reminderManagerUI) window.reminderManagerUI.render();
        return { success: true, message: target ? `已删除提醒「${target.title}」` : '已删除' };
    }

    /**
     * 同步提醒数据到 Service Worker（PWA 后台通知）
     */
    static syncToServiceWorker() {
        if (!navigator.serviceWorker?.controller) return;
        const active = typeof NotificationSettings !== 'undefined' && NotificationSettings.isActive();
        navigator.serviceWorker.controller.postMessage({
            type: 'SYNC_REMINDERS',
            reminders: active ? ReminderManager.getAll() : []
        });
    }
}

/**
 * 提醒管理 UI
 */
class ReminderManagerUI {
    constructor() {
        this.panel = document.getElementById('all-reminders-panel');
        this.listEl = document.getElementById('all-reminders-list');
        this.modal = document.getElementById('reminder-edit-modal');
        this.editingId = null;
        this.init();
    }

    init() {
        document.getElementById('toggle-all-reminders')?.addEventListener('click', () => {
            this.panel?.classList.toggle('hidden');
            if (this.panel && !this.panel.classList.contains('hidden')) {
                this.render();
            }
        });

        document.getElementById('close-reminder-edit-modal')?.addEventListener('click', () => this.closeEdit());
        document.getElementById('cancel-reminder-edit')?.addEventListener('click', () => this.closeEdit());
        document.getElementById('save-reminder-edit')?.addEventListener('click', () => this.saveEdit());

        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeEdit();
        });

        this.render();
    }

    /**
     * 渲染全部提醒列表
     */
    render() {
        if (!this.listEl) return;
        const all = ReminderManager.getAll();

        if (!all.length) {
            this.listEl.innerHTML = '<div class="reminder-empty">暂无提醒，可在助手中说「每晚X点提醒我…」</div>';
            return;
        }

        this.listEl.innerHTML = all.map(r => `
            <div class="reminder-row" data-id="${r.id}">
                <div class="reminder-row-main">
                    <div class="reminder-row-title">${this.escape(r.title)}</div>
                    <div class="reminder-row-meta">
                        ${r.isDaily ? `<span class="badge badge-daily">每日 ${r.repeatTime}</span>` : '<span class="badge badge-once">一次性</span>'}
                        <span>下次：${this.escape(r.nextTimeLabel)}</span>
                    </div>
                </div>
                <div class="reminder-row-actions">
                    <button type="button" class="btn btn-outline btn-sm reminder-edit-btn" data-id="${r.id}">编辑</button>
                    <button type="button" class="btn btn-outline btn-sm reminder-del-btn" data-id="${r.id}">删除</button>
                </div>
            </div>
        `).join('');

        this.listEl.querySelectorAll('.reminder-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => this.openEdit(btn.getAttribute('data-id')));
        });
        this.listEl.querySelectorAll('.reminder-del-btn').forEach(btn => {
            btn.addEventListener('click', () => this.confirmDelete(btn.getAttribute('data-id')));
        });
    }

    /**
     * 打开编辑弹窗（标题 + 时间）
     * @param {string} id
     */
    openEdit(id) {
        const r = ReminderManager.getAll().find(x => x.id === id);
        if (!r) return;

        this.editingId = id;
        const titleInput = document.getElementById('reminder-edit-title');
        const dailyWrap = document.getElementById('reminder-edit-daily-wrap');
        const onceWrap = document.getElementById('reminder-edit-once-wrap');
        const dailyInput = document.getElementById('reminder-edit-time-daily');
        const onceInput = document.getElementById('reminder-edit-time-once');

        if (titleInput) titleInput.value = r.title;

        if (r.isDaily) {
            dailyWrap?.classList.remove('hidden');
            onceWrap?.classList.add('hidden');
            if (dailyInput) dailyInput.value = r.repeatTime || '18:00';
        } else {
            dailyWrap?.classList.add('hidden');
            onceWrap?.classList.remove('hidden');
            if (onceInput && r.time) {
                const local = new Date(r.time);
                onceInput.value = new Date(local.getTime() - local.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 16);
            }
        }

        this.modal?.classList.remove('hidden');
    }

    /**
     * 保存编辑
     */
    saveEdit() {
        if (!this.editingId) return;

        const r = ReminderManager.getAll().find(x => x.id === this.editingId);
        if (!r) return;

        const title = document.getElementById('reminder-edit-title')?.value?.trim() || '';
        /** @type {Object} */
        const updates = { title };

        if (r.isDaily) {
            const timeVal = document.getElementById('reminder-edit-time-daily')?.value;
            if (timeVal) updates.time_of_day = timeVal;
        } else {
            const timeVal = document.getElementById('reminder-edit-time-once')?.value;
            if (timeVal) updates.time = timeVal;
        }

        const result = ReminderManager.updateReminder(this.editingId, updates);
        if (!result.success) {
            alert(result.error || '保存失败');
            return;
        }

        this.closeEdit();
        this.render();
    }

    /**
     * 关闭编辑弹窗
     */
    closeEdit() {
        this.editingId = null;
        this.modal?.classList.add('hidden');
    }

    /**
     * 确认删除
     * @param {string} id
     */
    confirmDelete(id) {
        const r = ReminderManager.getAll().find(x => x.id === id);
        if (!r) return;
        if (!confirm(`确定删除提醒「${r.title}」？`)) return;
        ReminderManager.deleteById(id);
        this.render();
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    escape(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }
}
