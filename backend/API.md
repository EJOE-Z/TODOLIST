# 智能 TODO 清单 - 后端 API 接口文档

基础地址：`http://localhost:5000`

## 统一响应结构

所有接口均返回以下 JSON 结构：

| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 是否成功 |
| code | number | 业务状态码 |
| message | string | 提示信息 |
| data | object \| null | 响应数据 |

---

## 1. 健康检查

**接口名：** `GET /api/health`

**接口描述：** 检查后端服务及 AI 配置状态

**请求参数：** 无

**响应参数（data）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 服务状态 |
| ai_configured | boolean | 是否已配置智谱 API Key |
| model | string | 当前使用的模型名称 |

**响应示例：**

```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "status": "running",
    "ai_configured": true,
    "model": "glm-4-flash"
  }
}
```

---

## 2. AI 对话（Function Calling）

**接口名：** `POST /api/ai/chat`

**接口描述：** 代理调用智谱 AI，支持 Function Calling。前端传入对话消息和工具定义，后端返回助手回复（可能包含 tool_calls）。

**请求参数（Body JSON）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| messages | array | 是 | OpenAI 格式的消息列表 |
| tools | array | 否 | Function Calling 工具定义 |

**messages 元素结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| role | string | system / user / assistant / tool |
| content | string | 消息内容 |
| tool_calls | array | assistant 消息中的工具调用 |
| tool_call_id | string | tool 消息对应的调用 ID |

**请求示例：**

```json
{
  "messages": [
    { "role": "system", "content": "你是智能TODO助手..." },
    { "role": "user", "content": "帮我创建一个数学作业任务" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "create_task",
        "description": "创建新任务",
        "parameters": {
          "type": "object",
          "properties": {
            "title": { "type": "string", "description": "任务标题" }
          },
          "required": ["title"]
        }
      }
    }
  ]
}
```

**响应参数（data）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| message.role | string | assistant |
| message.content | string | 文本回复 |
| message.tool_calls | array \| null | 需要执行的工具调用列表 |
| message.finish_reason | string | stop / tool_calls |
| usage | object | Token 用量 |

**tool_calls 元素结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 工具调用 ID |
| type | string | function |
| function.name | string | 工具名称 |
| function.arguments | string | JSON 字符串格式的参数 |

**响应示例（含工具调用）：**

```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "message": {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "id": "call_xxx",
          "type": "function",
          "function": {
            "name": "create_task",
            "arguments": "{\"title\":\"数学作业\"}"
          }
        }
      ],
      "finish_reason": "tool_calls"
    },
    "usage": { "prompt_tokens": 500, "completion_tokens": 30, "total_tokens": 530 }
  }
}
```

**错误响应：**

| code | message |
|------|---------|
| 400 | messages 不能为空 |
| 500 | 未配置 ZHIPU_API_KEY |
| 502 | 智谱 API 请求失败 |

---

## 3. 教务系统课表爬取

**接口名：** `POST /api/spider/schedule`

**接口描述：** 尝试从教务系统登录并爬取课表

**请求参数（Body JSON）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 否 | 教务系统地址，默认 http://jwxt.cumt.edu.cn |
| username | string | 是 | 学号 |
| password | string | 是 | 密码 |

**响应参数（data）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| courses | array | 课程列表 |

**course 对象：**

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 课程名 |
| teacher | string | 教师 |
| location | string | 地点 |
| day | number | 星期 0-6 |
| startPeriod | number | 开始节次 |
| endPeriod | number | 结束节次 |
| color | string | 显示颜色 |

---

## 4. 课表文件解析

**接口名：** `POST /api/schedule/parse`

**接口描述：** 解析上传的课表文件。支持 JSON、TXT（CSV 或结构化文本行）、PDF。TXT/PDF 若无法按规则解析，且已配置 `ZHIPU_API_KEY`，则使用 AI 智能提取课程。

**请求参数（multipart/form-data）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | 是 | 课表文件，扩展名 `.json` / `.txt` / `.pdf` |

**TXT 支持的格式示例：**

1. **CSV（首行为表头）**
```
课程名,星期,开始节次,结束节次,地点,教师,周次类型
计算机网络,1,1,2,综合楼401,,all
```

2. **结构化文本行（每行一条）**
```
周一 1-2节 计算机网络 综合楼401
周二 3-4节 数据库系统 二教304
```

