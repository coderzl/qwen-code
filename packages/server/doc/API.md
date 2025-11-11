# Qwen Code HTTP Server API 文档

> **重要变更**: 所有接口统一使用 POST 方法，所有参数使用 JSON 格式传递

## 基本信息

- **基础 URL**: `http://localhost:3000`
- **内容类型**: `application/json`
- **认证**: 单用户模式，无需认证

## 健康检查

### GET /health

服务健康检查。

**响应**:

```json
{
  "status": "ok",
  "timestamp": "2025-01-10T10:00:00.000Z",
  "uptime": 12345
}
```

### GET /ready

服务就绪检查。

**响应**:

```json
{
  "status": "ready",
  "timestamp": "2025-01-10T10:00:00.000Z",
  "sessions": 5
}
```

## 会话管理

### POST /api/session

创建新会话。

**请求体**:

```json
{
  "workspaceRoot": "/path/to/workspace",
  "model": "qwen3-coder-plus-2025-09-23",
  "metadata": {
    "description": "Optional metadata"
  }
}
```

**响应**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2025-01-10T10:00:00.000Z"
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceRoot": "/tmp/test",
    "model": "qwen3-coder-plus-2025-09-23"
  }'
```

### POST /api/session/get

获取会话信息。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**响应**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "local-user",
  "createdAt": "2025-01-10T10:00:00.000Z",
  "lastActivity": "2025-01-10T10:05:00.000Z",
  "duration": 300000,
  "messageCount": 10,
  "metadata": {}
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/session/get \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "550e8400-e29b-41d4-a716-446655440000"}'
```

### POST /api/session/delete

删除会话。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**响应**:

```json
{
  "success": true
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/session/delete \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "550e8400-e29b-41d4-a716-446655440000"}'
```

### POST /api/session/update-workspace

更新已创建会话的workspaceRoot。

**注意**: 此操作会重新创建Config和GeminiClient，但会保留会话的历史记录。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "workspaceRoot": "/path/to/new/workspace"
}
```

**响应**:

```json
{
  "success": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "workspaceRoot": "/path/to/new/workspace"
}
```

**错误响应** (404):

```json
{
  "error": "Session not found or update failed"
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/session/update-workspace \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "workspaceRoot": "/tmp/new-workspace"
  }'
```

### POST /api/session/add-directory

添加额外目录到工作空间（不改变主目录）。

**注意**: 此操作与CLI的 `/directory add` 命令功能一致。添加的目录会作为额外的工作空间目录，主工作目录保持不变。添加成功后会自动更新模型的上下文。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "directories": ["/path/to/dir1", "/path/to/dir2", "~/relative/path"]
}
```

**响应**:

```json
{
  "success": true,
  "added": ["/path/to/dir1", "/path/to/dir2", "~/relative/path"],
  "errors": []
}
```

**部分成功响应**:

```json
{
  "success": true,
  "added": ["/path/to/dir1"],
  "errors": ["Error adding '/path/to/dir2': Directory not found"]
}
```

**错误响应** (404):

```json
{
  "success": false,
  "added": [],
  "errors": ["Session not found"]
}
```

**路径格式支持**:

- 绝对路径: `/path/to/directory`
- 相对路径: `./relative/path` 或 `../parent/path`
- 用户主目录: `~/path/to/directory` 或 `~`
- Windows用户配置: `%userprofile%/path/to/directory`

**示例**:

```bash
# 添加单个目录
curl -X POST http://localhost:3000/api/session/add-directory \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "directories": ["/tmp/extra-workspace"]
  }'

# 添加多个目录
curl -X POST http://localhost:3000/api/session/add-directory \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "directories": ["/tmp/dir1", "~/projects/dir2", "./local-dir"]
  }'
```

### POST /api/session/list-directories

获取工作空间的所有目录列表。

**注意**: 此操作与CLI的 `/directory show` 命令功能一致。返回的列表包括主工作目录和所有额外添加的目录。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**响应**:

```json
{
  "directories": [
    "/path/to/main/workspace",
    "/path/to/extra/dir1",
    "/path/to/extra/dir2"
  ]
}
```

**错误响应** (404):

```json
{
  "error": "Session not found"
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/session/list-directories \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "550e8400-e29b-41d4-a716-446655440000"}'
```

### POST /api/sessions/list

获取所有会话列表。

**请求体**: 空对象 `{}`

**响应**:

