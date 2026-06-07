import os
import json
from typing import Any, Dict, Optional, Tuple

from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import re

from schedule_parser import parse_schedule_file

load_dotenv()

app = Flask(__name__)
CORS(app)

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

ZHIPU_API_KEY = os.environ.get('ZHIPU_API_KEY', '')
ZHIPU_API_URL = os.environ.get(
    'ZHIPU_API_URL',
    'https://open.bigmodel.cn/api/paas/v4/chat/completions'
)
ZHIPU_MODEL = os.environ.get('ZHIPU_MODEL', 'glm-4-flash')


def make_response(
    success: bool,
    data: Optional[Any] = None,
    message: str = 'ok',
    code: int = 200
) -> Tuple[Any, int]:
    """
    构建统一的 API 响应体
    """
    http_code = code if not success else 200
    return jsonify({
        'success': success,
        'code': code,
        'message': message,
        'data': data
    }), http_code


def call_zhipu_chat(
    messages: list,
    tools: Optional[list] = None,
    temperature: float = 0.7,
    max_tokens: int = 2048
) -> Dict[str, Any]:
    """
    调用智谱 AI Chat Completions 接口
    """
    payload: Dict[str, Any] = {
        'model': ZHIPU_MODEL,
        'messages': messages,
        'temperature': temperature,
        'max_tokens': max_tokens
    }
    if tools:
        payload['tools'] = tools
        payload['tool_choice'] = 'auto'

    response = requests.post(
        ZHIPU_API_URL,
        headers={
            'Authorization': f'Bearer {ZHIPU_API_KEY}',
            'Content-Type': 'application/json'
        },
        json=payload,
        timeout=60
    )

    if response.status_code != 200:
        error_text = response.text[:500]
        raise RuntimeError(f'智谱 API 请求失败 ({response.status_code}): {error_text}')

    return response.json()


