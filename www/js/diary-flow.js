/**
 * 助手内「写日记」引导（与任务创建流程分离）
 */
class DiaryFlow {
    /**
     * 是否为写日记意图
     * @param {string} message
     * @returns {boolean}
     */
    static isDiaryIntent(message) {
        const t = message.trim();
        return /^(我要)?写(一篇)?日记$/i.test(t)
            || /^记(一篇)?日记$/i.test(t)
            || /给.+写(一篇)?日记/.test(t)
            || /为.+写(一篇)?日记/.test(t);
    }

    /**
     * 解析「给某任务写日记：内容」一次性指令
     * @param {string} message
     * @returns {{ taskQuery: string, content: string }|null}
     */
    static parseOneShot(message) {
        const t = message.trim();
        const patterns = [
            { re: /给[「"']?(.+?)[」"']?写(一篇)?日记[：:\s]+([\s\S]+)/i, contentIdx: 3 },
            { re: /为[「"']?(.+?)[」"']?写(一篇)?日记[：:\s]+([\s\S]+)/i, contentIdx: 3 },
            { re: /给[「"']?(.+?)[」"']?任务写日记[：:\s]+([\s\S]+)/i, contentIdx: 2 }
        ];

        for (const { re, contentIdx } of patterns) {
            const match = t.match(re);
            if (match) {
                const taskQuery = match[1].trim();
                const content = (match[contentIdx] || '').trim();
                if (taskQuery && content) {
                    return { taskQuery, content };
                }
            }
        }
        return null;
    }

    /**
     * 根据上一轮助手回复推断用户正在补充日记内容
     * @param {Array<Object>} apiMessages
     * @param {string} message
     * @returns {boolean}
     */
    static inferDiaryFollowUp(apiMessages, message) {
        const t = message.trim();
        if (!t || DiaryFlow.isDiaryIntent(t) || DiaryFlow.parseOneShot(t)) {
            return false;
        }
        if (/^(创建|添加|新建).*任务$/i.test(t)) {
            return false;
        }

        const lastAssistant = [...(apiMessages || [])]
            .reverse()
            .find(m => m.role === 'assistant');
        if (!lastAssistant?.content) {
            return false;
        }
        return /日记内容|想要记录的日记|记录哪篇日记/.test(lastAssistant.content);
    }

    /**
     * 尝试启动写日记流程
     * @param {string} message
     * @returns {{ draft: Object|null, reply: string, clear: boolean }|null}
     */
    static tryStart(message) {
        const oneShot = DiaryFlow.parseOneShot(message);
        if (oneShot) {
            return {
                draft: null,
                reply: DiaryFlow.saveEntry(oneShot.taskQuery, oneShot.content),
                clear: true
            };
        }

        if (!DiaryFlow.isDiaryIntent(message)) {
            const inline = message.trim().match(/写日记[：:\s]+([\s\S]+)/i);
            if (inline && inline[1].trim()) {
                return {
                    draft: { step: 'awaiting_task', content: inline[1].trim() },
                    reply: DiaryFlow.formatTaskPrompt(inline[1].trim()),
                    clear: false
                };
            }
            return null;
        }

        return {
            draft: { step: 'awaiting_content' },
            reply: '好的，请告诉我您想记录的**日记内容**。\n\n写完后我会帮您挂到对应任务上；也可以说「给完成软工作业写日记：今天进展不错」。',
            clear: false
        };
    }

    /**
     * 推进写日记草稿
     * @param {Object} draft
     * @param {string} message
     * @returns {{ draft: Object|null, reply: string, clear: boolean }|null}
     */
    static advanceDraft(draft, message) {
        const t = message.trim();
        if (!t) {
            return null;
        }

        if (draft.step === 'awaiting_content') {
            draft.content = t;
            draft.step = 'awaiting_task';
            return {
                draft,
                reply: DiaryFlow.formatTaskPrompt(t),
                clear: false
            };
        }

        if (draft.step === 'awaiting_task') {
            const oneShot = DiaryFlow.parseOneShot(`给${t}写日记：${draft.content}`);
            const taskQuery = oneShot?.taskQuery || t;
            return {
                draft: null,
                reply: DiaryFlow.saveEntry(taskQuery, draft.content),
                clear: true
            };
        }

        return null;
    }

    /**
     * 询问要挂到哪个任务
     * @param {string} contentPreview
     * @returns {string}
     */
    static formatTaskPrompt(contentPreview) {
        const preview = contentPreview.length > 40
            ? `${contentPreview.slice(0, 40)}…`
            : contentPreview;
        const pending = typeof ActionExecutor !== 'undefined'
            ? ActionExecutor.getTasks().filter(task => !task.completed)
            : [];
        let taskHint = '';
        if (pending.length) {
            taskHint = '\n\n**未完成任务：**\n'
                + pending.slice(0, 5).map((task, i) => `${i + 1}. ${task.title}`).join('\n');
        }
        return `📔 已记下：「${preview}」\n\n请告诉我要挂到**哪个任务**？直接回复任务名即可，例如「完成软工作业」。${taskHint}`;
    }

    /**
     * 保存日记到任务
     * @param {string} taskQuery
     * @param {string} content
     * @returns {string}
     */
    static saveEntry(taskQuery, content) {
        const result = ActionExecutor.addTaskDiary({ task_query: taskQuery, content });
        if (result.success) {
            return `📔 ${result.message}\n\n可在任务页 📖 或日历「任务日记」查看。`;
        }
        return `❌ ${result.error}\n\n请再说一次任务名称，例如「完成软工作业」。`;
    }
}
