"""
课表文件解析：JSON / CSV / 文本行 / PDF 文本 + AI 兜底
"""
import io
import json
import re
from typing import Any, Dict, List, Optional, Tuple

DAY_MAP = {
    '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 0,
    '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6, '星期日': 0, '星期天': 0,
    'mon': 1, 'monday': 1, 'tue': 2, 'tuesday': 2, 'wed': 3, 'wednesday': 3,
    'thu': 4, 'thursday': 4, 'fri': 5, 'friday': 5, 'sat': 6, 'saturday': 6, 'sun': 0, 'sunday': 0,
}

COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]


def extract_pdf_text(file_bytes: bytes) -> str:
    """
    从 PDF 二进制内容提取纯文本
    """
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError('服务端未安装 pypdf，请执行 pip install pypdf') from exc

    reader = PdfReader(io.BytesIO(file_bytes))
    parts: List[str] = []
    for page in reader.pages:
        parts.append(page.extract_text() or '')
    return '\n'.join(parts).strip()


def parse_day_value(raw: Any) -> Optional[int]:
    """
    解析星期字段为 0-6
    """
    if raw is None or raw == '':
        return None
    if isinstance(raw, int):
        return raw if 0 <= raw <= 6 else None
    text = str(raw).strip().lower()
    if text.isdigit():
        val = int(text)
        return val if 0 <= val <= 6 else None
    for key, val in DAY_MAP.items():
        if key.lower() in text:
            return val
    return None


def parse_period_range(raw: Any) -> Tuple[Optional[int], Optional[int]]:
    """
    解析节次，支持 1-2、1~2节、第3节 等
    """
    if raw is None or raw == '':
        return None, None
    if isinstance(raw, int):
        return raw, raw
    text = str(raw).strip()
    range_match = re.search(r'(\d+)\s*[-~～至]\s*(\d+)', text)
    if range_match:
        start = int(range_match.group(1))
        end = int(range_match.group(2))
        return start, end
    single_match = re.search(r'(\d+)', text)
    if single_match:
        val = int(single_match.group(1))
        return val, val
    return None, None


def normalize_course(raw: Dict[str, Any], index: int) -> Optional[Dict[str, Any]]:
    """
    规范化单条课程记录
    """
    name = str(raw.get('name') or raw.get('course') or raw.get('courseName') or '').strip()
    if not name:
        return None

    day = parse_day_value(raw.get('day'))
    start_period, end_period = parse_period_range(raw.get('startPeriod'))
    end_from_field, _ = parse_period_range(raw.get('endPeriod'))
    if end_from_field is not None:
        end_period = end_from_field

    if day is None or start_period is None or end_period is None:
        return None

    week_type = str(raw.get('weekType') or 'all').lower()
    if week_type not in ('all', 'odd', 'even'):
        week_type = 'all'

    return {
        'id': str(raw.get('id') or f'import-{index + 1}'),
        'name': name,
        'day': day,
        'startPeriod': start_period,
        'endPeriod': end_period,
        'location': str(raw.get('location') or raw.get('place') or '').strip(),
        'teacher': str(raw.get('teacher') or '').strip(),
        'weekType': week_type,
        'color': raw.get('color') or COLORS[index % len(COLORS)]
    }


def normalize_courses(items: List[Any]) -> List[Dict[str, Any]]:
    """
    批量规范化课程列表
    """
    courses: List[Dict[str, Any]] = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        course = normalize_course(item, index)
        if course:
            courses.append(course)
    return courses


def parse_json_text(text: str) -> List[Dict[str, Any]]:
    """
    解析 JSON 格式课表
    """
    data = json.loads(text)
    if isinstance(data, list):
        return normalize_courses(data)
    if isinstance(data, dict) and isinstance(data.get('courses'), list):
        return normalize_courses(data['courses'])
    return []


