/**
 * AI 相关 API 请求封装
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} role - system | user | assistant | tool
 * @property {string} [content]
 * @property {Array} [tool_calls]
 * @property {string} [tool_call_id]
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {number} code
 * @property {string} message
 * @property {*} data
 */

/**
 * @typedef {Object} AssistantMessage
 * @property {string} role
 * @property {string} content
 * @property {Array|null} tool_calls
 * @property {string} finish_reason
 */

/**
 * 发送通用 POST 请求
 * @param {string} path - API 路径
 * @param {Object} body - 请求体
 * @returns {Promise<ApiResponse>}
 */
async function apiPost(path, body) {
    const response = await fetch(`${AppConfig.API_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.message || '请求失败');
    }
    return result;
}

/**
 * 健康检查
 * @returns {Promise<ApiResponse>}
 */
async function checkHealth() {
    const response = await fetch(`${AppConfig.API_BASE_URL}/api/health`);
    return response.json();
}

/**
 * 调用 AI 对话接口（支持 Function Calling）
 * @param {ChatMessage[]} messages - 对话消息列表
 * @param {Array|null} tools - 工具定义列表
 * @returns {Promise<{message: AssistantMessage, usage: Object|null}>}
 */
async function chatWithAI(messages, tools) {
    /** @type {{messages: ChatMessage[], tools?: Array}} */
    const payload = { messages };
    if (tools && tools.length > 0) {
        payload.tools = tools;
    }

    const result = await apiPost('/api/ai/chat', payload);
    return result.data;
}

const AIApi = {
    checkHealth,
    chatWithAI
};
