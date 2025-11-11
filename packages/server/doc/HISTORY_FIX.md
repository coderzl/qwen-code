# Session History 更新修复

## 问题描述

查询 session 信息时，`messageCount` 始终返回 0，即使已经有过对话：

```bash
curl -X POST http://localhost:3000/api/session/get \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx"}'

# 返回：
{
  "id": "xxx",
  "messageCount": 0,  # ❌ 应该是实际的消息数量
  ...
}
```

## 根本原因

`session.history` 数组从未被更新。虽然聊天流正常工作，但消息没有被添加到会话历史中。

## 修复方案

在 chat 流完成后，自动更新 `session.history`：

```typescript
// 在 for await (const event of stream) 循环中
let fullResponse = '';

// 收集所有 Content 事件
if (eventType === 'Content' || eventType === 'content') {
  fullResponse += eventValue;
}

// 流完成后，更新历史
if (!abortController.signal.aborted && session) {
  // 添加用户消息
  session.history.push({
    id: session.history.length + 1,
    type: 'user',
    content: message,
    timestamp: Date.now(),
  });

  // 添加助手响应
  if (fullResponse) {
    session.history.push({
      id: session.history.length + 1,
      type: 'assistant',
      content: fullResponse,
      timestamp: Date.now(),
    });
  }
}
```

## 验证修复

### 1. 重启服务

```bash
cd packages/server
npm run dev
```

### 2. 测试对话并查询

```bash
# 创建 session 并聊天
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"workspaceRoot":"/tmp/test"}' \
  | jq -r '.sessionId')

echo "Session ID: $SESSION_ID"

# 第一次聊天
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"你好\"}" \
  > /dev/null 2>&1

# 查询 session 信息
curl -X POST http://localhost:3000/api/session/get \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\"}" | jq .

# 应该看到 messageCount: 2 (1个用户消息 + 1个助手响应)
```

### 3. 测试多轮对话

```bash
# 第二次聊天
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"1+1=?\"}" \
  > /dev/null 2>&1

# 再次查询
curl -X POST http://localhost:3000/api/session/get \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\"}" | jq .

# 应该看到 messageCount: 4 (2轮对话 x 2条消息)
```

### 4. 验证历史记录内容

```bash
# 获取历史记录
curl -X POST http://localhost:3000/api/chat/history \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\"}" | jq .

# 应该看到完整的对话历史
```

## 预期结果

### Session Info

```json
{
  "id": "xxx",
  "userId": "local-user",
  "createdAt": "2025-01-11T08:00:00.000Z",
  "lastActivity": "2025-01-11T08:01:00.000Z",
  "duration": 60000,
  "messageCount": 4, // ✅ 正确的消息数量
  "metadata": {}
}
```

### Chat History

```json
{
  "history": [
    {
      "id": 1,
      "type": "user",
      "content": "你好",
      "timestamp": 1704960000000
    },
    {
      "id": 2,
      "type": "assistant",
      "content": "你好！我是通义千问...",
      "timestamp": 1704960001000
    },
    {
      "id": 3,
      "type": "user",
      "content": "1+1=?",
      "timestamp": 1704960010000
    },
    {
      "id": 4,
      "type": "assistant",
      "content": "2",
      "timestamp": 1704960011000
    }
  ],
  "total": 4,
  "limit": 50,
  "offset": 0
}
```

## 技术细节

### History 数据结构

```typescript
interface HistoryItem {
  id: number; // 递增的消息ID
  type: 'user' | 'assistant' | 'system'; // 消息类型
  content: string; // 消息内容
  timestamp: number; // 时间戳
  metadata?: Record<string, unknown>; // 可选元数据
}
```

### 更新时机

- **用户消息**: 在流开始前或结束后添加
- **助手响应**: 在流完成后，收集所有 Content 事件的值
- **不更新的情况**: 流被中止（aborted）时

### 日志输出

成功更新后，服务器日志会显示：

```
[Chat] Stream completed with 50 events
[Chat] Updated history, total messages: 4
```

## 相关接口

### 获取历史记录

```bash
POST /api/chat/history
```

**请求**:

```json
{
  "sessionId": "xxx",
  "limit": 50,
  "offset": 0
}
```

现在返回的历史记录包含完整的对话内容。

### 获取 Session 统计

```bash
POST /api/session/get
```

现在 `messageCount` 字段返回正确的消息数量。

## 完整测试脚本

创建测试脚本 `test-history.sh`：

```bash
#!/bin/bash

SESSION_ID=$(curl -s -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"workspaceRoot":"/tmp/test"}' | jq -r '.sessionId')

echo "Session ID: $SESSION_ID"
echo ""

# 第1轮对话
echo "第1轮对话..."
curl -s -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"你好\"}" \
  > /dev/null

# 查询
echo "查询 session..."
curl -s -X POST http://localhost:3000/api/session/get \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\"}" | jq '{messageCount}'

# 第2轮对话
echo ""
echo "第2轮对话..."
curl -s -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"1+1=?\"}" \
  > /dev/null

# 再次查询
echo "查询 session..."
curl -s -X POST http://localhost:3000/api/session/get \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\"}" | jq '{messageCount}'

# 查询历史
echo ""
echo "查询历史记录..."
curl -s -X POST http://localhost:3000/api/chat/history \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\"}" | jq '.history[] | {type, content}'
```

运行：

```bash
chmod +x test-history.sh
./test-history.sh
```

## 总结

✅ **已修复**: Session history 现在会自动更新  
✅ **messageCount**: 返回正确的消息数量  
✅ **历史记录**: 包含完整的用户和助手消息  
✅ **持久化**: 在 session 生命周期内保持（内存中）

**注意**: 当前实现将历史保存在内存中，服务重启后会丢失。如需持久化，可以考虑：

- Redis 存储
- 数据库存储
- 文件系统存储