```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "createdAt": "2025-01-10T10:00:00.000Z",
      "lastActivity": "2025-01-10T10:05:00.000Z",
      "metadata": {}
    }
  ],
  "total": 1
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/sessions/list \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 聊天

### POST /api/chat/stream

SSE流式聊天接口。

**功能特性**:

- ✅ 如果提供了有效的 `sessionId`，使用该 session
- ✅ 如果 `sessionId` 不存在或未提供，**自动创建新 session**
- ✅ 返回的第一个事件包含实际使用的 `sessionId`
- ✅ 支持中文，无需 URL 编码

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000", // 可选：不提供则自动创建
  "message": "你好，你是谁？", // 必需：用户消息
  "workspaceRoot": "/tmp/test", // 可选：创建新session时使用
  "model": "qwen3-coder-plus-2025-09-23" // 可选：创建新session时使用
}
```

**参数说明**:

- `message` (必需): 用户消息
- `sessionId` (可选): 会话ID，不提供则自动创建新会话
- `workspaceRoot` (可选): 工作目录，仅在创建新会话时使用
- `model` (可选): 模型名称，仅在创建新会话时使用

**响应**: Server-Sent Events流

**事件类型**:

- `connected`: 连接建立
  ```json
  {
    "type": "connected",
    "requestId": "req_...",
    "sessionId": "actual-session-id", // 实际使用的会话ID
    "timestamp": 1704960000000
  }
  ```
- `Content`: AI响应内容块
- `ToolCallRequest`: 工具调用请求
- `Thought`: AI思考过程
- `stream_end`: 流结束
- `error`: 错误信息
- `cancelled`: 请求被取消

**示例**:

```bash
# 方式1: 使用已有的 sessionId
curl -N --no-buffer -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "xxx",
    "message": "你好，你是谁？"
  }'

# 方式2: 不提供 sessionId，自动创建新会话（推荐用于快速测试）
curl -N --no-buffer -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好，请介绍一下你自己",
    "workspaceRoot": "/tmp/test"
  }'
```

**重要提示**:

- ✅ 使用 POST + JSON，中文无需 URL 编码
- ✅ 可以不提供 `sessionId`，系统会自动创建
- ✅ 第一个 `connected` 事件会返回实际使用的 `sessionId`
- ⚠️ 使用 curl 时需要加 `-N --no-buffer` 参数以实时显示流

**JavaScript客户端示例**:

```javascript
const sessionId = '550e8400-e29b-41d4-a716-446655440000';
const message = '你好，你是谁？';

fetch('http://localhost:3000/api/chat/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    sessionId,
    message,
  }),
})
  .then((response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    function readStream() {
      reader.read().then(({ done, value }) => {
        if (done) {
          console.log('Stream完成');
          return;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        lines.forEach((line) => {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            console.log('事件:', data);

            if (data.type === 'Content' && data.value) {
              // 处理内容
              console.log(data.value);
            }
          }
        });

        readStream();
      });
    }

    readStream();
  })
  .catch((error) => console.error('错误:', error));
```

### POST /api/chat/cancel

取消正在进行的流式请求。

**请求体**:

```json
{
  "requestId": "req_1234567890_abc123"
}
```

**响应**:

```json
{
  "success": true,
  "requestId": "req_1234567890_abc123"
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/chat/cancel \
  -H "Content-Type: application/json" \
  -d '{"requestId": "req_1234567890_abc123"}'
```

### POST /api/chat/history

