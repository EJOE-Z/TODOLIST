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
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

    // 本地开发：IDE 预览(63342)、http.server(8080) 等只提供静态页，API 连 Flask 5000
    if (isLocalHost && port !== '5000') {
        return `${protocol}//${hostname}:5000`;
    }

    // 单端口部署（python app.py 或 Render）：前后端同地址
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
