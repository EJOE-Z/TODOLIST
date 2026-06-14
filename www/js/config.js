/**
 * 根据当前访问地址推断后端 API 根路径
 * @returns {string}
 */
function resolveApiBaseUrl() {
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
        const nativeBase = window.__NATIVE_API_BASE__ || '';
        if (nativeBase) {
            return nativeBase.replace(/\/$/, '');
        }
    }

    if (window.location.protocol === 'file:') {
        return 'http://localhost:5000';
    }

    const { protocol, hostname, port } = window.location;

    // 开发模式：前端 8080 + 后端 5000 分开启动
    if (port === '8080') {
        return `${protocol}//${hostname}:5000`;
    }

    // 单端口部署：前后端同一地址
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
}

/**
 * 应用全局配置
 */
const AppConfig = {
    /** @type {string} 后端 API 基础地址 */
    API_BASE_URL: resolveApiBaseUrl(),

    /** @type {number} AI Agent 最大工具调用轮次 */
    AI_MAX_ITERATIONS: 10
};