def parse_assistant_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    从智谱响应中解析助手消息
    """
    choice = result.get('choices', [{}])[0]
    message = choice.get('message', {})
    tool_calls = message.get('tool_calls')

    parsed_tool_calls = None
    if tool_calls:
        parsed_tool_calls = []
        for tc in tool_calls:
            func = tc.get('function', {})
            parsed_tool_calls.append({
                'id': tc.get('id', ''),
                'type': tc.get('type', 'function'),
                'function': {
                    'name': func.get('name', ''),
                    'arguments': func.get('arguments', '{}')
                }
            })

    return {
        'role': message.get('role', 'assistant'),
        'content': message.get('content') or '',
        'tool_calls': parsed_tool_calls,
        'finish_reason': choice.get('finish_reason', 'stop')
    }


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return make_response(True, {
        'status': 'running',
        'ai_configured': bool(ZHIPU_API_KEY),
        'model': ZHIPU_MODEL
    })


@app.route('/api/ai/chat', methods=['POST'])
def ai_chat():
    """
    AI 对话接口（支持 Function Calling）
    前端传入 messages 和 tools，后端代理调用智谱 API
    """
    if not ZHIPU_API_KEY:
        return make_response(
            False,
            None,
            '未配置 ZHIPU_API_KEY，请在 backend/.env 中设置',
            500
        )

    try:
        body = request.get_json(silent=True) or {}
        messages = body.get('messages', [])
        tools = body.get('tools')

        if not messages:
            return make_response(False, None, 'messages 不能为空', 400)

        result = call_zhipu_chat(messages, tools)
        assistant_message = parse_assistant_message(result)

        return make_response(True, {
            'message': assistant_message,
            'usage': result.get('usage')
        })

    except RuntimeError as e:
        return make_response(False, None, str(e), 502)
    except Exception as e:
        return make_response(False, None, f'服务器错误: {str(e)}', 500)


@app.route('/api/schedule/parse', methods=['POST'])
def parse_schedule_upload():
    """
    解析上传的课表文件（JSON / TXT / PDF）
    """
    try:
        upload = request.files.get('file')
        if not upload or not upload.filename:
            return make_response(False, None, '请上传课表文件', 400)

        file_bytes = upload.read()
        if not file_bytes:
            return make_response(False, None, '文件内容为空', 400)

        ai_enabled = bool(ZHIPU_API_KEY)
        courses, parse_method = parse_schedule_file(
            upload.filename,
            file_bytes,
            call_zhipu_chat,
            ai_enabled
        )

        return make_response(True, {
            'courses': courses,
            'parseMethod': parse_method,
            'filename': upload.filename,
            'count': len(courses)
        }, f'成功解析 {len(courses)} 门课程')

    except ValueError as e:
        return make_response(False, None, str(e), 400)
    except RuntimeError as e:
        return make_response(False, None, str(e), 502)
    except Exception as e:
        return make_response(False, None, f'服务器错误: {str(e)}', 500)


# 模拟登录教务系统并获取课表
@app.route('/api/spider/schedule', methods=['POST'])
def get_schedule():
    try:
        data = request.json
        url = data.get('url', 'http://jwxt.cumt.edu.cn')
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return make_response(False, None, '请输入学号和密码', 400)

        courses = fetch_schedule_from_jwxt(url, username, password)

        if courses:
            return make_response(True, {'courses': courses})
        return make_response(False, None, '未能获取课程信息，请检查学号密码或教务系统地址', 400)

    except Exception as e:
        return make_response(False, None, f'服务器错误: {str(e)}', 500)


def fetch_schedule_from_jwxt(base_url, username, password):
    """从教务系统获取课表数据"""
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })

    try:
        if base_url.endswith('/'):
            base_url = base_url[:-1]

        login_methods = [
            {'url': f"{base_url}/loginAction.do", 'data': {'zjh': username, 'mm': password, 'dl': '登录'}},
            {'url': f"{base_url}/j_spring_security_check", 'data': {'j_username': username, 'j_password': password}},
            {'url': f"{base_url}/login", 'data': {'username': username, 'password': password}},
            {'url': f"{base_url}/dologin.action", 'data': {'userAccount': username, 'userPassword': password}},
            {'url': f"{base_url}/servlet/LoginServlet", 'data': {'username': username, 'password': password}},
        ]

        logged_in = False
        for method in login_methods:
            try:
                response = session.post(method['url'], data=method['data'], verify=False, allow_redirects=True, timeout=10)
                if username in response.text or '课表' in response.text or '课程' in response.text:
                    logged_in = True
                    break
            except Exception:
                continue

        if not logged_in:
            print("登录失败，尝试直接访问课表页面")

        schedule_urls = [
            f"{base_url}/xkAction.do?actionType=6",
            f"{base_url}/kbxxAction.do",
            f"{base_url}/student/kbxx.jsp",
            f"{base_url}/schedule",
            f"{base_url}/student/schedule",
            f"{base_url}/api/schedule",
        ]

        for schedule_url in schedule_urls:
            try:
                response = session.get(schedule_url, verify=False, timeout=10)
                response.encoding = 'utf-8'

                if '课程' in response.text or '节次' in response.text or '周' in response.text:
                    courses = parse_schedule_html(response.text)
                    if courses:
                        return courses
            except Exception:
                continue

        return None

    except Exception as e:
        print(f"爬取失败: {e}")
        return None


def parse_schedule_html(html):
    """解析课表HTML页面"""
    soup = BeautifulSoup(html, 'html.parser')
    courses = []

    tables = soup.find_all('table')

    for table in tables:
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 8:
                course_info = extract_course_info(cells)
                if course_info:
                    courses.append(course_info)

    if not courses:
        courses = parse_schedule_alternative(html)

    return courses


def extract_course_info(cells):
    """从表格单元格中提取课程信息"""
    try:
        course_text = cells[1].get_text(strip=True) if len(cells) > 1 else ''

        if not course_text or course_text in ['课程名', '课程名称', '序号']:
            return None

        name = course_text
        teacher = cells[4].get_text(strip=True) if len(cells) > 4 else ''
        time_info = cells[6].get_text(strip=True) if len(cells) > 6 else ''
        location = cells[7].get_text(strip=True) if len(cells) > 7 else ''

        day, periods = parse_time_info(time_info)

        if day is None:
            return None

        course = {
            'name': name,
            'teacher': teacher,
            'location': location,
            'day': day,
            'startPeriod': periods[0],
            'endPeriod': periods[-1],
            'color': get_random_color()
        }

        return course
    except Exception as e:
        print(f"解析课程信息失败: {e}")
        return None


def parse_time_info(time_str):
    """解析时间字符串，返回星期几和节次"""
    day_match = re.search(r'(周一|周二|周三|周四|周五|周六|周日)', time_str)
    if not day_match:
        return None, []

    day_map = {'周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 0}
    day = day_map.get(day_match.group(1))

    period_matches = re.findall(r'(\d+)-(\d+)节|第(\d+)节', time_str)
    periods = []

    for match in period_matches:
        if match[0] and match[1]:
            start = int(match[0])
            end = int(match[1])
            periods.extend(range(start, end + 1))
        elif match[2]:
            periods.append(int(match[2]))

    if not periods:
        nums = re.findall(r'\d+', time_str)
        periods = [int(n) for n in nums if 1 <= int(n) <= 12]

    if not periods:
        return None, []

    return day, sorted(list(set(periods)))


def parse_schedule_alternative(html):
    """备用解析方法"""
    courses = []
    script_pattern = re.compile(r'kbxx\s*=\s*\[(.+?)\]', re.DOTALL)
    match = script_pattern.search(html)

    if match:
        try:
            json_str = '[' + match.group(1) + ']'
            json_str = re.sub(r'(\w+):', r'"\1":', json_str)
            json_str = json_str.replace("'", '"')
            kb_data = json.loads(json_str)

            for item in kb_data:
                if isinstance(item, dict) and 'kcmc' in item:
                    course = {
                        'name': item.get('kcmc', ''),
                        'teacher': item.get('jsxm', ''),
                        'location': item.get('cdmc', '') + item.get('jxlmc', ''),
                        'day': parse_day(item.get('xqj', '')),
                        'startPeriod': int(item.get('jcs', '1')),
                        'endPeriod': int(item.get('jce', '1')),
                        'color': get_random_color()
                    }
                    courses.append(course)
        except Exception as e:
            print(f"备用解析失败: {e}")

    return courses


def parse_day(day_str):
    """解析星期字符串"""
    day_map = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0}
    if day_str.isdigit():
        return int(day_str)
    for key, value in day_map.items():
        if key in day_str:
            return value
    return 1


def get_random_color():
    """生成随机颜色"""
    colors = [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
        '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ]
    import random
    return random.choice(colors)


@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def serve_frontend(path: str):
    """
    托管前端静态资源（与 API 同端口，便于他人访问）
    """
    if path.startswith('api/'):
        abort(404)

    target = os.path.join(FRONTEND_DIR, path)
    if os.path.isdir(target):
        path = f'{path.rstrip("/")}/index.html'

    file_path = os.path.join(FRONTEND_DIR, path)
    if not os.path.isfile(file_path):
        abort(404)

    return send_from_directory(FRONTEND_DIR, path)


if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    port = int(os.environ.get('PORT', '5000'))
    app.run(debug=debug_mode, host='0.0.0.0', port=port)