def parse_csv_text(text: str) -> List[Dict[str, Any]]:
    """
    解析 CSV/TSV 课表：课程名,星期,开始节次,结束节次,地点,教师,周次类型
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if len(lines) < 2:
        return []

    delimiter = '\t' if '\t' in lines[0] else ','
    header = [h.strip().lower() for h in lines[0].split(delimiter)]
    header_aliases = {
        'name': {'课程名', '课程名称', 'name', 'course', 'coursename'},
        'day': {'星期', '周几', 'day', 'weekday'},
        'startPeriod': {'开始节次', '起始节次', 'startperiod', 'start', '开始'},
        'endPeriod': {'结束节次', '终止节次', 'endperiod', 'end', '结束'},
        'location': {'地点', '教室', 'location', 'place'},
        'teacher': {'教师', '老师', 'teacher'},
        'weekType': {'周次', '周次类型', 'weektype'},
    }

    def find_col(keys: set) -> int:
        for idx, col in enumerate(header):
            if col in keys:
                return idx
        return -1

    col_map = {key: find_col(keys) for key, keys in header_aliases.items()}
    if col_map['name'] == -1 or col_map['day'] == -1:
        return []

    items: List[Dict[str, Any]] = []
    for line in lines[1:]:
        parts = [p.strip() for p in line.split(delimiter)]
        if len(parts) < 2:
            continue
        item: Dict[str, Any] = {'name': parts[col_map['name']], 'day': parts[col_map['day']]}
        if col_map['startPeriod'] != -1 and col_map['startPeriod'] < len(parts):
            item['startPeriod'] = parts[col_map['startPeriod']]
        if col_map['endPeriod'] != -1 and col_map['endPeriod'] < len(parts):
            item['endPeriod'] = parts[col_map['endPeriod']]
        if col_map['location'] != -1 and col_map['location'] < len(parts):
            item['location'] = parts[col_map['location']]
        if col_map['teacher'] != -1 and col_map['teacher'] < len(parts):
            item['teacher'] = parts[col_map['teacher']]
        if col_map['weekType'] != -1 and col_map['weekType'] < len(parts):
            item['weekType'] = parts[col_map['weekType']]
        items.append(item)

    return normalize_courses(items)


def parse_line_text(text: str) -> List[Dict[str, Any]]:
    """
    解析自然语言行，如：周一 1-2节 计算机网络 综合楼401
    """
    items: List[Dict[str, Any]] = []
    day_pattern = re.compile(
        r'(周[一二三四五六日天]|星期[一二三四五六日天]|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*'
        r'(?:[,，|]\s*)?'
        r'(?:第?\s*)?(\d+)\s*[-~～至]\s*(\d+)\s*节?'
        r'(?:[,，|]\s*)?'
        r'(.+?)(?:[,，|]\s*(.+))?$',
        re.IGNORECASE
    )

    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        match = day_pattern.search(line)
        if not match:
            continue
        day = parse_day_value(match.group(1))
        if day is None:
            continue
        items.append({
            'day': day,
            'startPeriod': int(match.group(2)),
            'endPeriod': int(match.group(3)),
            'name': match.group(4).strip(),
            'location': (match.group(5) or '').strip()
        })

    return normalize_courses(items)


def parse_schedule_text(text: str) -> List[Dict[str, Any]]:
    """
    按优先级尝试多种文本解析方式
    """
    stripped = text.strip()
    if not stripped:
        return []

    if stripped.startswith('[') or stripped.startswith('{'):
        try:
            courses = parse_json_text(stripped)
            if courses:
                return courses
        except json.JSONDecodeError:
            pass

    courses = parse_csv_text(stripped)
    if courses:
        return courses

    courses = parse_line_text(stripped)
    if courses:
        return courses

    return []


def extract_json_array(content: str) -> List[Any]:
    """
    从 AI 回复中提取 JSON 数组
    """
    content = content.strip()
    fence_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
    if fence_match:
        content = fence_match.group(1).strip()

    try:
        data = json.loads(content)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get('courses'), list):
            return data['courses']
    except json.JSONDecodeError:
        pass

    array_match = re.search(r'\[[\s\S]*\]', content)
    if array_match:
        try:
            data = json.loads(array_match.group(0))
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass

    return []


def parse_schedule_with_ai(text: str, call_zhipu_chat) -> List[Dict[str, Any]]:
    """
    使用智谱 AI 解析非结构化课表文本
    """
    system_prompt = (
        '你是课表解析助手。从用户提供的课表文本中提取全部课程，'
        '严格只输出 JSON 数组，不要 markdown 说明。'
        '每项字段：name(string), day(integer 0=周日1=周一…6=周六), '
        'startPeriod(integer), endPeriod(integer), location(string 可选), '
        'teacher(string 可选), weekType(string 可选 all|odd|even)。'
    )
    messages = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': text[:12000]}
    ]
    result = call_zhipu_chat(messages, tools=None, temperature=0.1, max_tokens=4096)
    choice = result.get('choices', [{}])[0]
    content = choice.get('message', {}).get('content') or ''
    items = extract_json_array(content)
    return normalize_courses(items)


def parse_schedule_file(
    filename: str,
    file_bytes: bytes,
    call_zhipu_chat,
    ai_enabled: bool
) -> Tuple[List[Dict[str, Any]], str]:
    """
    解析上传的课表文件，返回 (courses, parse_method)
    """
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    text = ''

    if ext == 'pdf':
        text = extract_pdf_text(file_bytes)
        if not text:
            raise ValueError('PDF 中未提取到文本，可能是扫描版图片，请改用 TXT 或 JSON')
    else:
        for encoding in ('utf-8', 'utf-8-sig', 'gbk', 'gb2312'):
            try:
                text = file_bytes.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        if not text:
            raise ValueError('无法读取文件文本，请检查编码是否为 UTF-8 或 GBK')

    courses = parse_schedule_text(text)
    if courses:
        return courses, 'rule'

    if ai_enabled and call_zhipu_chat:
        courses = parse_schedule_with_ai(text, call_zhipu_chat)
        if courses:
            return courses, 'ai'

    raise ValueError(
        '未能识别课表格式。支持：JSON、CSV（见接口文档）、'
        '或「周一 1-2节 课程名 地点」每行一条；PDF/复杂文本需配置 ZHIPU_API_KEY 后由 AI 解析'
    )
