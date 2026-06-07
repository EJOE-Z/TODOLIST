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
     * 计算下一次每周提醒时间
     * @param {number} weekday - 0=周日 … 6=周六
     * @param {string} timeOfDay - HH:mm
     * @returns {Date}
     */
    static computeNextWeeklyTime(weekday, timeOfDay) {
        const [h, m] = timeOfDay.split(':').map(Number);
        const next = new Date();
        next.setHours(h, m, 0, 0);
        const currentDay = next.getDay();
        let daysAhead = weekday - currentDay;
        if (daysAhead < 0 || (daysAhead === 0 && next.getTime() <= Date.now())) {
            daysAhead += 7;
        }
        next.setDate(next.getDate() + daysAhead);
        return next;
    }

    /** @type {string[]} */
    static WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    /**
     * 从自然语言中提取提醒事件标题（剥离日期时间表述）
     * @param {string} text
     * @returns {string}
     */
    static extractEventTitle(text) {
        let title = String(text || '').trim();
        if (!title) {
            return '提醒';
        }

        title = title
            .replace(/^(请)?(帮我|帮忙)?(设置|设个?|加个?)?提醒(?:我)?[：:\s]*/i, '')
            // 周期表述优先剥离，避免「每周三」被时间词拆散后残留「每周」
            .replace(/每(?:星期|周)[一二三四五六日天]/g, '')
            .replace(/每(?:星期|周)/g, '')
            .replace(/每[天日晚]/g, '')
            .replace(/^(今天|明天|后天|大后天|昨日|昨天)\s*/g, '')
            .replace(/^(上|下)?(周|星期)[一二三四五六日天]\s*/g, '')
            .replace(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}\s*日?/g, '')
            .replace(/\d{1,2}\s*月\s*\d{1,2}\s*日/g, '')
            .replace(/(今天|明天|后天|大后天|上午|早上|中午|下午|晚上|夜里|夜间|傍晚|凌晨)/g, '')
            .replace(/([零一二两三四五六七八九十]{1,3}|\d{1,2})\s*点\s*(半|钟|整)?/g, '')
            .replace(/\d{1,2}[：:]\d{2}/g, '')
            .replace(/(\d+)\s*分钟\s*后/g, '')
            .replace(/^要/, '')
            .replace(/提醒我?/g, '')
            .replace(/[，,。.！!？?；;]+$/g, '')
            .trim();

        return title || '提醒';
    }

    /**
     * 清洗提醒标题，去掉已解析进时间的日期/时刻表述
     * @param {string} title
     * @returns {string}
     */
    static cleanReminderTitle(title) {
        return ReminderScheduler.extractEventTitle(title);
    }

    /**
     * 解析带具体日期时间的一次性提醒（如「明天中午十二点要开会」）
     * @param {string} message
     * @returns {{ title: string, time: string }|null}
     */
    static parseScheduledReminderCommand(message) {
        const trimmed = message.trim();
        if (!trimmed || /每[天日晚]/.test(trimmed) || /每(?:星期|周)[一二三四五六日天]/.test(trimmed)) {
            return null;
        }
        if (/^(删除|关掉?|关闭|取消|去掉|移除)/.test(trimmed)) {
            return null;
        }
        if (/(删除|关掉?|关闭|取消|去掉|移除).+提醒$/.test(trimmed)) {
            return null;
        }
        if (!/(明天|后天|大后天|今天|下周|周[一二三四五六日天]|\d{1,2}\s*月|点|时|午|[:：]\d{2})/.test(trimmed)) {
            return null;
        }
        if (typeof TaskCreationFlow === 'undefined') {
            return null;
        }

        const iso = TaskCreationFlow.parseDeadline(trimmed);
        if (!iso) {
            return null;
        }

        const when = new Date(iso);
        if (isNaN(when.getTime()) || when.getTime() <= Date.now()) {
            return null;
        }

        return {
            title: ReminderScheduler.extractEventTitle(trimmed),
            time: when.toISOString()
        };
    }

    /**
     * 从用户消息解析一次性提醒（如「五分钟后提醒我XXX」）
     * @param {string} message
     * @returns {{ title: string, minutes_from_now: number }|null}
     */
    static parseQuickReminderCommand(message) {
        const match = message.match(/(\d+)\s*分钟\s*后\s*提醒(?:我)?[：:\s]*(.+)?$/i);
        if (!match) return null;
        const rawTitle = match[2]?.trim() || '提醒';
        const title = ReminderScheduler.cleanReminderTitle(rawTitle);
        return { title, minutes_from_now: parseInt(match[1], 10) };
    }

    /**
     * 解析星期几（一~日）为 0=周日 … 6=周六
     * @param {string} dayChar
     * @returns {number|null}
     */
    static parseWeekdayChar(dayChar) {
        const dayMap = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
        return dayMap[dayChar] ?? null;
    }

    /**
     * 从用户消息解析每周重复提醒（如「每周三晚上五点半提醒我值班」）
     * @param {string} message
     * @returns {{ title: string, time_of_day: string, repeat_weekday: number, repeat: string }|null}
     */
    static parseWeeklyReminderCommand(message) {
        const trimmed = message.trim();
        if (!/每(?:星期|周)[一二三四五六日天]/.test(trimmed)) {
            return null;
        }
        if (!/提醒|任务/.test(trimmed)) {
            return null;
        }

        const weekdayMatch = trimmed.match(/每(?:星期|周)([一二三四五六日天])/);
        if (!weekdayMatch) {
            return null;
        }

        const repeatWeekday = ReminderScheduler.parseWeekdayChar(weekdayMatch[1]);
        if (repeatWeekday === null) {
            return null;
        }

        const time = ReminderScheduler.parseTimeOfDayFromMessage(trimmed);
        if (!time) {
            return null;
        }

        const remindTail = trimmed.match(/提醒(?:我)?(.+)$/);
        const title = remindTail?.[1]
            ? ReminderScheduler.extractEventTitle(remindTail[1].trim())
            : ReminderScheduler.extractEventTitle(trimmed);
        const timeOfDay = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;

        return {
            title: title || '每周提醒',
            time_of_day: timeOfDay,
            repeat_weekday: repeatWeekday,
            repeat: 'weekly'
        };
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
            if (reminder.triggered && reminder.repeat !== 'daily' && reminder.repeat !== 'weekly') return;
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
        } else if (reminder.repeat === 'weekly' && reminder.repeatTime && reminder.repeatWeekday !== undefined) {
            reminders[index].triggered = false;
            reminders[index].time = ReminderScheduler.computeNextWeeklyTime(
                reminder.repeatWeekday,
                reminder.repeatTime
            ).toISOString();
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
            if (!['daily', 'weekly'].includes(reminder.repeat) || !reminder.repeatTime) return;
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
