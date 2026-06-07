/**
 * 本地日期工具（避免 toISOString 时区偏移）
 */
class DateUtils {
    /**
     * 格式化为本地 YYYY-MM-DD
     * @param {Date} date
     * @returns {string}
     */
    static formatLocalDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * 从 ISO / YYYY-MM-DD 字符串解析为本地零点 Date
     * @param {string} dateStr
     * @returns {Date|null}
     */
    static parseLocalDate(dateStr) {
        if (!dateStr) return null;
        const part = String(dateStr).split('T')[0];
        const segments = part.split('-').map(Number);
        if (segments.length < 3 || segments.some(n => Number.isNaN(n))) return null;
        return new Date(segments[0], segments[1] - 1, segments[2]);
    }

    /**
     * 取日期的本地零点时间戳，便于比较
     * @param {Date} date
     * @returns {number}
     */
    static dayTimestamp(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }

    /**
     * 判断两个日期是否为同一天（本地）
     * @param {Date} a
     * @param {Date} b
     * @returns {boolean}
     */
    static isSameLocalDay(a, b) {
        return DateUtils.formatLocalDate(a) === DateUtils.formatLocalDate(b);
    }
}
