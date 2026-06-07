/**
 * AI 助手可调用的工具定义（智谱 Function Calling Schema）
 */

/** @type {Array<Object>} */
const AI_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'create_task',
            description: '创建新任务。课程/作业类任务必须先向用户确认截止时间和具体子任务，并自动关联课表中匹配的课程，禁止只传 title 就创建',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: '任务标题' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '优先级，默认 medium' },
                    deadline: { type: 'string', description: '截止日期（作业类必填），ISO 格式如 2026-06-10 或 2026-06-10T18:00:00' },
                    course_name: { type: 'string', description: '关联课程名称；若标题含课程名会自动匹配，也可手动传入' },
                    repeat: { type: 'string', enum: ['none', 'daily', 'weekly', 'monthly'], description: '重复周期，每日重复任务用 daily' },
                    daily_reminder_time: { type: 'string', description: '每日提醒时间 HH:mm，如 18:30。repeat=daily 时必填' },
                    subtasks: { type: 'array', items: { type: 'string' }, description: '子任务列表（可选；用户说无则留空）' },
                    force: { type: 'boolean', description: '仅当用户已明确提供全部信息时设为 true' }
                },
                required: ['title']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'update_task',
            description: '更新已有任务的信息',
            parameters: {
                type: 'object',
                properties: {
                    task_query: { type: 'string', description: '任务标题关键词，用于查找任务' },
                    title: { type: 'string', description: '新标题' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '新优先级' },
                    deadline: { type: 'string', description: '新截止日期 ISO 格式' },
                    completed: { type: 'boolean', description: '是否已完成' }
                },
                required: ['task_query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_task',
            description: '删除任务',
            parameters: {
                type: 'object',
                properties: {
                    task_query: { type: 'string', description: '任务标题关键词' }
                },
                required: ['task_query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'complete_task',
            description: '将任务标记为已完成',
            parameters: {
                type: 'object',
                properties: {
                    task_query: { type: 'string', description: '任务标题关键词' }
                },
                required: ['task_query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_tasks',
            description: '查询任务列表',
            parameters: {
                type: 'object',
                properties: {
                    filter: {
                        type: 'string',
                        enum: ['all', 'pending', 'completed', 'today', 'high_priority'],
                        description: '筛选条件：all全部/pending待办/completed已完成/today今日截止/high_priority高优先级'
                    }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'add_subtask',
            description: '为任务添加子任务',
            parameters: {
                type: 'object',
                properties: {
                    task_query: { type: 'string', description: '父任务标题关键词' },
                    subtask_title: { type: 'string', description: '子任务标题' }
                },
                required: ['task_query', 'subtask_title']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'complete_subtask',
            description: '完成任务的某个子任务',
            parameters: {
                type: 'object',
                properties: {
                    task_query: { type: 'string', description: '父任务标题关键词' },
                    subtask_query: { type: 'string', description: '子任务标题关键词' }
                },
                required: ['task_query', 'subtask_query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'add_task_diary',
            description: '为任务添加日记记录',
            parameters: {
                type: 'object',
                properties: {
                    task_query: { type: 'string', description: '任务标题关键词' },
                    content: { type: 'string', description: '日记内容' }
                },
                required: ['task_query', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'add_course',
            description: '添加课程到课表',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: '课程名称' },
                    day: { type: 'integer', description: '星期几：0周日 1周一 ... 6周六' },
                    start_period: { type: 'integer', description: '开始节次 1-12' },
                    end_period: { type: 'integer', description: '结束节次 1-12' },
                    location: { type: 'string', description: '上课地点' },
                    teacher: { type: 'string', description: '授课教师' }
                },
                required: ['name', 'day', 'start_period', 'end_period']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_course',
            description: '删除课程',
            parameters: {
                type: 'object',
                properties: {
                    course_query: { type: 'string', description: '课程名称关键词' }
                },
                required: ['course_query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_schedule',
            description: '查看课程表，可按星期筛选',
            parameters: {
                type: 'object',
                properties: {
                    day: { type: 'integer', description: '可选，星期几 0-6，不传则返回整周课表' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_today_schedule',
            description: '获取今天的综合安排。必须调用此工具来回答「今天有什么安排/任务/课」类问题。返回今日课程、所有待办任务(pendingTasks)、今日截止任务(tasksDueToday)、今日提醒',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_reminder',
            description: '设置提醒。一次性提醒用 minutes_from_now 或未来 time；每日重复用 repeat=daily + time_of_day=HH:mm',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: '提醒标题（仅事件内容，不含日期时间，如「开会」而非「明天中午开会」）' },
                    time: { type: 'string', description: '一次性提醒的 ISO 8601 时间（必须在未来）' },
                    minutes_from_now: { type: 'integer', description: '多少分钟后提醒，如 5 表示 5 分钟后' },
                    repeat: { type: 'string', enum: ['none', 'daily', 'weekly'], description: 'none=一次性，daily=每天，weekly=每周' },
                    time_of_day: { type: 'string', description: '重复提醒的时刻 HH:mm，如 18:30' },
                    repeat_weekday: { type: 'integer', description: '每周重复时的星期几，0=周日 … 6=周六' }
                },
                required: ['title']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_daily_reminder_task',
            description: '设置每天固定时间的提醒（仅到点提醒，不创建待办任务）。如「每晚21点提醒晚点名」。用户明确要「创建每日任务/习惯打卡」时才用 create_task(repeat=daily)',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: '任务/提醒标题，如「打开学习强国」' },
                    time_of_day: { type: 'string', description: '每日提醒时间 HH:mm，如 18:30' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '优先级' }
                },
                required: ['title', 'time_of_day']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_reminder',
            description: '删除提醒',
            parameters: {
                type: 'object',
                properties: {
                    reminder_query: { type: 'string', description: '提醒标题关键词' }
                },
                required: ['reminder_query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_reminders',
            description: '列出提醒，可按日期筛选',
            parameters: {
                type: 'object',
                properties: {
                    date: { type: 'string', description: '可选，日期 YYYY-MM-DD，默认列出所有未触发提醒' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'start_focus',
            description: '启动番茄钟专注模式。必须指定 task_query 才能直接启动；未指定且有多项待办时会弹出选择框，禁止自动选第一个任务',
            parameters: {
                type: 'object',
                properties: {
                    task_query: { type: 'string', description: '要专注的任务标题关键词，多项待办时必填' },
                    duration_minutes: { type: 'integer', description: '可选，专注时长分钟数，默认25' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_statistics',
            description: '获取任务和专注数据统计',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'switch_view',
            description: '切换到指定功能视图',
            parameters: {
                type: 'object',
                properties: {
                    view: {
                        type: 'string',
                        enum: ['ai-assistant', 'tasks', 'schedule', 'calendar', 'statistics'],
                        description: '目标视图'
                    }
                },
                required: ['view']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'open_create_task_form',
            description: '打开创建任务的表单弹窗，供用户手动填写详细信息',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'save_user_preference',
            description: '保存用户偏好，如 nickname、focusDurationMinutes、defaultPriority',
            parameters: {
                type: 'object',
                properties: {
                    key: { type: 'string', enum: ['nickname', 'focusDurationMinutes', 'defaultPriority', 'briefingEnabled'], description: '偏好键名' },
                    value: { type: 'string', description: '偏好值' }
                },
                required: ['key', 'value']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'remember_note',
            description: '记住用户明确要求记住的信息，如习惯、喜好',
            parameters: {
                type: 'object',
                properties: {
                    note: { type: 'string', description: '要记住的内容' }
                },
                required: ['note']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_user_memory',
            description: '获取用户偏好与长期记忆',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'suggest_daily_plan',
            description: '作为学习助手，结合课表、待办、截止日与用户习惯，生成今日智能排程与时间线建议。用户问「怎么安排今天」「帮我规划」时必须调用',
            parameters: {
                type: 'object',
                properties: {
                    format: { type: 'string', enum: ['structured', 'markdown'], description: '返回格式，默认 structured' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_secretary_nudges',
            description: '获取当前应主动跟进用户的助手提醒（截止预警、课后空档、继续上次专注等）',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'suggest_weekly_plan',
            description: '生成本周计划，结合课表、截止日与倒推建议',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_weekly_review',
            description: '获取本周复盘统计',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'update_reminder',
            description: '更新提醒标题或时间',
            parameters: {
                type: 'object',
                properties: {
                    reminder_id: { type: 'string', description: '提醒 ID' },
                    reminder_query: { type: 'string', description: '提醒标题关键词' },
                    title: { type: 'string', description: '新标题' },
                    repeat: { type: 'string', enum: ['none', 'daily', 'weekly'], description: '提醒周期：none=一次性，daily=每日，weekly=每周' },
                    repeat_weekday: { type: 'integer', description: '每周重复时的星期几，0=周日 … 6=周六' },
                    time_of_day: { type: 'string', description: '每日提醒新时间 HH:mm' },
                    time: { type: 'string', description: '一次性提醒新时间 ISO' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'trigger_schedule_import',
            description: '打开文件选择器导入课程表（支持 JSON / TXT / PDF）',
            parameters: { type: 'object', properties: {} }
        }
    }
];

/**
 * 构建 AI 系统提示词
 * @param {Object} context - 当前应用上下文
 * @returns {string}
 */
function buildSystemPrompt(context) {
    const now = new Date().toLocaleString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric',
        weekday: 'long', hour: '2-digit', minute: '2-digit'
    });

    const memorySummary = typeof UserMemory !== 'undefined'
        ? UserMemory.getPromptSummary()
        : '暂无';

    return `你是「智能TODO清单」的 AI **学习助手**，可以通过调用工具帮用户管理任务、课表、日历提醒和专注计时，并主动帮用户规划时间。

当前时间：${now}

## 用户偏好与记忆
${memorySummary}

## 你的能力
- 创建/编辑/删除/完成任务及子任务
- 管理课程表（添加/删除/查询课程）
- 设置和删除提醒
- 启动专注模式（番茄钟）
- 查看统计数据和今日安排
- **智能排程、自动重排（重排今日计划）与主动跟进**
- 创建任务时自动匹配子任务模板（六级/考研/论文等）
- 切换应用视图

## 助手工作原则
1. 语气像贴心助手：主动、简洁、有优先级意识，不说空话
2. 用户问「怎么安排」「今日计划」「帮我规划」→ 必须调用 suggest_daily_plan
3. 需要了解是否该主动提醒时 → 调用 get_secretary_nudges
4. 理解用户的自然语言意图，选择合适的工具执行操作
5. **查询今日安排、今天有什么任务/课时，必须先调用 get_today_schedule 工具，严禁不查数据就回答**
6. **pendingTasks = 全部未完成待办；tasksDueToday = 仅今天截止的任务。两者完全不同，禁止混用**
7. **若 pendingTaskCount > 0，绝不可说「待办为空」；若 tasksDueTodayCount = 0，应说「今日无截止任务」而非「没有待办」**
8. 需要操作数据时，优先调用工具，不要编造结果
9. 涉及删除等破坏性操作时，若用户意图明确则直接执行
10. 日期时间请转换为 ISO 8601 格式传给工具（如 2026-06-06T20:00:00）
11. 星期映射：周日=0，周一=1，周二=2，周三=3，周四=4，周五=5，周六=6
12. 回复使用中文，简洁友好，适当使用 emoji
13. 复杂任务可连续调用多个工具（如创建任务+添加子任务+设提醒）
14. 导入课程表文件需调用 trigger_schedule_import
15. **「X分钟后提醒我」必须用 set_reminder 且 minutes_from_now=X，不要编造已设置**
16. **「每天/每晚X点提醒」优先用 set_reminder(repeat=daily, time_of_day=HH:mm) 或 create_daily_reminder_task，仅写入提醒、不创建待办；只有用户明确要「每日任务/习惯打卡」时才用 create_task(repeat=daily)**
17. **「每周X点提醒」必须用 set_reminder(repeat=weekly, repeat_weekday=0-6, time_of_day=HH:mm)，标题仅写事件如「值班」，不要含「每周三」等时间词**
18. 设置提醒前若 time 已过期且非 daily/weekly，必须重新计算为未来时间
19. 用户说「记住XXX」、分享兴趣爱好（如「我喜欢听音乐」）时，必须调用 remember_note，禁止口头说「已记住」却不调用工具；设置昵称/默认偏好时用 save_user_preference
20. 回复时适当参考用户偏好（如昵称、默认优先级、常用提醒时间、进行中任务的专注记录、时段排程偏好）
21. 用户说错过计划或专注结束时可建议「重排今日计划」
22. 创建任务时若标题匹配复习/考试类主题且未提供 subtasks，create_task 会自动拆分模板子任务
23. **课程作业/报告/实验类任务：必须先问清截止时间；子任务可选（用户说「无」可留空），标题含课程名或简称时自动关联课表**
24. create_task 若返回 needMoreInfo，说明信息不足，继续追问用户后再创建
25. **用户说「写日记」时走日记流程，调用 add_task_diary 挂到已有任务，禁止当成 create_task；情绪吐槽如「作业太难了」不是创建任务**

## 当前数据快照
${JSON.stringify(context, null, 2)}`;
}
