/**
 * 课表文件解析（前端 JSON/CSV/文本行 + 后端 PDF/AI）
 */
class ScheduleParser {
    static COLORS = [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
        '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];

    static DAY_MAP = {
        '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 0,
        '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6, '星期日': 0, '星期天': 0
    };

    /**
     * 解析上传文件
     * @param {File} file
     * @returns {Promise<{ courses: Array<Object>, parseMethod: string }>}
     */
    static async parseFile(file) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();

        if (ext === 'json') {
            const text = await file.text();
            const courses = ScheduleParser.parseJsonText(text);
            if (!courses.length) {
                throw new Error('JSON 文件中没有有效的课程数据');
            }
            return { courses, parseMethod: 'json' };
        }

        if (ext === 'txt') {
            const text = await file.text();
            const localCourses = ScheduleParser.parseTextLocal(text);
            if (localCourses.length) {
                return { courses: localCourses, parseMethod: 'txt' };
            }
            return ScheduleImportApi.parseScheduleFileApi(file);
        }

        if (ext === 'pdf') {
            return ScheduleImportApi.parseScheduleFileApi(file);
        }

        throw new Error('不支持的文件格式，请使用 .json、.txt 或 .pdf');
    }

    /**
     * 解析 JSON 文本
     * @param {string} text
     * @returns {Array<Object>}
     */
    static parseJsonText(text) {
        const data = JSON.parse(text);
        const list = Array.isArray(data) ? data : (data.courses || []);
        return ScheduleParser.normalizeCourses(list);
    }

    /**
     * 本地解析 TXT（JSON / CSV / 结构化行）
     * @param {string} text
     * @returns {Array<Object>}
     */
    static parseTextLocal(text) {
        const stripped = text.trim();
        if (!stripped) return [];

        if (stripped.startsWith('[') || stripped.startsWith('{')) {
            try {
                return ScheduleParser.parseJsonText(stripped);
            } catch (e) {
                /* 继续尝试其他格式 */
            }
        }

        const csvCourses = ScheduleParser.parseCsvText(stripped);
        if (csvCourses.length) return csvCourses;

        return ScheduleParser.parseLineText(stripped);
    }

    /**
     * 解析 CSV/TSV
     * @param {string} text
     * @returns {Array<Object>}
     */
    static parseCsvText(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) return [];

        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const header = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
        const col = (names) => header.findIndex(h => names.includes(h));

        const nameIdx = col(['课程名', '课程名称', 'name', 'course']);
        const dayIdx = col(['星期', '周几', 'day']);
        const startIdx = col(['开始节次', '起始节次', 'startperiod', 'start']);
        const endIdx = col(['结束节次', '结束', 'endperiod', 'end']);
        const locIdx = col(['地点', '教室', 'location']);
        const teacherIdx = col(['教师', '老师', 'teacher']);
        const weekIdx = col(['周次', '周次类型', 'weektype']);

        if (nameIdx === -1 || dayIdx === -1) return [];

        const items = lines.slice(1).map(line => {
            const parts = line.split(delimiter).map(p => p.trim());
            /** @type {Object} */
            const item = {
                name: parts[nameIdx],
                day: parts[dayIdx]
            };
            if (startIdx !== -1 && parts[startIdx]) item.startPeriod = parts[startIdx];
            if (endIdx !== -1 && parts[endIdx]) item.endPeriod = parts[endIdx];
            if (locIdx !== -1 && parts[locIdx]) item.location = parts[locIdx];
            if (teacherIdx !== -1 && parts[teacherIdx]) item.teacher = parts[teacherIdx];
            if (weekIdx !== -1 && parts[weekIdx]) item.weekType = parts[weekIdx];
            return item;
        });

        return ScheduleParser.normalizeCourses(items);
    }

    /**
     * 解析结构化文本行
     * @param {string} text
     * @returns {Array<Object>}
     */
    static parseLineText(text) {
        const pattern = /(周[一二三四五六日天]|星期[一二三四五六日天])\s*[,，|]?\s*(?:第?\s*)?(\d+)\s*[-~～至]\s*(\d+)\s*节?\s*[,，|]?\s*(.+?)(?:\s*[,，|]\s*(.+))?$/;
        const items = [];

        text.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const match = trimmed.match(pattern);
            if (!match) return;
            items.push({
                day: match[1],
                startPeriod: match[2],
                endPeriod: match[3],
                name: match[4].trim(),
                location: (match[5] || '').trim()
            });
        });

        return ScheduleParser.normalizeCourses(items);
    }

    /**
     * 规范化课程列表
     * @param {Array<Object>} list
     * @returns {Array<Object>}
     */
    static normalizeCourses(list) {
        return list
            .map((raw, index) => ScheduleParser.normalizeCourse(raw, index))
            .filter(Boolean);
    }

    /**
     * 规范化单条课程
     * @param {Object} raw
     * @param {number} index
     * @returns {Object|null}
     */
    static normalizeCourse(raw, index) {
        const name = String(raw.name || raw.course || raw.courseName || '').trim();
        if (!name) return null;

        const day = ScheduleParser.parseDay(raw.day);
        const startPeriod = ScheduleParser.parsePeriod(raw.startPeriod);
        let endPeriod = ScheduleParser.parsePeriod(raw.endPeriod);
        if (startPeriod === null) return null;
        if (endPeriod === null) endPeriod = startPeriod;

        const weekType = ['all', 'odd', 'even'].includes(String(raw.weekType || 'all').toLowerCase())
            ? String(raw.weekType || 'all').toLowerCase()
            : 'all';

        return {
            id: String(raw.id || `import-${Date.now()}-${index}`),
            name,
            day,
            startPeriod,
            endPeriod,
            location: String(raw.location || raw.place || '').trim(),
            teacher: String(raw.teacher || '').trim(),
            weekType,
            color: raw.color || ScheduleParser.COLORS[index % ScheduleParser.COLORS.length]
        };
    }

    /**
     * 解析星期
     * @param {*} raw
     * @returns {number|null}
     */
    static parseDay(raw) {
        if (raw === null || raw === undefined || raw === '') return null;
        const num = parseInt(raw, 10);
        if (!Number.isNaN(num) && num >= 0 && num <= 6) return num;
        const text = String(raw).trim();
        for (const [key, val] of Object.entries(ScheduleParser.DAY_MAP)) {
            if (text.includes(key)) return val;
        }
        return null;
    }

    /**
     * 解析节次
     * @param {*} raw
     * @returns {number|null}
     */
    static parsePeriod(raw) {
        if (raw === null || raw === undefined || raw === '') return null;
        const num = parseInt(raw, 10);
        if (!Number.isNaN(num)) return num;
        const match = String(raw).match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }
}
