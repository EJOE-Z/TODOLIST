/**
 * 子任务模板 - 创建任务时按标题关键词自动拆分
 */
class SubtaskTemplates {
    /** @type {Array<{ keywords: string[], subtasks: string[] }>} */
    static TEMPLATES = [
        {
            keywords: ['英语六级', '六级', 'cet6', 'cet-6'],
            subtasks: ['制定复习计划', '每日背单词', '刷历年真题', '练习听力', '整理作文模板']
        },
        {
            keywords: ['英语四级', '四级', 'cet4'],
            subtasks: ['背单词', '刷真题', '练听力', '模拟考试']
        },
        {
            keywords: ['考研', '研究生'],
            subtasks: ['确定复习科目', '每日专业课', '政治背诵', '英语阅读', '真题模考']
        },
        {
            keywords: ['高数', '高等数学', '微积分'],
            subtasks: ['复习知识点', '刷课后习题', '整理错题', '模拟测验']
        },
        {
            keywords: ['论文', '毕业论文', '毕设'],
            subtasks: ['确定选题', '查阅文献', '撰写初稿', '修改润色', '准备答辩']
        },
        {
            keywords: ['复习', '备考', '考试'],
            subtasks: ['梳理知识框架', '重点背诵', '刷题练习', '模拟测试']
        },
        {
            keywords: ['项目', '开发', '编程'],
            subtasks: ['需求分析', '方案设计', '编码实现', '测试调试', '文档整理']
        },
        {
            keywords: ['Presentation', '答辩', '演讲', '汇报'],
            subtasks: ['准备大纲', '制作 PPT', '演练试讲', '准备 Q&A']
        }
    ];

    /**
     * 根据标题匹配建议子任务
     * @param {string} title
     * @returns {Array<string>}
     */
    static suggest(title) {
        if (!title) return [];
        const lower = title.toLowerCase();

        for (const tpl of SubtaskTemplates.TEMPLATES) {
            if (tpl.keywords.some(kw => lower.includes(kw.toLowerCase()) || title.includes(kw))) {
                return [...tpl.subtasks];
            }
        }
        return [];
    }

    /**
     * 为创建任务参数补全子任务（未提供时自动匹配）
     * @param {Object} args
     * @returns {{ args: Object, autoApplied: boolean, subtasks: Array<string> }}
     */
    static enrichCreateArgs(args) {
        args = { ...args };
        if (args.disable_auto_subtasks) {
            return { args, autoApplied: false, subtasks: args.subtasks || [] };
        }
        if (args.subtasks?.length) {
            return { args, autoApplied: false, subtasks: args.subtasks };
        }
        const suggested = SubtaskTemplates.suggest(args.title);
        if (suggested.length) {
            args.subtasks = suggested;
            return { args, autoApplied: true, subtasks: suggested };
        }
        return { args, autoApplied: false, subtasks: [] };
    }
}
