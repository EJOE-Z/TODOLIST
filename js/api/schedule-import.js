/**
 * 课表导入 API 请求封装
 */

/**
 * @typedef {Object} ScheduleImportResult
 * @property {Array<Object>} courses - 解析后的课程列表
 * @property {string} parseMethod - 解析方式 rule | ai
 * @property {string} [filename] - 文件名
 */

/**
 * 上传课表文件到后端解析（PDF / 复杂 TXT）
 * @param {File} file - 课表文件
 * @returns {Promise<ScheduleImportResult>}
 */
async function parseScheduleFileApi(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${AppConfig.API_BASE_URL}/api/schedule/parse`, {
        method: 'POST',
        body: formData
    });

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.message || '课表解析失败');
    }
    return result.data;
}

const ScheduleImportApi = {
    parseScheduleFileApi
};
