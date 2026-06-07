/**
 * 提醒调度器 - 统一管理一次性与周期性提醒
 */
class ReminderScheduler {
    /** @type {Map<string, number>} */
    static timers = new Map();

    /**
     * 初始化提醒调度（页面加载时调用）
     */
    static init() {
        ReminderScheduler.scheduleAll();
        setInterval(() => ReminderScheduler.checkDailyReminders(), 30000);
        if (typeof ReminderManager !== 'undefined') {
            ReminderManager.syncToServiceWorker();
        }
    }

    /**
     * 中文数字转阿拉伯数字
     * @param {string} str
     * @returns {number|null}
     */
    static parseChineseNumber(str) {
        const map = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12 };
        if (/^\d+$/.test(str)) return parseInt(str, 10);
        return map[str] ?? null;
    }

    /**
     * 解析「每晚六点半」类时间为 HH:mm
     * @param {string} message
     * @returns {{ hour: number, minute: number }|null}
     */
    static parseTimeOfDayFromMessage(message) {
        const isEvening = /每晚|晚上|夜里|夜间|傍晚/.test(message);
        const isMorning = /早上|早晨|上午/.test(message);
        const isAfternoon = /下午/.test(message);

        const halfMatch = message.match(/([零一二两三四五六七八九十\d]{1,2})\s*点半/);
        if (halfMatch) {
            let hour = ReminderScheduler.parseChineseNumber(halfMatch[1]);
            if (hour === null) return null;
            if (isEvening && hour >= 1 && hour <= 11) hour += 12;
            else if (isAfternoon && hour >= 1 && hour <= 11) hour += 12;
            else if (!isMorning && !isAfternoon && !isEvening && hour >= 1 && hour <= 6) hour += 12;
            return { hour, minute: 30 };
        }

        const colonMatch = message.match(/(\d{1,2})[：:](\d{2})/);
        if (colonMatch) {
            let hour = parseInt(colonMatch[1], 10);
            const minute = parseInt(colonMatch[2], 10);
            if (isEvening && hour >= 1 && hour <= 11) hour += 12;
            else if (isAfternoon && hour >= 1 && hour <= 11) hour += 12;
            return { hour, minute };
        }

        const hourMatch = message.match(/([零一二两三四五六七八九十\d]{1,2})\s*(?:点|时)/);
        if (hourMatch) {
            let hour = ReminderScheduler.parseChineseNumber(hourMatch[1]);
            if (hour === null) return null;
            if (isEvening && hour >= 1 && hour <= 11) hour += 12;
            else if (isAfternoon && hour >= 1 && hour <= 11) hour += 12;
            else if (!isMorning && !isAfternoon && !isEvening && hour >= 1 && hour <= 6) hour += 12;
            return { hour, minute: 0 };
        }

        return null;
    }

    /**
     * 计算下一次每日提醒时间
     * @param {string} timeOfDay - HH:mm 格式
     * @returns {Date}
     */
    static computeNextDailyTime(timeOfDay) {
        const [h, m] = timeOfDay.split(':').map(Number);
        const next = new Date();
        next.setHours(h, m, 0, 0);
        if (next.getTime() <= Date.now()) {
            next.setDate(next.getDate() + 1);
        }
        return next;
    }

    /**
     * 从用户消息解析一次性提醒（如「五分钟后提醒我XXX」）
     * @param {string} message
     * @returns {{ title: string, minutes_from_now: number }|null}
     */
    static parseQuickReminderCommand(message) {
        const match = message.match(/(\d+)\s*分钟\s*后\s*提醒(?:我)?[：:\s]*(.+)?$/i);
        if (!match) return null;
        const title = match[2]?.trim() || '提醒';
        return { title, minutes_from_now: parseInt(match[1], 10) };
    }

    /**
     * 从用户消息解析每日重复提醒
     * @param {string} message
     * @returns {{ title: string, time_of_day: string, repeat: string }|null}
     */
    static parseDailyReminderCommand(message) {
        if (!/每[天日晚]|每天|每晚/.test(message)) return null;
        if (!/提醒|任务/.test(message)) return null;

        const time = ReminderScheduler.parseTimeOfDayFromMessage(message);
        if (!time) return null;

        let title = '';
        const openMatch = message.match(/打开([^，,。.！!？?\n]+)/);
        if (openMatch) {
            title = ('打开' + openMatch[1]).trim();
        } else {
            const titlePatterns = [
                /提醒(?:我)?[：:\s]*(.+?)$/i,
                /创建(?:一个)?任务[：:\s]*(.+?)$/i
            ];
            for (const pattern of titlePatterns) {
                const m = message.match(pattern);
                if (m && m[1]) {
                    title = m[1]
                        .replace(/每[天日晚].+/g, '')
                        .replace(/(\d{1,2}[：:]\d{2}|\d+\s*分钟\s*后|[零一二两三四五六七八九十\d]+\s*点半)/g, '')
                        .replace(/提醒(?:我)?/g, '')
                        .trim();
                    if (title) break;
                }
            }
        }

        if (!title) title = '每日提醒';

        title = title.replace(/[，,。.！!？?]+$/g, '').trim();
        const timeOfDay = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;

        return { title, time_of_day: timeOfDay, repeat: 'daily' };
    }

    /**
     * 调度所有未触发的提醒
     */
    static scheduleAll() {
        ReminderScheduler.timers.forEach(id => clearTimeout(id));
        ReminderScheduler.timers.clear();

        const reminders = JSON.parse(UserStorage.getItem('reminders') || '[]');
        const now = Date.now();

        reminders.forEach(reminder => {
            if (reminder.triggered && reminder.repeat !== 'daily') return;
            if (!reminder.time) return;

            const reminderTime = new Date(reminder.time).getTime();
            const delay = reminderTime - now;

            if (delay > 0 && delay < 7 * 24 * 60 * 60 * 1000) {
                ReminderScheduler.scheduleOne(reminder, delay);
            } else if (delay <= 0 && delay > -120000) {
                ReminderScheduler.fireReminder(reminder);
            }
        });
    }

    /**
     * 注册单个提醒定时器
     * @param {Object} reminder
     * @param {number} delay
     */
    static scheduleOne(reminder, delay) {
        if (ReminderScheduler.timers.has(reminder.id)) {
            clearTimeout(ReminderScheduler.timers.get(reminder.id));
        }
        const timerId = setTimeout(() => {
            ReminderScheduler.fireReminder(reminder);
        }, delay);
        ReminderScheduler.timers.set(reminder.id, timerId);
    }

    /**
     * 触发提醒并处理周期性重复
     * @param {Object} reminder
     */
    static fireReminder(reminder) {
        const reminders = JSON.parse(UserStorage.getItem('reminders') || '[]');
        const index = reminders.findIndex(r => r.id === reminder.id);
        if (index === -1) return;

        NotificationSettings.show('智能TODO清单提醒', reminder.title);

        if (window.aiAssistant) {
            window.aiAssistant.addMessage('assistant', `🔔 **提醒**：${reminder.title}`);
        }

        if (reminder.repeat === 'daily' && reminder.repeatTime) {
            reminders[index].triggered = false;
            reminders[index].time = ReminderScheduler.computeNextDailyTime(reminder.repeatTime).toISOString();
            reminders[index].lastTriggered = new Date().toISOString();
        } else {
            reminders[index].triggered = true;
        }

        UserStorage.setItem('reminders', JSON.stringify(reminders));

        if (window.calendar) {
            window.calendar.renderCalendar();
        }

        ReminderScheduler.scheduleAll();
    }

    /**
     * 每分钟检查每日重复提醒（兜底，防止 setTimeout 丢失）
     */
    static checkDailyReminders() {
        const reminders = JSON.parse(UserStorage.getItem('reminders') || '[]');
        const now = new Date();

        reminders.forEach(reminder => {
            if (reminder.repeat !== 'daily' || !reminder.repeatTime) return;
            if (!reminder.time) return;

            const fireTime = new Date(reminder.time);
            const diff = now.getTime() - fireTime.getTime();

            if (diff >= 0 && diff < 60000 && !reminder._firing) {
                reminder._firing = true;
                ReminderScheduler.fireReminder(reminder);
            }
        });
    }
}
