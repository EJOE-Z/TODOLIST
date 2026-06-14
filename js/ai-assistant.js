/**
 * AI 智能助手 - 基于智谱 API + Function Calling
 */
class AIAssistant {
    constructor() {
        /** @type {Array<Object>} */
        this.chatMessages = [];
        /** @type {string|null} */
        this.currentSessionId = null;
        /** @type {HTMLElement|null} */
        this.typingIndicator = null;
        /** @type {boolean} */
        this.isProcessing = false;
        /** @type {Array<Object>} */
        this.apiMessages = [];
        /** @type {Object|null} */
        this.taskDraft = null;
        /** @type {Object|null} */
        this.diaryDraft = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        UserMemory.recordVisit();
        this.loadOrCreateSession();
        this.renderChatHistory();
        this.checkBackendStatus();
        this.showInitialBriefing();
        if (typeof SuggestionEngine !== 'undefined') {
            SuggestionEngine.render();
        }
        this.registerServiceWorker();
    }

    /**
     * 注册 PWA Service Worker
     */
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').then(() => {
                ReminderManager.syncToServiceWorker();
            }).catch(() => { /* 忽略 */ });
        }
    }

    /**
     * 首次进入或每日首次打开时展示简报
     */
    showInitialBriefing() {
        if (UserMemory.shouldShowBriefingToday()) {
            this.showDailyBriefing(this.chatMessages.length > 0);
            return;
        }
        if (this.chatMessages.length === 0) {
            this.showWelcomeMessage();
            if (typeof ProactiveEngine !== 'undefined') {
                ProactiveEngine.check();
            }
        }
    }

    /**
     * @deprecated 使用 ProactiveEngine.check
     */
    showProactiveNudges() {
        if (typeof ProactiveEngine !== 'undefined') {
            ProactiveEngine.check();
        }
    }

    /**
     * 展示主动今日简报
     * @param {boolean} prepend - 是否在已有会话前追加（换日场景）
     */
    showDailyBriefing(prepend) {
        const content = DailyBriefing.generate();
        if (prepend && this.chatMessages.length > 0) {
            this.chatMessages.unshift({
                id: Date.now(),
                sender: 'assistant',
                content,
                timestamp: new Date().toISOString(),
                type: 'briefing'
            });
            this.renderChatHistory();
            this.saveChatHistory();
        } else {
            this.addMessage('assistant', content, { type: 'briefing' });
        }
        UserMemory.markBriefingShown();
    }

    setupEventListeners() {
        document.getElementById('send-message')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        document.querySelectorAll('.quick-command').forEach(btn => {
            btn.addEventListener('click', () => {
                const command = btn.getAttribute('data-command');
                const chatInput = document.getElementById('chat-input');
                if (chatInput) chatInput.value = command;
                this.sendMessage();
            });
        });

        document.getElementById('new-chat-btn')?.addEventListener('click', () => this.newChat());

        document.getElementById('toggle-session-panel')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSessionPanel();
        });

        document.getElementById('session-backdrop')?.addEventListener('click', () => {
            this.closeSessionPanel();
        });

        document.getElementById('chat-history')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.chat-action-btn');
            if (!btn) return;
            if (btn.getAttribute('data-dismiss') === 'true') {
                btn.disabled = true;
                btn.classList.add('chat-action-btn-dismissed');
                return;
            }
            const command = btn.getAttribute('data-command');
            if (!command) return;
            this.submitChatCommand(command);
        });
    }

    /**
     * 展开/收起历史会话抽屉
     */
    toggleSessionPanel() {
        const sidebar = document.getElementById('session-sidebar');
        const backdrop = document.getElementById('session-backdrop');
        const toggle = document.getElementById('toggle-session-panel');
        if (!sidebar) return;

        const willOpen = !sidebar.classList.contains('session-sidebar-open');
        sidebar.classList.toggle('session-sidebar-open', willOpen);
        backdrop?.classList.toggle('session-backdrop-visible', willOpen);
        toggle?.classList.toggle('session-toggle-active', willOpen);
    }

    /**
     * 关闭历史会话抽屉
     */
    closeSessionPanel() {
        document.getElementById('session-sidebar')?.classList.remove('session-sidebar-open');
        document.getElementById('session-backdrop')?.classList.remove('session-backdrop-visible');
        document.getElementById('toggle-session-panel')?.classList.remove('session-toggle-active');
    }

    /**
     * 检查后端连接状态
     */
    async checkBackendStatus() {
        const statusEl = document.getElementById('backend-status');
        try {
            const result = await AIApi.checkHealth();
            if (statusEl && result.data?.ai_configured) {
                statusEl.textContent = '在线 · 智谱 AI 已连接';
            } else if (statusEl) {
                statusEl.textContent = '离线 · 请启动后端服务';
            }
        } catch {
            if (statusEl) {
                statusEl.textContent = `离线 · 无法连接 ${AppConfig.API_BASE_URL}`;
                statusEl.title = '请确认 backend/app.py 已在 5000 端口运行';
            }
        }
    }

    /**
     * 聊天内快捷按钮提交（不依赖输入框）
     * @param {string} command
     */
    async submitChatCommand(command) {
        await this.sendMessage(command);
    }

    /**
     * 发送用户消息
     * @param {string} [forcedMessage] - 快捷按钮直接传入的命令
     */
    async sendMessage(forcedMessage) {
        const input = document.getElementById('chat-input');
        const message = (forcedMessage || input?.value || '').trim();

        if (!message) return;
        if (this.isProcessing) {
            if (!AIAssistant.isImmediateLocalCommand(message)) return;
            this.hideTypingIndicator();
            this.isProcessing = false;
        }

        if (input && !forcedMessage) input.value = '';
        this.addMessage('user', message);
        UserMemory.recordSessionContext('user', message);
        await this.processMessage(message);

        const memoryFeedback = UserMemory.learnFromMessage(message);
        if (memoryFeedback) {
            this.addMessage('assistant', `🧠 ${memoryFeedback}`);
        }
    }

    /**
     * 处理用户消息（AI Agent 循环）
     * @param {string} message - 用户消息
     */
    async processMessage(message) {
        this.isProcessing = true;
        this.showTypingIndicator();

        try {
            // 排程请求优先于「今日概览」查询（「帮我安排今天」也含「安排」二字）
            if (AIAssistant.isReschedulePlanQuery(message)) {
                const plan = PlanRescheduleEngine.rescheduleToday();
                const nowLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                const intro = `🔄 **已根据当前时间（${nowLabel}）重排今日计划**`;
                const finalContent = `${intro}\n\n${SecretaryEngine.formatDailyPlanMarkdown(plan)}`;
                this.hideTypingIndicator();
                this.deliverDailyPlan(plan, finalContent);
                return;
            }

            if (AIAssistant.isDailyPlanQuery(message)) {
                const plan = SecretaryEngine.generateDailyPlan();
                this.hideTypingIndicator();
                this.deliverDailyPlan(plan, SecretaryEngine.formatDailyPlanMarkdown(plan));
                return;
            }

            if (AIAssistant.isWeeklyPlanQuery(message)) {
                const content = PlanningEngine.formatWeeklyPlanMarkdown();
                this.apiMessages.push({ role: 'user', content: message });
                this.apiMessages.push({ role: 'assistant', content: content });
                this.hideTypingIndicator();
                this.addMessage('assistant', content, { type: 'plan' });
                return;
            }

            if (AIAssistant.isWeeklyReviewQuery(message)) {
                const content = WeeklyReview.generate();
                this.hideTypingIndicator();
                this.addMessage('assistant', content, { type: 'briefing' });
                return;
            }

            if (AIAssistant.isListRemindersQuery(message)) {
                const content = ReminderManager.formatListMarkdown();
                this.hideTypingIndicator();
                this.addMessage('assistant', content, {
                    actions: [{ label: '打开日历', command: '切换日历' }]
                });
                return;
            }

            const deleteReminderMatch = AIAssistant.parseDeleteReminderQuery(message);
            if (deleteReminderMatch && !deleteReminderMatch.confirmed) {
                this.hideTypingIndicator();
                this.addMessage('assistant', `确定关闭提醒「${deleteReminderMatch.query}」吗？`, {
                    confirm: {
                        confirmCommand: `确认删除提醒：${deleteReminderMatch.query}`,
                        cancelCommand: '取消'
                    }
                });
                return;
            }
            if (deleteReminderMatch?.confirmed) {
                const result = ActionExecutor.deleteReminder({ reminder_query: deleteReminderMatch.query });
                this.hideTypingIndicator();
                this.addMessage('assistant', result.success ? `✅ ${result.message}` : `❌ ${result.error}`);
                return;
            }

            const postponeMatch = message.match(/^推迟计划[：:\s]*(.+)$/i);
            if (postponeMatch) {
                const parsed = PlanRescheduleEngine.parsePostponeCommand(postponeMatch[1].trim());
                const { taskTitle, subtaskTitle } = parsed;
                const label = subtaskTitle ? `${taskTitle} · ${subtaskTitle}` : taskTitle;

                const shifted = PlanRescheduleEngine.postponeSlotMinutes(taskTitle, subtaskTitle, 30);
                let plan;
                if (shifted) {
                    plan = SecretaryEngine.mergeTodaySlotsIntoPlan(SecretaryEngine.generateDailyPlan());
                } else {
                    if (subtaskTitle) {
                        UserMemory.postponePlanSlot(taskTitle, subtaskTitle);
                    } else {
                        UserMemory.postponePlanTask(taskTitle);
                    }
                    plan = SecretaryEngine.generateDailyPlan();
                }

                const content = `⏭️ 已将「${label}」推迟 30 分钟，更新后的计划：\n\n${SecretaryEngine.formatDailyPlanMarkdown(plan)}`;
                this.hideTypingIndicator();
                this.deliverDailyPlan(plan, content);
                return;
            }

            const subtaskMatch = message.match(/^完成子任务[：:\s]*(.+?)[\s]+(.+)$/i);
            if (subtaskMatch) {
                const result = await ActionExecutor.completeSubtask({
                    task_query: subtaskMatch[1].trim(),
                    subtask_query: subtaskMatch[2].trim()
                });
                this.hideTypingIndicator();
                this.addMessage('assistant', result.success ? `✅ ${result.message}` : `❌ ${result.error}`);
                return;
            }

            if (AIAssistant.isTaskProgressQuery(message)) {
                const content = this.formatTaskProgress();
                this.hideTypingIndicator();
                this.addMessage('assistant', content);
                return;
            }

            if (/^切换日历$/i.test(message.trim())) {
                if (typeof switchTab === 'function') switchTab('calendar');
                this.hideTypingIndicator();
                this.addMessage('assistant', '📅 已切换到日历视图，可点击「全部提醒」管理提醒。');
                return;
            }

            if (/^取消$/i.test(message.trim())) {
                this.taskDraft = null;
                this.diaryDraft = null;
                this.hideTypingIndicator();
                this.addMessage('assistant', '好的，已取消。');
                return;
            }

            if (typeof DiaryFlow !== 'undefined') {
                if (this.diaryDraft) {
                    const diaryResult = DiaryFlow.advanceDraft(this.diaryDraft, message);
                    if (diaryResult) {
                        this.taskDraft = null;
                        this.diaryDraft = diaryResult.clear ? null : diaryResult.draft;
                        this.apiMessages.push({ role: 'user', content: message });
                        this.apiMessages.push({ role: 'assistant', content: diaryResult.reply });
                        this.hideTypingIndicator();
                        this.addMessage('assistant', diaryResult.reply);
                        return;
                    }
                } else {
                    const diaryStart = DiaryFlow.tryStart(message);
                    if (diaryStart) {
                        this.taskDraft = null;
                        this.diaryDraft = diaryStart.clear ? null : diaryStart.draft;
                        this.apiMessages.push({ role: 'user', content: message });
                        this.apiMessages.push({ role: 'assistant', content: diaryStart.reply });
                        this.hideTypingIndicator();
                        this.addMessage('assistant', diaryStart.reply);
                        return;
                    }
                    if (DiaryFlow.inferDiaryFollowUp(this.apiMessages, message)) {
                        this.taskDraft = null;
                        this.diaryDraft = { step: 'awaiting_task', content: message.trim() };
                        const reply = DiaryFlow.formatTaskPrompt(message.trim());
                        this.apiMessages.push({ role: 'user', content: message });
                        this.apiMessages.push({ role: 'assistant', content: reply });
                        this.hideTypingIndicator();
                        this.addMessage('assistant', reply);
                        return;
                    }
                }
            }

            // 快捷指令优先于任务草稿，避免「创建任务」「开始专注」被当成标题或截止时间
            if (typeof TaskCreationFlow !== 'undefined' && /^(创建|添加|新建).*任务$/i.test(message.trim())) {
                this.diaryDraft = null;
                this.taskDraft = { step: 'title' };
                const reply = '好的，请告诉我**任务标题**是什么？\n\n如果是课程作业，可以直接说「完成软件工程作业」这类描述，我会帮您关联课表、设置截止时间和子任务。';
                this.apiMessages.push({ role: 'user', content: message });
                this.apiMessages.push({ role: 'assistant', content: reply });
                this.hideTypingIndicator();
                this.addMessage('assistant', reply);
                return;
            }

            if (AIAssistant.isStartFocusCommand(message)) {
                this.taskDraft = null;
                const finalContent = this.handleStartFocusRequest(message);
                this.apiMessages.push({ role: 'user', content: message });
                this.apiMessages.push({ role: 'assistant', content: finalContent });
                this.hideTypingIndicator();
                this.addMessage('assistant', finalContent);
                return;
            }

            if (AIAssistant.isTodayScheduleQuery(message) || AIAssistant.isBriefingQuery(message)) {
                const scheduleResult = ActionExecutor.getTodaySchedule();
                const finalContent = AIAssistant.isBriefingQuery(message)
                    ? DailyBriefing.generate()
                    : this.formatTodaySchedule(scheduleResult);
                this.apiMessages.push({ role: 'user', content: message });
                this.apiMessages.push({ role: 'assistant', content: finalContent });
                this.hideTypingIndicator();
                const isBriefing = AIAssistant.isBriefingQuery(message);
                this.addMessage('assistant', finalContent, isBriefing ? { type: 'briefing' } : {});
                return;
            }

            if (typeof TaskCreationFlow !== 'undefined') {
                const taskCmd = TaskCreationFlow.parseTaskCommand(message);
                if (taskCmd) {
                    this.taskDraft = null;
                    let result;
                    let reply;
                    if (taskCmd.action === 'delete') {
                        result = ActionExecutor.deleteTask({ task_query: taskCmd.query });
                        reply = result.success ? `✅ ${result.message}` : `❌ ${result.error}`;
                    } else if (taskCmd.action === 'update_deadline') {
                        const deadline = TaskCreationFlow.parseDeadline(taskCmd.deadlineText);
                        if (!deadline) {
                            reply = `❌ 无法识别截止时间「${taskCmd.deadlineText}」，请再说一次，例如：6月10日19点、6.10晚19点前`;
                        } else {
                            result = ActionExecutor.updateTask({
                                task_query: taskCmd.query,
                                deadline
                            });
                            reply = result.success ? `✅ ${result.message}` : `❌ ${result.error}`;
                        }
                    } else {
                        result = ActionExecutor.completeByQuery(taskCmd.query);
                        reply = result.success ? `✅ ${result.message}` : `❌ ${result.error}`;
                    }
                    this.apiMessages.push({ role: 'user', content: message });
                    this.apiMessages.push({ role: 'assistant', content: reply });
                    this.hideTypingIndicator();
                    this.addMessage('assistant', reply);
                    return;
                }
            }

            if (typeof TaskCreationFlow !== 'undefined' && this.taskDraft) {
                if (AIAssistant.shouldInterruptTaskDraft(message)) {
                    this.taskDraft = null;
                } else {
                    const draftReply = TaskCreationFlow.advanceDraft(this, message);
                    if (draftReply !== null) {
                        this.apiMessages.push({ role: 'user', content: message });
                        this.apiMessages.push({ role: 'assistant', content: draftReply });
                        this.hideTypingIndicator();
                        this.addMessage('assistant', draftReply);
                        return;
                    }
                }
            }

            if (typeof TaskCreationFlow !== 'undefined') {
                const extractedTitle = TaskCreationFlow.extractTaskTitle(message);
                if (extractedTitle) {
                    const draft = TaskCreationFlow.initiateDraft(extractedTitle);
                    if (draft) {
                        this.taskDraft = draft;
                        const reply = TaskCreationFlow.formatDeadlinePrompt(draft);
                        this.apiMessages.push({ role: 'user', content: message });
                        this.apiMessages.push({ role: 'assistant', content: reply });
                        this.hideTypingIndicator();
                        this.addMessage('assistant', reply);
                        return;
                    }
                }
            }

            // 「每周三晚上五点半提醒我值班」类每周重复提醒
            const weeklyReminder = ReminderScheduler.parseWeeklyReminderCommand(message);
            if (weeklyReminder) {
                const result = ActionExecutor.setReminder({
                    title: weeklyReminder.title,
                    repeat: 'weekly',
                    time_of_day: weeklyReminder.time_of_day,
                    repeat_weekday: weeklyReminder.repeat_weekday
                });
                const dayLabel = ReminderScheduler.WEEKDAY_LABELS[weeklyReminder.repeat_weekday];
                const nextTime = ReminderScheduler.computeNextWeeklyTime(
                    weeklyReminder.repeat_weekday,
                    weeklyReminder.time_of_day
                );
                const finalContent = result.success
                    ? `🔔 已设置每周提醒「${result.reminder?.title || weeklyReminder.title}」\n\n每周**${dayLabel} ${weeklyReminder.time_of_day}** 到点提醒您（下次：${nextTime.toLocaleString('zh-CN')}）`
                    : `❌ ${result.error}`;
                this.apiMessages.push({ role: 'user', content: message });
                this.apiMessages.push({ role: 'assistant', content: finalContent });
                this.hideTypingIndicator();
                this.addMessage('assistant', finalContent);
                return;
            }

            // 「明天中午十二点要开会」类定时提醒本地处理
            const scheduledReminder = ReminderScheduler.parseScheduledReminderCommand(message);
            if (scheduledReminder) {
                const result = ActionExecutor.setReminder({
                    title: scheduledReminder.title,
                    time: scheduledReminder.time
                });
                const finalContent = result.success
                    ? `🔔 已设置提醒「${result.reminder?.title || scheduledReminder.title}」，将在 **${new Date(scheduledReminder.time).toLocaleString('zh-CN')}** 提醒您。`
                    : `❌ ${result.error}`;
                this.apiMessages.push({ role: 'user', content: message });
                this.apiMessages.push({ role: 'assistant', content: finalContent });
                this.hideTypingIndicator();
                this.addMessage('assistant', finalContent);
                return;
            }

            // 「X分钟后提醒」本地处理，确保真实写入并调度
            const quickReminder = ReminderScheduler.parseQuickReminderCommand(message);
            if (quickReminder) {
                const result = ActionExecutor.setReminder({
                    title: quickReminder.title,
                    minutes_from_now: quickReminder.minutes_from_now
                });
                const finalContent = result.success
                    ? `🔔 已设置提醒「${quickReminder.title}」，将在 **${quickReminder.minutes_from_now} 分钟**后（${new Date(Date.now() + quickReminder.minutes_from_now * 60000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）提醒您。`
                    : `❌ ${result.error}`;
                this.apiMessages.push({ role: 'user', content: message });
                this.apiMessages.push({ role: 'assistant', content: finalContent });
                this.hideTypingIndicator();
                this.addMessage('assistant', finalContent);
                return;
            }

            // 「每天/每晚X点提醒」本地处理，仅写入提醒
            const dailyReminder = ReminderScheduler.parseDailyReminderCommand(message);
            if (dailyReminder) {
                const result = ActionExecutor.setReminder({
                    title: dailyReminder.title,
                    repeat: 'daily',
                    time_of_day: dailyReminder.time_of_day
                });
                const nextTime = ReminderScheduler.computeNextDailyTime(dailyReminder.time_of_day);
                const finalContent = result.success
                    ? `🔔 已设置每日提醒「${dailyReminder.title}」\n\n每天 **${dailyReminder.time_of_day}** 到点提醒您（下次：${nextTime.toLocaleString('zh-CN')}）`
                    : `❌ ${result.error || result.message}`;
                this.apiMessages.push({ role: 'user', content: message });
                this.apiMessages.push({ role: 'assistant', content: finalContent });
                this.hideTypingIndicator();
                this.addMessage('assistant', finalContent);
                return;
            }

            const context = ActionExecutor.buildContext();
            const systemPrompt = buildSystemPrompt(context);

            if (this.apiMessages.length === 0 || this.apiMessages[0].role !== 'system') {
                this.apiMessages = [{ role: 'system', content: systemPrompt }];
            } else {
                this.apiMessages[0].content = systemPrompt;
            }

            this.apiMessages.push({ role: 'user', content: message });

            let iterations = AppConfig.AI_MAX_ITERATIONS;
            let finalContent = '';

            while (iterations-- > 0) {
                const data = await AIApi.chatWithAI(this.apiMessages, AI_TOOLS);
                const assistantMsg = data.message;

                if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
                    this.apiMessages.push({
                        role: 'assistant',
                        content: assistantMsg.content || '',
                        tool_calls: assistantMsg.tool_calls
                    });

                    for (const toolCall of assistantMsg.tool_calls) {
                        const funcName = toolCall.function.name;
                        let funcArgs = {};
                        try {
                            funcArgs = JSON.parse(toolCall.function.arguments || '{}');
                        } catch {
                            funcArgs = {};
                        }

                        const result = await ActionExecutor.execute(funcName, funcArgs);

                        this.apiMessages.push({
                            role: 'tool',
                            content: JSON.stringify(result, null, 0),
                            tool_call_id: toolCall.id
                        });
                    }
                    continue;
                }

                finalContent = assistantMsg.content || '好的，已为您处理完毕。';
                this.apiMessages.push({ role: 'assistant', content: finalContent });
                break;
            }

            if (!finalContent) {
                finalContent = '操作已完成。还有什么可以帮您的吗？';
            }

            this.hideTypingIndicator();
            this.addMessage('assistant', finalContent);

        } catch (error) {
            this.hideTypingIndicator();
            const fallback = await this.fallbackProcess(message);
            this.addMessage('assistant', fallback);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 判断是否为纯查询「今日安排」类问题（非创建/修改等操作）
     * @param {string} message
     * @returns {boolean}
     */
    static isTodayScheduleQuery(message) {
        if (AIAssistant.isDailyPlanQuery(message) || AIAssistant.isBriefingQuery(message)) {
            return false;
        }

        const trimmed = message.trim();
        if (/^(今天|今日)(有什么|啥)(安排|事|任务|课)/.test(trimmed)) return true;
        if (/^(今日安排|今天安排)$/.test(trimmed)) return true;

        const isAboutToday = /今天|今日/.test(message);
        const isOverviewQuery = /有什么|什么事|干嘛|做什么|怎么样|查看|看看|列出|汇总/.test(message);
        const isPlanRequest = /帮我|规划|排(程|一下)|怎么安排|如何安排|时间线/.test(message);
        const isAction = /创建|添加|删除|设置|完成|修改|新建|导入|开始专注|提醒/.test(message);
        return isAboutToday && isOverviewQuery && !isPlanRequest && !isAction;
    }

    /**
     * 判断是否为「今日简报」查询
     * @param {string} message
     * @returns {boolean}
     */
    static isBriefingQuery(message) {
        return /^(今日简报|早间简报|打开简报|查看简报)$/i.test(message.trim());
    }

    /**
     * 判断是否为「帮我安排今天」类排程请求
     * @param {string} message
     * @returns {boolean}
     */
    static isDailyPlanQuery(message) {
        const trimmed = message.trim();
        if (/^(帮我安排今天|今日计划|怎么安排今天|今天怎么安排|帮我规划今天|安排一下今天)$/i.test(trimmed)) {
            return true;
        }
        if (/帮我.*(安排|规划).*(今天|今日)/.test(trimmed)) return true;
        if (/(今天|今日).*(怎么|如何).*(安排|规划)/.test(trimmed)) return true;
        if (/按.*时间(线|表).*(安排|规划)/.test(trimmed)) return true;
        return false;
    }

    static isReschedulePlanQuery(message) {
        return /^(重排今日计划|重排计划|重新安排今天|刷新今日计划)$/.test(message.trim());
    }

    /**
     * 本地即时命令（无需等待 AI，可打断进行中的请求）
     * @param {string} message
     * @returns {boolean}
     */
    static isImmediateLocalCommand(message) {
        const trimmed = message.trim();
        return AIAssistant.isReschedulePlanQuery(trimmed)
            || AIAssistant.isDailyPlanQuery(trimmed)
            || AIAssistant.isWeeklyPlanQuery(trimmed)
            || AIAssistant.isWeeklyReviewQuery(trimmed)
            || AIAssistant.isListRemindersQuery(trimmed)
            || AIAssistant.isTaskProgressQuery(trimmed)
            || AIAssistant.isBriefingQuery(trimmed)
            || /^推迟计划[：:\s]/.test(trimmed)
            || /^开始专注[：:\s]/.test(trimmed)
            || /^完成子任务[：:\s]/.test(trimmed)
            || /^切换日历$/i.test(trimmed)
            || /^取消$/i.test(trimmed)
            || /^确认删除提醒[：:\s]/.test(trimmed);
    }

    static isWeeklyPlanQuery(message) {
        const t = message.trim();
        return /^(这周怎么安排|本周计划|本周安排|这周安排)$/.test(t)
            || /(本周|这周).*(怎么|如何).*(安排|规划)/.test(t);
    }

    static isWeeklyReviewQuery(message) {
        return /^(本周复盘|这周复盘|本周总结|周报)$/.test(message.trim())
            || /(本周|这周).*(复盘|总结)/.test(message);
    }

    static isListRemindersQuery(message) {
        const t = message.trim();
        return /^(列出所有提醒|全部提醒|我的提醒|查看提醒|有哪些提醒)$/.test(t)
            || /(列出|查看|有哪些).*(全部)?提醒/.test(t);
    }

    /**
     * @param {string} message
     * @returns {{ query: string, confirmed: boolean }|null}
     */
    /**
     * 从删除/关闭提醒指令中提取事件关键词
     * @param {string} message
     * @returns {string|null}
     */
    static extractDeleteReminderSubject(message) {
        const trimmed = message.trim();
        const patterns = [
            /^确认删除提醒[：:\s]*(.+)$/i,
            /^删除提醒[：:\s]*(.+)$/i,
            /^(?:删除|关闭|关掉|取消|去掉|移除)(.+?)提醒$/i,
            /^(?:删除|关闭|关掉|取消|去掉|移除)提醒[：:\s]*(.+)$/i
        ];

        for (const pattern of patterns) {
            const match = trimmed.match(pattern);
            if (!match?.[1]) {
                continue;
            }
            let subject = match[1].trim();
            if (typeof ActionExecutor !== 'undefined') {
                subject = ActionExecutor.normalizeReminderQuery(subject);
            } else if (typeof ReminderScheduler !== 'undefined') {
                subject = ReminderScheduler.extractEventTitle(subject);
            }
            return subject || match[1].trim();
        }

        return null;
    }

    static parseDeleteReminderQuery(message) {
        const trimmed = message.trim();
        const subject = AIAssistant.extractDeleteReminderSubject(trimmed);
        if (!subject) {
            return null;
        }
        const confirmed = /^确认删除提醒[：:\s]/i.test(trimmed);
        return { query: subject, confirmed };
    }

    static isTaskProgressQuery(message) {
        return /(.+)(进度|做到哪|怎么样了)/.test(message)
            || /^(任务进度|查看进度)$/.test(message.trim());
    }

    /**
     * 判断是否为「开始专注」相关指令
     * @param {string} message
     * @returns {boolean}
     */
    static isStartFocusCommand(message) {
        const trimmed = message.trim();
        return /^(开始专注|专注模式|番茄钟|开始番茄钟)$/i.test(trimmed)
            || /^(开始专注|专注)[：:\s]+\S+/i.test(trimmed);
    }

    /**
     * 创建任务草稿进行中时，是否应中断草稿并执行快捷指令
     * @param {string} message
     * @returns {boolean}
     */
    static shouldInterruptTaskDraft(message) {
        const trimmed = message.trim();
        if (typeof SuggestionEngine !== 'undefined' && SuggestionEngine.QUICK_COMMANDS.has(trimmed)) {
            return true;
        }
        if (/^(专注模式|番茄钟|开始番茄钟|切换日历)$/i.test(trimmed)) {
            return true;
        }
        if (/^(创建|添加|新建).*任务$/i.test(trimmed)) {
            return true;
        }
        return AIAssistant.isStartFocusCommand(message)
            || AIAssistant.isTodayScheduleQuery(message)
            || AIAssistant.isBriefingQuery(message);
    }

    handleStartFocusRequest(message) {
        const match = message.match(/(?:开始专注|专注)[：:\s]+(.+)/i);
        const taskQuery = match ? match[1].trim() : null;
        const result = ActionExecutor.startFocus({ task_query: taskQuery || undefined });

        if (result.error) {
            return `❌ ${result.error}`;
        }
        if (result.needSelection) {
            return `🎯 ${result.message}`;
        }
        return `🎯 ${result.message}`;
    }

    /**
     * 显示专注任务选择弹窗
     * @param {Array<Object>} tasks - 待办任务列表
     */
    showFocusTaskPicker(tasks) {
        const modal = document.getElementById('focus-task-picker-modal');
        const listEl = document.getElementById('focus-task-list');
        if (!modal || !listEl) return;

        listEl.innerHTML = tasks.map(task => {
            const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
            const deadline = task.deadline
                ? `<span class="text-xs text-gray-400 ml-2">截止 ${task.deadline.split('T')[0]}</span>`
                : '';
            return `
                <button
                    class="focus-task-option w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-all flex items-center justify-between"
                    data-task-id="${task.id}"
                    data-task-title="${task.title}">
                    <span>${priority} ${task.title}${deadline}</span>
                    <i class="fa fa-play-circle text-orange-500"></i>
                </button>
            `;
        }).join('');

        listEl.querySelectorAll('.focus-task-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const taskId = btn.getAttribute('data-task-id');
                const taskTitle = btn.getAttribute('data-task-title');
                this.closeFocusTaskPicker();
                if (window.taskManager) {
                    window.taskManager.startFocusMode(taskId);
                }
                if (typeof UserMemory !== 'undefined') {
                    UserMemory.recordFocusStarted(taskTitle);
                }
                this.addMessage('assistant', `🎯 已为「${taskTitle}」启动专注模式（25分钟），加油！`);
            });
        });

        document.getElementById('close-focus-task-picker')?.addEventListener('click', () => this.closeFocusTaskPicker(), { once: true });
        document.getElementById('cancel-focus-task-picker')?.addEventListener('click', () => this.closeFocusTaskPicker(), { once: true });

        modal.classList.remove('hidden');
    }

    /**
     * 关闭专注任务选择弹窗
     */
    closeFocusTaskPicker() {
        document.getElementById('focus-task-picker-modal')?.classList.add('hidden');
    }

    /**
     * 后端不可用时的本地降级处理
     * @param {string} message - 用户消息
     * @returns {Promise<string>}
     */
    async fallbackProcess(message) {
        const deleteReminderMatch = AIAssistant.parseDeleteReminderQuery(message);
        if (deleteReminderMatch?.confirmed) {
            const result = ActionExecutor.deleteReminder({ reminder_query: deleteReminderMatch.query });
            return result.success ? `✅ ${result.message}` : `❌ ${result.error}`;
        }
        if (deleteReminderMatch && !deleteReminderMatch.confirmed) {
            return `确定删除提醒「${deleteReminderMatch.query}」吗？请回复：确认删除提醒：${deleteReminderMatch.query}`;
        }
        if (/今天.*(安排|任务|课)/i.test(message)) {
            const result = ActionExecutor.getTodaySchedule();
            return this.formatTodaySchedule(result);
        }
        if (/^(创建|添加|新建).*任务$/i.test(message.trim())) {
            this.diaryDraft = null;
            this.taskDraft = { step: 'title' };
            return '好的，请告诉我**任务标题**是什么？\n\n如果是课程作业，可以直接说「完成软件工程作业」，我会帮您关联课表、设置截止时间和子任务。';
        }
        if (typeof DiaryFlow !== 'undefined') {
            if (this.diaryDraft) {
                const diaryResult = DiaryFlow.advanceDraft(this.diaryDraft, message);
                if (diaryResult) {
                    this.taskDraft = null;
                    this.diaryDraft = diaryResult.clear ? null : diaryResult.draft;
                    return diaryResult.reply;
                }
            }
            const diaryStart = DiaryFlow.tryStart(message);
            if (diaryStart) {
                this.taskDraft = null;
                this.diaryDraft = diaryStart.clear ? null : diaryStart.draft;
                return diaryStart.reply;
            }
            if (DiaryFlow.inferDiaryFollowUp(this.apiMessages, message)) {
                this.taskDraft = null;
                this.diaryDraft = { step: 'awaiting_task', content: message.trim() };
                return DiaryFlow.formatTaskPrompt(message.trim());
            }
        }
        if (AIAssistant.isStartFocusCommand(message)) {
            this.taskDraft = null;
            this.diaryDraft = null;
            return this.handleStartFocusRequest(message);
        }
        if (typeof TaskCreationFlow !== 'undefined') {
            const taskCmd = TaskCreationFlow.parseTaskCommand(message);
            if (taskCmd) {
                this.taskDraft = null;
                if (taskCmd.action === 'update_deadline') {
                    const deadline = TaskCreationFlow.parseDeadline(taskCmd.deadlineText);
                    if (!deadline) {
                        return `❌ 无法识别截止时间「${taskCmd.deadlineText}」`;
                    }
                    const result = ActionExecutor.updateTask({ task_query: taskCmd.query, deadline });
                    return result.success ? `✅ ${result.message}` : `❌ ${result.error}`;
                }
                const result = taskCmd.action === 'delete'
                    ? ActionExecutor.deleteTask({ task_query: taskCmd.query })
                    : ActionExecutor.completeByQuery(taskCmd.query);
                return result.success ? `✅ ${result.message}` : `❌ ${result.error}`;
            }
        }
        if (/(创建|添加|新建).*任务/i.test(message)) {
            const match = message.match(/任务[：:\s]+(.+)/i);
            if (match && typeof TaskCreationFlow !== 'undefined') {
                const draft = TaskCreationFlow.initiateDraft(match[1].trim());
                if (draft) {
                    this.taskDraft = draft;
                    return TaskCreationFlow.formatDeadlinePrompt(draft);
                }
                const r = ActionExecutor.createTask({ title: match[1].trim(), force: true });
                return r.message || '任务已创建';
            }
            ActionExecutor.openCreateTaskForm();
            return '🎯 请在弹出的表单中填写任务信息。';
        }
        if (typeof TaskCreationFlow !== 'undefined') {
            const extractedTitle = TaskCreationFlow.extractTaskTitle(message);
            if (extractedTitle) {
                const draft = TaskCreationFlow.initiateDraft(extractedTitle);
                if (draft) {
                    this.taskDraft = draft;
                    return TaskCreationFlow.formatDeadlinePrompt(draft);
                }
            }
            if (this.taskDraft) {
                if (AIAssistant.shouldInterruptTaskDraft(message)) {
                    this.taskDraft = null;
                } else {
                    const draftReply = TaskCreationFlow.advanceDraft(this, message);
                    if (draftReply !== null) {
                        return draftReply;
                    }
                }
            }
        }
        if (/(待办|未完成).*任务/i.test(message)) {
            const r = ActionExecutor.listTasks({ filter: 'pending' });
            return this.formatTaskList(r);
        }
        if (/课表|课程表/i.test(message)) {
            const r = ActionExecutor.listSchedule({});
            return this.formatSchedule(r);
        }
        if (/统计|报告/i.test(message)) {
            const r = ActionExecutor.getStatistics();
            const s = r.statistics;
            return `📊 总任务 ${s.total}，已完成 ${s.completed}（${s.completionRate}），待办 ${s.pending}，专注 ${s.totalFocusMinutes} 分钟`;
        }
        const weeklyReminder = ReminderScheduler.parseWeeklyReminderCommand(message);
        if (weeklyReminder) {
            const result = ActionExecutor.setReminder({
                title: weeklyReminder.title,
                repeat: 'weekly',
                time_of_day: weeklyReminder.time_of_day,
                repeat_weekday: weeklyReminder.repeat_weekday
            });
            const dayLabel = ReminderScheduler.WEEKDAY_LABELS[weeklyReminder.repeat_weekday];
            const nextTime = ReminderScheduler.computeNextWeeklyTime(
                weeklyReminder.repeat_weekday,
                weeklyReminder.time_of_day
            );
            return result.success
                ? `🔔 已设置每周提醒「${weeklyReminder.title}」，每周${dayLabel} ${weeklyReminder.time_of_day}（下次：${nextTime.toLocaleString('zh-CN')}）`
                : `❌ ${result.error}`;
        }
        const quickReminder = ReminderScheduler.parseQuickReminderCommand(message);
        if (quickReminder) {
            const result = ActionExecutor.setReminder({
                title: quickReminder.title,
                minutes_from_now: quickReminder.minutes_from_now
            });
            return result.success
                ? `🔔 已设置提醒「${quickReminder.title}」，${quickReminder.minutes_from_now} 分钟后提醒`
                : `❌ ${result.error}`;
        }
        const dailyReminder = ReminderScheduler.parseDailyReminderCommand(message);
        if (dailyReminder) {
            const result = ActionExecutor.setReminder({
                title: dailyReminder.title,
                repeat: 'daily',
                time_of_day: dailyReminder.time_of_day
            });
            return result.success
                ? `🔔 已设置每日提醒「${dailyReminder.title}」，每天 ${dailyReminder.time_of_day} 到点提醒`
                : `❌ ${result.error || result.message}`;
        }
        if (/打开|切换/i.test(message)) {
            if (/任务/i.test(message)) {
                ActionExecutor.switchView({ view: 'tasks' });
                return '📋 已切换到任务管理';
            }
            if (/课表|课程/i.test(message)) {
                ActionExecutor.switchView({ view: 'schedule' });
                return '📚 已切换到课程表';
            }
            if (/日历/i.test(message)) {
                ActionExecutor.switchView({ view: 'calendar' });
                return '📅 已切换到日历';
            }
        }

        return `⚠️ 无法连接 AI 服务，请确保后端已启动：\n\`cd backend && python app.py\`\n\n错误信息已记录。您仍可使用快捷命令进行基本操作。`;
    }

    /**
     * 格式化任务进度回复
     * @returns {string}
     */
    formatTaskProgress() {
        const tasks = ActionExecutor.getTasks().filter(t => !t.completed);
        if (!tasks.length) return '✅ 当前没有进行中的任务。';

        let text = '📋 **任务进度**\n\n';
        tasks.slice(0, 8).forEach((t, i) => {
            const subs = t.subtasks || [];
            const done = subs.filter(s => s.completed).length;
            const insight = UserMemory.getTaskInsight(t.title);
            const hint = typeof PlanningEngine !== 'undefined' ? PlanningEngine.backwardPlanHint(t) : null;
            text += `${i + 1}. **${t.title}**`;
            if (subs.length) text += `（子任务 ${done}/${subs.length}）`;
            if (insight?.focusCount) text += ` · 已专注 ${insight.focusCount} 次`;
            if (hint) text += `\n   ${hint}`;
            text += '\n';
        });
        return text;
    }

    /**
     * 格式化今日安排
     * @param {Object} data
     * @returns {string}
     */
    formatTodaySchedule(data) {
        let text = `📅 **${data.date}** · 今日概览\n\n`;
        text += '_以下为当前数据汇总；若要按时间段排计划，请说「帮我安排今天」。_\n\n';

        if (data.courses?.length) {
            text += `📚 今日课程（${data.courses.length}）：\n`;
            data.courses.forEach((c, i) => { text += `${i + 1}. ${c.name} ${c.periods}\n`; });
        } else {
            text += '📚 今日课程：无';
        }
        text += '\n\n';

        const pending = data.pendingTasks || [];
        const dueToday = data.tasksDueToday || [];

        if (pending.length) {
            text += `✅ 待办任务（共 ${pending.length} 项）：\n`;
            pending.forEach((t, i) => {
                const p = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
                let line = `${i + 1}. ${p} ${t.title}`;
                if (t.daysUntilDeadline !== null && t.daysUntilDeadline !== undefined) {
                    line += t.daysUntilDeadline === 0 ? '（今天截止）' : `（${t.daysUntilDeadline} 天后截止）`;
                } else if (t.deadline) {
                    line += `（截止：${t.deadline.split('T')[0]}）`;
                } else {
                    line += '（无截止日期）';
                }
                text += line + '\n';
                if (t.subtasks?.length) {
                    t.subtasks.forEach(s => {
                        text += `   ${s.completed ? '✅' : '⬜'} ${s.title}\n`;
                    });
                }
            });
        } else {
            text += '✅ 待办任务：无';
        }

        text += '\n';
        if (dueToday.length) {
            text += `\n⏰ 今日截止（${dueToday.length} 项）：${dueToday.map(t => t.title).join('、')}\n`;
        } else if (pending.length) {
            text += '\n⏰ 今日截止：无（上述待办任务的截止日期不是今天，但仍需推进）\n';
        } else {
            text += '\n⏰ 今日截止：无\n';
        }

        if (data.reminders?.length) {
            text += `\n🔔 今日提醒（${data.reminders.length}）：\n`;
            data.reminders.forEach(r => { text += `- ${r.time} ${r.title}\n`; });
        } else {
            text += '\n🔔 今日提醒：无';
        }

        return text;
    }

    /**
     * 格式化任务列表
     * @param {Object} data
     * @returns {string}
     */
    formatTaskList(data) {
        if (!data.tasks?.length) return '🎉 没有待办任务！';
        let text = `📋 共 ${data.count} 个任务：\n\n`;
        data.tasks.forEach((t, i) => {
            const p = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
            text += `${i + 1}. ${p} ${t.title}${t.completed ? ' ✅' : ''}\n`;
        });
        return text;
    }

    /**
     * 格式化课表
     * @param {Object} data
     * @returns {string}
     */
    formatSchedule(data) {
        if (!data.courses?.length) return '📚 课程表为空';
        let text = `📚 共 ${data.count} 门课程：\n\n`;
        data.courses.forEach(c => {
            text += `- **${c.name}** ${c.day} ${c.periods}`;
            if (c.location) text += ` @ ${c.location}`;
            text += '\n';
        });
        return text;
    }

    /**
     * 展示今日计划并保存快照（供自动重排跟踪）
     * @param {Object} plan
     * @param {string} content
     */
    deliverDailyPlan(plan, content) {
        if (typeof PlanRescheduleEngine !== 'undefined') {
            PlanRescheduleEngine.saveTodayPlan(plan);
        }
        const actions = [];
        if (plan.topPriority) {
            actions.push({ label: '开始专注', command: `开始专注：${plan.topPriority.title}` });
        }
        actions.push({ label: '重排计划', command: '重排今日计划' });
        actions.push({ label: '今日概览', command: '今天有什么安排' });
        const planBlocks = (plan.blocks || [])
            .filter(b => b.type === 'suggestion')
            .map(b => ({ ...b, actions: PlanningEngine.getBlockActions(b) }));
        this.addMessage('assistant', content, { type: 'plan', actions, planBlocks });
        this.apiMessages.push({ role: 'assistant', content });
    }

    /**
     * 添加聊天消息
     * @param {string} sender - user | assistant
     * @param {string} content - 消息内容
     * @param {{ type?: string }} [options] - 可选消息类型
     */
    addMessage(sender, content, options = {}) {
        const msg = {
            id: Date.now() + Math.random(),
            sender,
            content,
            timestamp: new Date().toISOString()
        };
        if (options.type) {
            msg.type = options.type;
        }
        if (options.actions?.length) {
            msg.actions = options.actions;
        }
        if (options.planBlocks?.length) {
            msg.planBlocks = options.planBlocks;
        }
        if (options.confirm) {
            msg.confirm = options.confirm;
        }
        this.chatMessages.push(msg);
        this.renderChatHistory();
        this.saveChatHistory();
        if (sender === 'assistant') {
            UserMemory.recordSessionContext('assistant', content.slice(0, 120));
        }
        if (typeof SuggestionEngine !== 'undefined') {
            SuggestionEngine.render();
        }
    }

    renderChatHistory() {
        const chatHistory = document.getElementById('chat-history');
        if (!chatHistory) return;

        chatHistory.innerHTML = this.chatMessages.map(message => {
            const isUser = message.sender === 'user';
            const isBriefing = message.type === 'briefing';
            const isPlan = message.type === 'plan';
            const isNudge = message.type === 'nudge';
            const timestamp = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const actionsHtml = message.actions?.length
                ? `<div class="chat-actions">${message.actions.map(a => {
                    if (a.dismiss) {
                        return `<button type="button" class="chat-action-btn" data-dismiss="true">${this.escapeHtml(a.label)}</button>`;
                    }
                    return `<button type="button" class="chat-action-btn" data-command="${this.escapeAttr(a.command || '')}">${this.escapeHtml(a.label)}</button>`;
                }).join('')}</div>`
                : '';

            const planBlocksHtml = message.planBlocks?.length
                ? `<div class="plan-blocks">${message.planBlocks.map(b => `
                    <div class="plan-block-row">
                        <span class="plan-block-time">${this.escapeHtml(b.time)}</span>
                        <span class="plan-block-label">${this.escapeHtml(b.label)}</span>
                        ${b.actions?.length ? `<div class="plan-block-actions">${b.actions.map(a =>
                            `<button type="button" class="chat-action-btn chat-action-btn-sm" data-command="${this.escapeAttr(a.command)}">${this.escapeHtml(a.label)}</button>`
                        ).join('')}</div>` : ''}
                    </div>`).join('')}</div>`
                : '';

            const confirmHtml = message.confirm
                ? `<div class="chat-actions chat-confirm-actions">
                    <button type="button" class="chat-action-btn chat-action-btn-danger" data-command="${this.escapeAttr(message.confirm.confirmCommand)}">确认</button>
                    <button type="button" class="chat-action-btn" data-command="${this.escapeAttr(message.confirm.cancelCommand || '取消')}">取消</button>
                   </div>`
                : '';

            if (isUser) {
                return `
                    <div class="chat-row chat-row-user">
                        <div class="chat-row-inner">
                            <div>
                                <div class="chat-bubble chat-bubble-user">${this.formatMessage(message.content)}</div>
                                <div class="chat-time chat-time-right">${timestamp}</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            const bubbleClass = isBriefing
                ? ' chat-bubble-briefing'
                : isPlan
                    ? ' chat-bubble-plan'
                    : isNudge
                        ? ' chat-bubble-nudge'
                        : '';

            const bodyHtml = (isBriefing || isPlan)
                ? this.formatBriefing(message.content)
                : this.formatMessage(message.content);

            return `
                <div class="chat-row chat-row-assistant">
                    <div class="chat-row-inner">
                        <div class="chat-avatar"><i class="fa fa-robot"></i></div>
                        <div>
                            <div class="chat-bubble chat-bubble-assistant${bubbleClass}">
                                ${bodyHtml}
                                ${planBlocksHtml}
                                ${actionsHtml}
                                ${confirmHtml}
                            </div>
                            <div class="chat-time">${timestamp}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    /**
     * 格式化今日简报为紧凑 HTML
     * @param {string} content
     * @returns {string}
     */
    formatBriefing(content) {
        const lines = content.split('\n').map(line => line.trim()).filter(Boolean);

        return lines.map(line => {
            if (line === '---') {
                return '<div class="briefing-divider"></div>';
            }
            if (line.startsWith('### ')) {
                return `<div class="briefing-section">${line.slice(4)}</div>`;
            }
            if (/^\*(.+)\*$/.test(line)) {
                return `<div class="briefing-footnote">${line.slice(1, -1)}</div>`;
            }
            const html = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            return `<div class="briefing-line">${html}</div>`;
        }).join('');
    }

    /**
     * 格式化消息内容为 HTML
     * @param {string} content
     * @returns {string}
     */
    formatMessage(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^### (.+)$/gm, '<div class="msg-section-title">$1</div>')
            .replace(/^---$/gm, '<div class="msg-divider"></div>')
            .replace(/^\*([^*\n]+)\*$/gm, '<div class="msg-footnote">$1</div>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\n{2,}/g, '\n')
            .replace(/\n/g, '<br>');
    }

    showTypingIndicator() {
        const chatHistory = document.getElementById('chat-history');
        if (!chatHistory) return;

        this.typingIndicator = document.createElement('div');
        this.typingIndicator.className = 'chat-row chat-row-assistant';
        this.typingIndicator.innerHTML = `
            <div class="chat-row-inner">
                <div class="chat-avatar"><i class="fa fa-robot"></i></div>
                <div class="typing-bubble">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            </div>
        `;
        chatHistory.appendChild(this.typingIndicator);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    hideTypingIndicator() {
        if (this.typingIndicator) {
            this.typingIndicator.remove();
            this.typingIndicator = null;
        }
    }

    showWelcomeMessage() {
        this.addMessage('assistant',
            '👋 您好！我是您的**学习助手**。\n\n' +
            '我会结合课表、待办和您的习惯，帮您：\n' +
            '- **安排今日计划**（说「帮我安排今天」）\n' +
            '- 创建/管理任务和提醒\n' +
            '- 在合适的时间提醒您专注\n' +
            '- 主动跟进截止日与未完成任务\n\n' +
            '试试说：「帮我安排今天」或「创建一个高数复习任务，周五截止」',
            {
                actions: [
                    { label: '帮我安排今天', command: '帮我安排今天' },
                    { label: '今日简报', command: '今日简报' }
                ]
            }
        );
    }

    /**
     * 转义 HTML 属性值
     * @param {string} text
     * @returns {string}
     */
    escapeAttr(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    /**
     * 转义 HTML 文本
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    loadOrCreateSession() {
        this.taskDraft = null;
        this.diaryDraft = null;
        const sessions = JSON.parse(UserStorage.getItem('chatSessions') || '[]');
        if (sessions.length > 0) {
            this.currentSessionId = sessions[sessions.length - 1].id;
            const session = sessions.find(s => s.id === this.currentSessionId);
            if (session) {
                this.chatMessages = session.messages || [];
                this.apiMessages = session.apiMessages || [];
            }
        } else {
            this.currentSessionId = Date.now().toString();
        }
        this.renderSessionList();
    }

    newChat() {
        this.saveChatHistory();
        const now = new Date().toISOString();
        this.currentSessionId = Date.now().toString();
        this.chatMessages = [];
        this.apiMessages = [];
        this.taskDraft = null;
        this.diaryDraft = null;

        const sessions = JSON.parse(UserStorage.getItem('chatSessions') || '[]');
        sessions.push({
            id: this.currentSessionId,
            title: '新对话',
            createdAt: now,
            updatedAt: now,
            messages: [],
            apiMessages: []
        });
        UserStorage.setItem('chatSessions', JSON.stringify(sessions));

        this.renderSessionList();
        this.renderChatHistory();
        this.showWelcomeMessage();
    }

    saveChatHistory() {
        const sessions = JSON.parse(UserStorage.getItem('chatSessions') || '[]');
        let idx = sessions.findIndex(s => s.id === this.currentSessionId);

        const firstUser = this.chatMessages.find(m => m.sender === 'user');
        const title = firstUser
            ? firstUser.content.substring(0, 30) + (firstUser.content.length > 30 ? '...' : '')
            : '新对话';

        if (idx < 0) {
            sessions.push({
                id: this.currentSessionId,
                title,
                createdAt: new Date().toISOString(),
                messages: this.chatMessages,
                apiMessages: this.apiMessages
            });
        } else {
            sessions[idx].messages = this.chatMessages;
            sessions[idx].apiMessages = this.apiMessages;
            sessions[idx].updatedAt = new Date().toISOString();
            if (firstUser) {
                sessions[idx].title = title;
            }
        }

        UserStorage.setItem('chatSessions', JSON.stringify(sessions));
        this.renderSessionList();
    }

    /**
     * 转义 HTML 特殊字符
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * 会话列表排序：当前会话置顶，其余按更新时间倒序
     * @param {Array<Object>} sessions
     * @returns {Array<Object>}
     */
    sortSessions(sessions) {
        return [...sessions].sort((a, b) => {
            if (a.id === this.currentSessionId) return -1;
            if (b.id === this.currentSessionId) return 1;
            return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
        });
    }

    renderSessionList() {
        const sessionList = document.getElementById('session-list');
        const sessionCount = document.getElementById('session-count');
        if (!sessionList) return;

        const sessions = this.sortSessions(JSON.parse(UserStorage.getItem('chatSessions') || '[]'));

        if (sessionCount) {
            sessionCount.textContent = String(sessions.length);
        }

        if (sessions.length === 0) {
            sessionList.innerHTML = '<div class="session-empty">暂无历史会话</div>';
            return;
        }

        sessionList.innerHTML = sessions.map(session => {
            const isActive = session.id === this.currentSessionId;
            const date = new Date(session.updatedAt || session.createdAt).toLocaleDateString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const msgCount = (session.messages || []).length;
            const title = this.escapeHtml(session.title || '新对话');

            return `
                <div class="session-item${isActive ? ' session-item-active' : ''}"
                     data-session-id="${session.id}"
                     onclick="window.aiAssistant.loadSession('${session.id}')">
                    <div class="session-item-body">
                        <div class="session-item-title">${title}</div>
                        <div class="session-item-meta">${date} · ${msgCount} 条</div>
                    </div>
                    <button type="button" class="session-item-delete" title="删除会话"
                            onclick="window.aiAssistant.deleteSession('${session.id}', event)">
                        <i class="fa fa-trash-o"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    /**
     * 加载历史会话
     * @param {string} sessionId
     */
    loadSession(sessionId) {
        if (sessionId === this.currentSessionId) return;

        this.saveChatHistory();

        const sessions = JSON.parse(UserStorage.getItem('chatSessions') || '[]');
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        this.currentSessionId = sessionId;
        this.chatMessages = session.messages || [];
        this.apiMessages = session.apiMessages || [];
        this.taskDraft = null;
        this.renderSessionList();
        this.renderChatHistory();

        this.closeSessionPanel();
    }

    /**
     * 删除历史会话
     * @param {string} sessionId
     * @param {Event} event
     */
    deleteSession(sessionId, event) {
        event?.stopPropagation();
        if (!confirm('确定删除此会话？删除后无法恢复。')) return;

        let sessions = JSON.parse(UserStorage.getItem('chatSessions') || '[]');
        sessions = sessions.filter(s => s.id !== sessionId);
        UserStorage.setItem('chatSessions', JSON.stringify(sessions));

        if (sessionId === this.currentSessionId) {
            if (sessions.length > 0) {
                const latest = sessions.sort((a, b) =>
                    new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0];
                this.currentSessionId = latest.id;
                this.chatMessages = latest.messages || [];
                this.apiMessages = latest.apiMessages || [];
            } else {
                this.currentSessionId = Date.now().toString();
                this.chatMessages = [];
                this.apiMessages = [];
                sessions.push({
                    id: this.currentSessionId,
                    title: '新对话',
                    createdAt: new Date().toISOString(),
                    messages: [],
                    apiMessages: []
                });
                UserStorage.setItem('chatSessions', JSON.stringify(sessions));
                this.showWelcomeMessage();
            }
            this.renderChatHistory();
        }

        this.renderSessionList();
    }
}