获取聊天历史记录。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "limit": 50,
  "offset": 0
}
```

**参数**:

- `sessionId` (必需): 会话ID
- `limit` (可选, 默认50): 返回记录数
- `offset` (可选, 默认0): 偏移量

**响应**:

```json
{
  "history": [
    {
      "id": 1,
      "type": "user",
      "content": "Hello",
      "timestamp": 1704960000000
    },
    {
      "id": 2,
      "type": "assistant",
      "content": "Hi there!",
      "timestamp": 1704960001000
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/chat/history \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "limit": 20,
    "offset": 0
  }'
```

## 文件操作

### POST /api/files/read

读取文件内容。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "path": "README.md",
  "offset": 0,
  "limit": 100
}
```

**参数**:

- `sessionId` (必需): 会话ID
- `path` (必需): 文件路径（相对于workspace）
- `offset` (可选): 起始行号
- `limit` (可选): 读取行数

**响应**:

```json
{
  "success": true,
  "content": "# Project Title\n\nDescription...", // 实际文件内容
  "path": "README.md",
  "displaySummary": "Read lines 1-100 of 324 from README.md" // 可选：操作摘要
}
```

**字段说明**:

- `content`: 实际文件内容（完整或截断的文本）
- `displaySummary`: 操作摘要（如 "Read lines 1-100 of 324"）
- `path`: 请求的文件路径

**示例**:

```bash
curl -X POST http://localhost:3000/api/files/read \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "xxx",
    "path": "README.md"
  }'
```

### POST /api/files/write

写入文件内容。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "path": "output.txt",
  "content": "Hello, World!"
}
```

**参数**:

- `sessionId` (必需): 会话ID
- `path` (必需): 文件路径（相对于workspace）
- `content` (必需): 文件内容

**响应**:

```json
{
  "success": true,
  "path": "output.txt",
  "bytesWritten": 13
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/files/write \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "xxx",
    "path": "output.txt",
    "content": "Hello, World!"
  }'
```

### POST /api/files/search

搜索文件内容（使用grep）。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "pattern": "TODO",
  "path": "src/",
  "maxResults": 100
}
```

**参数**:

- `sessionId` (必需): 会话ID
- `pattern` (必需): 搜索模式（正则表达式）
- `path` (可选): 搜索路径
- `maxResults` (可选, 默认100): 最大结果数

**响应**:

```json
{
  "success": true,
  "results": "src/index.ts:10:// TODO: implement\nsrc/utils.ts:25:// TODO: refactor",
  "displaySummary": "Found 2 matches across 2 files"
}
```

**字段说明**:

- `results`: 实际搜索结果（匹配的行和内容）
- `displaySummary`: 操作摘要（匹配数量统计）

**示例**:

```bash
curl -X POST http://localhost:3000/api/files/search \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "xxx",
    "pattern": "TODO",
    "path": "src/"
  }'
```

### POST /api/files/list

列出目录内容。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "path": "src/"
}
```

**参数**:

- `sessionId` (必需): 会话ID
- `path` (必需): 目录路径

**响应**:

```json
{
  "success": true,
  "contents": "index.ts\nutils.ts\ncomponents/", // 实际目录内容列表
  "path": "src/",
  "displaySummary": "Listed 3 items in src/" // 可选：操作摘要
}
```

**字段说明**:

- `contents`: 实际目录内容（文件和子目录列表）
- `displaySummary`: 操作摘要（项目数量统计）
- `path`: 请求的目录路径

**示例**:

```bash
curl -X POST http://localhost:3000/api/files/list \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "xxx",
    "path": "src/"
  }'
```

## 错误处理

所有接口在出错时返回以下格式：

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

**常见HTTP状态码**:

- `200`: 成功
- `400`: 请求参数错误
- `404`: 资源未找到
- `500`: 服务器内部错误

## 完整使用示例

```bash
#!/bin/bash

# 1. 创建会话
SESSION_RESPONSE=$(curl -s -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"workspaceRoot":"/tmp/test"}')

SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.sessionId')
echo "Created session: $SESSION_ID"

# 2. 流式聊天
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"你好，请介绍一下你自己\"
  }"

# 3. 读取文件
curl -X POST http://localhost:3000/api/files/read \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"path\": \"README.md\"
  }"

# 4. 获取历史
curl -X POST http://localhost:3000/api/chat/history \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"limit\": 10
  }"

# 5. 删除会话
curl -X POST http://localhost:3000/api/session/delete \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\"}"
```

## 优势说明

### 统一使用 POST + JSON 的好处

1. **简化客户端实现**: 所有请求使用相同的方式处理
2. **更好的中文支持**: JSON 自动处理 UTF-8 编码，无需手动 URL 编码
3. **更灵活的参数**: JSON 支持复杂的嵌套结构
4. **更好的安全性**: 敏感数据不会出现在 URL 中
5. **统一的错误处理**: 所有接口返回一致的错误格式

### 与传统 REST API 的对比

| 传统方式                | 新方式                   |
| ----------------------- | ------------------------ |
| GET /api/session/:id    | POST /api/session/get    |
| DELETE /api/session/:id | POST /api/session/delete |
| GET /api/sessions       | POST /api/sessions/list  |
| 参数在 URL 中           | 参数在 JSON body 中      |
| 中文需要编码            | 自动处理编码             |

## 命令系统

### At命令（@文件引用）

在聊天消息中使用`@`符号引用文件，服务器会自动读取文件内容并注入到上下文中。

**支持的功能**：

- 单文件引用：`@README.md`
- 多文件引用：`@README.md @package.json`
- 通配符匹配：`@src/*.ts`
- 自动过滤：遵守 `.gitignore` 和 `.qwenignore`

**示例**：

```bash
# 引用单个文件
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "message": "请分析 @README.md 的内容"
  }'

# 引用多个文件
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "message": "对比 @src/index.ts 和 @src/app.ts"
  }'

# 使用通配符
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "message": "分析 @src/**/*.ts 中的TypeScript代码"
  }'
