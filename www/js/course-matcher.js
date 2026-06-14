/**
 * 课程名称与简称匹配（计网→计算机网络、软工→软件工程 等）
 */
class CourseMatcher {
    /** @type {RegExp} */
    static NAME_SUFFIX_PATTERN = /(实验|概论|基础|原理|技术|程序设计|高级编程|课程|与设计|与分析|与实现)$/g;

    /**
     * 常见课程简称 → 课表名称关键词
     * @type {Record<string, Array<string>>}
     */
    static COMMON_ABBR = {
        '计网': ['计算机网络'],
        '软工': ['软件工程'],
        '高数': ['高等数学'],
        '大物': ['大学物理'],
        '线代': ['线性代数'],
        '概率': ['概率论', '概率统计'],
        '数电': ['数字电路', '数字电子'],
        '模电': ['模拟电路', '模拟电子'],
        '信安': ['信息安全'],
        '网安': ['网络安全'],
        '计组': ['计算机组成', '组成原理'],
        '体系结构': ['计算机体系', '体系结构'],
        '编译': ['编译原理'],
        '算法': ['算法设计', '算法与'],
        '数据库': ['数据库'],
        'db': ['数据库'],
        'os': ['操作系统'],
        'ai': ['人工智能'],
        'python': ['python'],
        'java': ['java'],
        'web': ['web', '前端'],
        '前端': ['前端', 'web'],
        '大数': ['大数据'],
        '移动': ['移动应用', '移动开发'],
        '网实': ['计算机网络实验'],
        '软测': ['软件测试'],
        '离散': ['离散数学'],
        '思政': ['思想政治', '思政'],
        '英语': ['大学英语', '英语'],
        '体育': ['体育'],
        '双创': ['创新创业'],
        '创新': ['创新创业']
    };

    /**
     * 从课程全名生成别名列表
     * @param {string} courseName
     * @returns {Array<string>}
     */
    static generateAliases(courseName) {
        /** @type {Set<string>} */
        const aliases = new Set();
        const name = (courseName || '').trim();
        if (!name) {
            return [];
        }

        aliases.add(name);
        aliases.add(name.toLowerCase());

        const core = name.replace(CourseMatcher.NAME_SUFFIX_PATTERN, '').trim();
        if (core) {
            aliases.add(core);
            if (core.length >= 2) {
                aliases.add(core.slice(0, 2));
            }
        }

        const biAbbr = CourseMatcher.buildBiCharAbbreviation(core || name);
        if (biAbbr) {
            aliases.add(biAbbr);
        }

        const withoutTail = (core || name).replace(/与.+$/g, '').trim();
        if (withoutTail.length >= 2) {
            aliases.add(withoutTail);
        }

        return [...aliases].filter(alias => alias.length >= 2);
    }

    /**
     * 生成双词首字简称，如 计算机网络→计网、软件工程→软工
     * @param {string} name
     * @returns {string|null}
     */
    static buildBiCharAbbreviation(name) {
        if (!name || name.length < 4) {
            return null;
        }

        /** @type {string|null} */
        let best = null;
        /** @type {number} */
        let bestScore = 0;

        for (let i = 2; i <= name.length - 2; i++) {
            const left = name.slice(0, i);
            const right = name.slice(i);
            if (left.length < 2 || right.length < 2) {
                continue;
            }

            const abbr = `${left[0]}${right[0]}`;
            const score = Math.min(left.length, right.length);
            if (score > bestScore) {
                best = abbr;
                bestScore = score;
            }
        }

        return best;
    }

    /**
     * 在文本中匹配课表课程（全称、自动生成简称、常见简称）
     * @param {string} text
     * @param {Array<Object>} courses
     * @returns {Object|null}
     */
    static matchInText(text, courses) {
        if (!text || !courses?.length) {
            return null;
        }

        const normalized = text.trim().toLowerCase();
        /** @type {Array<{ course: Object, alias: string, len: number }>} */
        const candidates = [];

        courses.forEach((course) => {
            const name = course.name || '';
            if (!name) {
                return;
            }

            if (normalized.includes(name.toLowerCase())) {
                candidates.push({ course, alias: name, len: name.length });
            }

            CourseMatcher.generateAliases(name).forEach((alias) => {
                if (normalized.includes(alias.toLowerCase())) {
                    candidates.push({ course, alias, len: alias.length });
                }
            });
        });

        Object.entries(CourseMatcher.COMMON_ABBR).forEach(([abbr, keywords]) => {
            if (!normalized.includes(abbr.toLowerCase())) {
                return;
            }
            keywords.forEach((keyword) => {
                const found = courses.find(c => (c.name || '').includes(keyword));
                if (found) {
                    candidates.push({ course: found, alias: abbr, len: abbr.length });
                }
            });
        });

        if (!candidates.length) {
            return null;
        }

        candidates.sort((a, b) => {
            if (b.len !== a.len) {
                return b.len - a.len;
            }
            const textHasLab = normalized.includes('实验');
            if (!textHasLab) {
                const aLab = (a.course.name || '').includes('实验');
                const bLab = (b.course.name || '').includes('实验');
                if (aLab !== bLab) {
                    return aLab ? 1 : -1;
                }
            }
            return (b.course.name?.length || 0) - (a.course.name?.length || 0);
        });

        return candidates[0].course;
    }

    /**
     * 按关键词查找课程（支持简称）
     * @param {string} query
     * @param {Array<Object>} courses
     * @returns {Object|null}
     */
    static findByQuery(query, courses) {
        if (!query || !courses?.length) {
            return null;
        }

        const q = query.trim().toLowerCase();
        const direct = courses.find(c => (c.name || '').toLowerCase().includes(q))
            || courses.find(c => q.includes((c.name || '').toLowerCase()));
        if (direct) {
            return direct;
        }

        return CourseMatcher.matchInText(query, courses);
    }
}
