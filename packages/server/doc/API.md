# Qwen Code HTTP Server - API文档

## 概述

Qwen Code HTTP Server 提供REST API和SSE流式聊天功能，将CLI能力通过HTTP接口暴露。

**基础URL**: `http://localhost:3000`

**认证模式**: 当前为单用户模式，无需认证（所有API直接访问）

## 健康检查

### GET /health

检查服务健康状态。

**响应**:

```json
{
  "status": "ok",
  "timestamp": "2025-01-10T10:00:00.000Z",
  "uptime": 3600.5
}
```

### GET /ready

检查服务就绪状态。

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

创建新的聊天会话。

**请求体**:

```json
{
  "workspaceRoot": "/path/to/workspace",
  "model": "qwen-code",
  "metadata": {}
}
```

**参数说明**:

- `workspaceRoot` (可选): 工作区根目录路径
- `model` (可选): 使用的AI模型
- `metadata` (可选): 会话元数据

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
  -d '{"workspaceRoot":"/tmp/test","model":"qwen-code"}'
```

### GET /api/session/:sessionId

获取会话信息。

**路径参数**:

- `sessionId`: 会话ID

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
curl http://localhost:3000/api/session/550e8400-e29b-41d4-a716-446655440000
```

### DELETE /api/session/:sessionId

删除会话。

**路径参数**:

- `sessionId`: 会话ID

**响应**:

```json
{
  "success": true
}
```

**示例**:

```bash
curl -X DELETE http://localhost:3000/api/session/550e8400-e29b-41d4-a716-446655440000
```

### GET /api/sessions

获取所有会话列表。

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
curl http://localhost:3000/api/sessions
```

## 聊天

### GET /api/chat/stream

SSE流式聊天接口。

**查询参数**:

- `sessionId` (必需): 会话ID
- `message` (必需): 用户消息

**响应**: Server-Sent Events流

**事件类型**:

- `connected`: 连接建立，包含`requestId`
- `Content`: AI响应内容块
- `ToolCallRequest`: 工具调用请求
- `Thought`: AI思考过程
- `stream_end`: 流结束
- `error`: 错误信息
- `cancelled`: 请求被取消

**示例**:

```bash
curl -N "http://localhost:3000/api/chat/stream?sessionId=xxx&message=hello"
```

**JavaScript客户端示例**:

```javascript
const sessionId = '550e8400-e29b-41d4-a716-446655440000';
const message = 'Hello, how can you help me?';

const eventSource = new EventSource(
  `http://localhost:3000/api/chat/stream?sessionId=${sessionId}&message=${encodeURIComponent(message)}`,
);

let requestId = null;

eventSource.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);

  switch (data.type) {
    case 'connected':
      requestId = data.requestId;
      console.log('Connected, requestId:', requestId);
      break;

    case 'Content':
      console.log('Content:', data.value);
      break;

    case 'ToolCallRequest':
      console.log('Tool call:', data.value);
      break;

    case 'Thought':
      console.log('Thinking:', data.value);
      break;

    case 'stream_end':
      console.log('Stream completed');
      eventSource.close();
      break;

    case 'error':
      console.error('Error:', data.error);
      eventSource.close();
      break;
  }
});

eventSource.onerror = (error) => {
  console.error('EventSource error:', error);
  eventSource.close();
};
```

### POST /api/chat/cancel

取消正在进行的流式请求。

**请求体**:

```json
{
  "requestId": "req_1234567890_xxx"
}
```

**响应**:

```json
{
  "success": true,
  "requestId": "req_1234567890_xxx"
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/chat/cancel \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req_1234567890_xxx"}'
```

### GET /api/chat/history/:sessionId

获取会话历史记录。

**路径参数**:

- `sessionId`: 会话ID

**查询参数**:

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
      "timestamp": 1234567890
    },
    {
      "id": 2,
      "type": "assistant",
      "content": "Hi there!",
      "timestamp": 1234567891
    }
  ],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

**示例**:

```bash
curl "http://localhost:3000/api/chat/history/550e8400-e29b-41d4-a716-446655440000?limit=10&offset=0"
```

## 文件操作

### POST /api/files/read

读取文件内容。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "path": "/path/to/file.txt",
  "offset": 0,
  "limit": 1000
}
```

**参数说明**:

- `sessionId` (必需): 会话ID
- `path` (必需): 文件路径（相对于工作区根目录）
- `offset` (可选): 读取起始位置
- `limit` (可选): 读取长度

**响应**:

```json
{
  "success": true,
  "content": "file content...",
  "path": "/path/to/file.txt"
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/files/read \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","path":"/tmp/test.txt"}'
```

### POST /api/files/write

写入文件。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "path": "/path/to/file.txt",
  "content": "file content"
}
```

**参数说明**:

- `sessionId` (必需): 会话ID
- `path` (必需): 文件路径（相对于工作区根目录）
- `content` (必需): 文件内容

**响应**:

```json
{
  "success": true,
  "path": "/path/to/file.txt",
  "bytesWritten": 13
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/files/write \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","path":"/tmp/test.txt","content":"Hello World"}'
```

### POST /api/files/search

搜索文件内容。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "pattern": "search pattern",
  "path": "/path/to/search",
  "maxResults": 100
}
```

**参数说明**:

- `sessionId` (必需): 会话ID
- `pattern` (必需): 搜索模式（正则表达式）
- `path` (可选): 搜索路径（相对于工作区根目录）
- `maxResults` (可选, 默认100): 最大结果数

**响应**:

```json
{
  "success": true,
  "results": "search results..."
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/files/search \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","pattern":"function","maxResults":50}'
```

### POST /api/files/list

列出目录内容。

**请求体**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "path": "/path/to/directory"
}
```

**参数说明**:

- `sessionId` (必需): 会话ID
- `path` (必需): 目录路径（相对于工作区根目录）

**响应**:

```json
{
  "success": true,
  "contents": "directory listing...",
  "path": "/path/to/directory"
}
```

**示例**:

```bash
curl -X POST http://localhost:3000/api/files/list \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","path":"/tmp"}'
```

## 错误处理

所有API在出错时返回标准错误响应：

```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

**HTTP状态码**:

- `200`: 成功
- `400`: 请求参数错误
- `404`: 资源未找到
- `500`: 服务器内部错误

## 安全说明

### 路径安全

所有文件操作API都会验证路径，防止路径遍历攻击：

- 路径必须相对于工作区根目录
- 不允许访问工作区外的文件
- 自动规范化路径

### 单用户模式

当前实现为单用户模式：

- 所有会话属于固定用户 `local-user`
- 无需认证即可访问所有API
- 适合本地开发和个人使用

**注意**: 生产环境建议添加认证机制。

## 限制

- 文件大小限制: 10MB
- 会话超时: 30分钟（无活动）
- 并发会话: 无限制（内存限制）

## 示例工作流

### 完整聊天流程

```bash
# 1. 创建会话
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"workspaceRoot":"/tmp/test"}' \
  | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)

echo "Session ID: $SESSION_ID"

# 2. 发送消息（SSE）
curl -N "http://localhost:3000/api/chat/stream?sessionId=$SESSION_ID&message=hello"

# 3. 获取历史记录
curl "http://localhost:3000/api/chat/history/$SESSION_ID"

# 4. 读取文件
curl -X POST http://localhost:3000/api/files/read \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"path\":\"/tmp/test.txt\"}"

# 5. 删除会话
curl -X DELETE "http://localhost:3000/api/session/$SESSION_ID"
```