```

**响应事件**：

服务器会在SSE流中发送以下事件：

```json
// 文件引用信息
{
  "type": "file_references",
  "files": [
    { "path": "README.md", "size": 1234 },
    { "path": "package.json", "size": 567 }
  ],
  "timestamp": 1641234567890
}

// 警告信息（文件处理失败）
{
  "type": "warning",
  "message": "Failed to process file references: File not found",
  "timestamp": 1641234567890
}
```

### 命令执行API

#### POST /api/commands/list

列出所有可用命令。

**请求体**：

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**响应**：

```json
{
  "success": true,
  "commands": [
    {
      "name": "mycommand",
      "description": "Custom command from mycommand.toml",
      "kind": "file",
      "extensionName": "my-extension"
    }
  ],
  "total": 1
}
```

**示例**：

```bash
curl -X POST http://localhost:3000/api/commands/list \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "your-session-id"}'
```

#### POST /api/commands/execute

执行命令。

**请求体**：

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "command": "mycommand",
  "args": "arg1 arg2"
}
```

**响应**：

```json
{
  "success": true,
  "command": "mycommand",
  "output": "Command execution result"
}
```

**错误响应**：

```json
{
  "success": false,
  "error": "Command not found: /unknown"
}
```

**示例**：

```bash
# 执行自定义命令
curl -X POST http://localhost:3000/api/commands/execute \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "command": "mycommand",
    "args": "hello world"
  }'

# 命令名可以带或不带 / 前缀
curl -X POST http://localhost:3000/api/commands/execute \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "command": "/mycommand",
    "args": "hello world"
  }'
```

#### POST /api/commands/help

获取命令帮助信息。

**请求体**：

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "command": "mycommand" // 可选，不提供则返回所有命令列表
}
```

**响应（单个命令）**：

```json
{
  "success": true,
  "command": {
    "name": "mycommand",
    "description": "Custom command from mycommand.toml",
    "kind": "file",
    "extensionName": "my-extension"
  }
}
```

**响应（所有命令）**：

```json
{
  "success": true,
  "commands": [
    {
      "name": "mycommand",
      "description": "Custom command from mycommand.toml"
    }
  ],
  "total": 1
}
```

### 自定义命令

自定义命令通过`.toml`文件定义，放置在工作区的`.qwen/commands/`目录下。

**命令文件示例** (`.qwen/commands/mycommand.toml`):

```toml
description = "My custom command"
prompt = """
You are a helpful assistant.
User input: {{args}}

Please process this request.
"""
```

**支持的占位符**：

- `{{args}}` - 命令参数
- `@{filename}` - 文件内容注入
- `!{shell command}` - Shell命令输出（HTTP服务不支持，安全原因）

**命令加载**：

命令会在第一次调用`/api/commands/list`或`/api/commands/execute`时自动加载。包括：

1. 工作区`.qwen/commands/`目录下的`.toml`文件
2. MCP服务器提供的提示（如果配置了MCP）

**注意事项**：

- 命令名称自动从文件路径生成
- 支持子目录，使用`:`作为分隔符（如`dir:subdir:command`）
- 命令描述可选，默认使用文件名
- 文件路径中的特殊字符会被自动处理

## 使用场景示例

### 场景1：代码审查助手

```bash
# 1. 创建会话
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"workspaceRoot":"/path/to/project"}' | jq -r '.sessionId')

# 2. 使用@命令引用需要审查的文件
curl -N --no-buffer -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"请审查 @src/**/*.ts 中的代码，关注潜在的bug和性能问题\"
  }"
```

### 场景2：使用自定义命令

```bash
# 1. 创建自定义命令文件
mkdir -p /path/to/project/.qwen/commands
cat > /path/to/project/.qwen/commands/review.toml << 'EOF'
description = "Code review helper"
prompt = """
Please review the following code:

@{{{args}}}

Focus on:
- Code quality
- Potential bugs
- Performance issues
"""
EOF

# 2. 执行自定义命令
curl -X POST http://localhost:3000/api/commands/execute \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"command\": \"review\",
    \"args\": \"src/index.ts\"
  }"
```

### 场景3：批量文件分析

```bash
# 使用@命令的通配符功能
curl -N --no-buffer -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"分析 @test/**/*.test.ts 中的测试覆盖情况\"
  }"
```