**响应参数（data）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| courses | array | 解析后的课程列表 |
| parseMethod | string | 解析方式：`rule`（规则）或 `ai`（AI） |
| filename | string | 原文件名 |
| count | number | 课程数量 |

**course 对象：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 课程 ID |
| name | string | 课程名 |
| day | number | 星期 0=周日 … 6=周六 |
| startPeriod | number | 开始节次 |
| endPeriod | number | 结束节次 |
| location | string | 地点 |
| teacher | string | 教师 |
| weekType | string | all / odd / even |
| color | string | 显示颜色 |

**错误码：**

| code | 说明 |
|------|------|
| 400 | 未上传文件、格式无法识别 |
| 502 | PDF 依赖缺失或 AI 调用失败 |

---

## 5. 账号认证（规划中 / 本地版已支持）

当前前端已实现**本地多账号隔离**：注册/登录后，任务、课表、提醒、记忆等按账号分别存储在浏览器 localStorage。

后续可扩展云端接口：

| 接口名 | 方法 | 说明 |
|--------|------|------|
| `/api/auth/register` | POST | 注册账号 |
| `/api/auth/login` | POST | 登录，返回 token |
| `/api/auth/logout` | POST | 登出 |
| `/api/auth/profile` | PUT | 修改用户名 / 密码 |
| `/api/user/data` | GET/PUT | 同步当前账号数据 |

**本地账号说明：**
- 密码仅在浏览器内 SHA-256 哈希存储，不上传服务器
- 设置 →「修改账号资料」可更改用户名、密码
- 从旧版迁移的「本地用户」若未设密码，可直接设置新密码
- 清除浏览器数据会导致账号与内容丢失，请定期导出备份
- 切换账号会刷新页面并加载对应账号数据

**本地资料修改（前端已实现）：**

| 操作 | 说明 |
|------|------|
| 修改用户名 | 不可与已有账号重名 |
| 修改密码 | 已设密码需验证当前密码；未设密码可直接设置；新密码至少 4 位且两次输入一致 |

---

## 环境配置

在 `backend/.env` 中配置：

```
ZHIPU_API_KEY=your_api_key
ZHIPU_API_URL=https://open.bigmodel.cn/api/paas/v4/chat/completions
ZHIPU_MODEL=glm-4-flash
```

## 启动方式

```bash
cd backend
pip install -r requirements.txt
python app.py
```

服务默认监听 `http://0.0.0.0:5000`，**同时提供前端页面与 API**。

### 供他人访问

| 场景 | 做法 |
|------|------|
| 同一 WiFi / 局域网 | 他人浏览器打开 `http://<你的局域网IP>:5000` |
| 查本机 IP | Windows：`ipconfig`；Mac/Linux：`ifconfig` 或 `ip addr` |
| 防火墙 | 放行入站 TCP 5000 端口 |
| 公网 | 云服务器部署 + 域名 + Nginx 反向代理 + HTTPS |
| 临时外网 | 内网穿透（如 Cloudflare Tunnel、ngrok）映射 5000 端口 |

**数据说明：** 任务、课表、账号等存在**访问者各自浏览器**的 localStorage，多人共用同一链接时数据互不干扰；AI 对话由服务器上的 `ZHIPU_API_KEY` 代理，请注意 API 用量与费用。

---

## 6. 公网部署 + 手机安装 App

### 为什么需要 HTTPS

- 不在同一 WiFi 的人要通过**公网网址**访问
- 手机「安装到主屏幕」要求 **HTTPS**（`localhost` 除外）
- 本项目是 **PWA**（渐进式 Web 应用），无需上架 App Store，安装后体验接近原生 App

### 方案 A：Render 云部署（推荐，有免费档）

1. 将项目推到 **GitHub** 仓库
2. 注册 [Render](https://render.com) → New → Web Service → 连接仓库
3. Render 会自动识别根目录 `Dockerfile` 和 `render.yaml`
4. 在环境变量中设置 `ZHIPU_API_KEY`
5. 部署完成后获得地址，例如：`https://todo-assistant-xxxx.onrender.com`
6. 把该链接发给任何人，手机浏览器打开即可使用

**注意：** 免费实例一段时间无访问会休眠，首次打开需等待约 30 秒唤醒。

### 方案 B：Cloudflare Tunnel（本机免费公网，适合自用/小范围）

1. 安装 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. 本机启动服务：`cd backend && python app.py`
3. 另开终端：`cloudflared tunnel --url http://localhost:5000`
4. 复制生成的 `https://xxx.trycloudflare.com` 链接分享
5. 电脑关机后链接失效；适合临时分享

### 方案 C：国内云服务器（长期稳定）

1. 购买阿里云 / 腾讯云轻量服务器
2. 安装 Docker，上传项目后执行：

```bash
docker build -t todo-assistant .
docker run -d -p 80:5000 -e ZHIPU_API_KEY=你的密钥 todo-assistant
```

3. 绑定域名并配置 HTTPS（Let's Encrypt 或云厂商免费证书）

### 手机如何「下载」安装

部署到 **HTTPS** 后：

| 平台 | 安装方式 |
|------|----------|
| **Android** | Chrome 打开链接 → 设置 →「安装到手机 / 桌面」，或浏览器菜单「安装应用」 |
| **iPhone** | 必须用 **Safari** 打开 → 底部分享 →「添加到主屏幕」 |
| **已安装** | 主屏幕会出现「TODO助手」图标，全屏打开，像 App 一样 |

应用内：**设置 → 安装 App** 可查看状态与安装说明。

### 与原生 App 的区别

| 项目 | 说明 |
|------|------|
| 分发 | 分享链接即可，不上架应用商店 |
| 数据 | 仍在各自手机浏览器本地，不自动云端同步 |
| 更新 | 你更新服务器代码后，用户刷新/重开即更新 |
| 若要 App Store | 需额外用 Capacitor/Tauri 打包，或开发独立原生项目 |

---

## 7. 推送到 GitHub

### 前置准备

1. 注册 [GitHub](https://github.com) 账号
2. 安装 [Git for Windows](https://git-scm.com/download/win)（安装后重启终端）
3. 确认 **不要** 把 `backend/.env`（含 `ZHIPU_API_KEY`）提交上去；项目根目录已有 `.gitignore` 会忽略它

### 第一步：在 GitHub 创建空仓库

1. 登录 GitHub → 右上角 **+** → **New repository**
2. Repository name 例如：`todo-assistant`
3. 选 **Public** 或 **Private**
4. **不要** 勾选 "Add a README"（保持空仓库）
5. 点 **Create repository**
6. 记下仓库地址，形如：`https://github.com/你的用户名/todo-assistant.git`

### 第二步：本地初始化并首次推送

在项目根目录 `TODO LIST` 打开 **PowerShell** 或 **Git Bash**，依次执行：

```powershell
# 进入项目目录
cd "e:\big three down\TODO LIST"

# 初始化 Git 仓库
git init

# 查看将要提交的文件（确认没有 .env、.venv）
git status

# 添加所有文件
git add .

# 首次提交
git commit -m "初始提交：智能 TODO 清单"

# 主分支命名为 main（与 GitHub 默认一致）
git branch -M main

# 关联远程仓库（把下面地址换成你的）
git remote add origin https://github.com/你的用户名/todo-assistant.git

# 推送到 GitHub
git push -u origin main
```

首次 `git push` 会弹出 GitHub 登录窗口；按提示用浏览器授权即可。

### 第三步：后续修改后再推送

每次改完代码：

```powershell
cd "e:\big three down\TODO LIST"
git add .
git commit -m "描述你改了什么"
git push
```

### 常见问题

| 问题 | 处理 |
|------|------|
| `git: 无法识别` | 未安装 Git 或未重启终端，重装 Git for Windows |
| 推送时要输入用户名密码失败 | GitHub 已不支持密码推送，需用浏览器 OAuth 或 [Personal Access Token](https://github.com/settings/tokens) |
| 不小心把 `.env` 加进去了 | 执行 `git rm --cached backend/.env`，确认 `.gitignore` 含 `.env` 后再 commit |
| 仓库已有 README 导致 push 被拒 | 先 `git pull origin main --rebase` 再 `git push` |
| 中文路径报错 | 用 Git Bash 或在 PowerShell 里用引号包住完整路径 |

### 推送完成后：连接 Render 部署

1. 打开 [Render Dashboard](https://dashboard.render.com)
2. **New** → **Web Service** → 选择刚推送的 GitHub 仓库
3. 环境变量添加 `ZHIPU_API_KEY`
4. 部署完成后把 `https://xxx.onrender.com` 链接分享给他人

---
