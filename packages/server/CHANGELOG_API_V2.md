# API 优化变更日志

## 版本 2.0 - 统一使用 POST + JSON

**变更日期**: 2025-01-11

### 概述

将所有 HTTP 接口统一改为 POST 方法，所有参数使用 JSON 格式传递，简化客户端实现并提供更好的中文支持。

### 主要变更

#### 1. 会话管理 API

| 旧接口                    | 新接口                     | 说明                      |
| ------------------------- | -------------------------- | ------------------------- |
| `POST /api/session`       | `POST /api/session`        | ✅ 保持不变               |
| `GET /api/session/:id`    | `POST /api/session/get`    | 🔄 改为 POST，参数在 body |
| `DELETE /api/session/:id` | `POST /api/session/delete` | 🔄 改为 POST，参数在 body |
| `GET /api/sessions`       | `POST /api/sessions/list`  | 🔄 改为 POST              |

#### 2. 聊天 API

| 旧接口                                           | 新接口                   | 说明                      |
| ------------------------------------------------ | ------------------------ | ------------------------- |
| `GET /api/chat/stream?sessionId=...&message=...` | `POST /api/chat/stream`  | 🔄 改为 POST，参数在 body |
| `POST /api/chat/cancel`                          | `POST /api/chat/cancel`  | ✅ 保持不变               |
| `GET /api/chat/history/:id?limit=...`            | `POST /api/chat/history` | 🔄 改为 POST，参数在 body |

#### 3. 文件操作 API

| 接口                     | 说明        |
| ------------------------ | ----------- |
| `POST /api/files/read`   | ✅ 保持不变 |
| `POST /api/files/write`  | ✅ 保持不变 |
| `POST /api/files/search` | ✅ 保持不变 |
| `POST /api/files/list`   | ✅ 保持不变 |

### 详细变更示例

#### 会话信息查询

**旧方式**:

```bash
curl http://localhost:3000/api/session/550e8400-e29b-41d4-a716-446655440000
```

**新方式**:

```bash
curl -X POST http://localhost:3000/api/session/get \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "550e8400-e29b-41d4-a716-446655440000"}'
```

#### 流式聊天

**旧方式** (GET + 查询参数):

```bash
# 中文需要 URL 编码
curl -G -N http://localhost:3000/api/chat/stream \
  --data-urlencode "sessionId=xxx" \
  --data-urlencode "message=你好"
```

**新方式** (POST + JSON):

```bash
# JSON 自动处理编码，无需手动编码
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "xxx",
    "message": "你好，你是谁？"
  }'
```

#### 删除会话

**旧方式**:

```bash
curl -X DELETE http://localhost:3000/api/session/550e8400-e29b-41d4-a716-446655440000
```

**新方式**:

```bash
curl -X POST http://localhost:3000/api/session/delete \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "550e8400-e29b-41d4-a716-446655440000"}'
```

### 优势说明

#### 1. 统一的接口设计

- 所有接口使用相同的 POST 方法
- 所有参数使用 JSON 格式
- 更容易理解和使用

#### 2. 更好的中文支持

- **旧方式**: 中文需要手动 URL 编码 (`--data-urlencode`)
- **新方式**: JSON 自动处理 UTF-8 编码，无需特殊处理

```javascript
// 旧方式：需要编码
const url = `${baseUrl}/api/chat/stream?message=${encodeURIComponent('你好')}`;

// 新方式：无需编码
fetch(`${baseUrl}/api/chat/stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '你好' }),
});
```

#### 3. 更灵活的参数传递

- 支持复杂的嵌套结构
- 支持数组、对象等复杂类型
- 更容易扩展

#### 4. 更好的安全性

- 敏感数据不会出现在 URL 中
- 不会被记录到服务器日志
- 不会被浏览器历史记录

#### 5. 更好的客户端体验

```typescript
// 统一的请求函数
async function apiRequest(endpoint: string, data: any) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return await response.json();
}

// 所有 API 都使用相同的方式
await apiRequest('/api/session/get', { sessionId });
await apiRequest('/api/session/delete', { sessionId });
await apiRequest('/api/sessions/list', {});
await apiRequest('/api/chat/history', { sessionId, limit: 10 });
```

### 迁移指南

#### 客户端代码迁移

1. **JavaScript/TypeScript**:
   - 参考: `examples/client.ts`
   - 使用 `fetch` API 的 POST 方法
   - 所有参数放在 `body` 中

2. **Shell/Bash**:
   - 参考: `scripts/test-complete.sh`
   - 所有 `curl` 请求添加 `-X POST`
   - 添加 `-H "Content-Type: application/json"`
   - 使用 `-d` 传递 JSON 数据

3. **Python**:

```python
import requests

# 统一的请求方式
def api_request(endpoint, data=None):
    return requests.post(
        f'http://localhost:3000{endpoint}',
        json=data or {}
    ).json()

# 使用示例
session_id = api_request('/api/session', {
    'workspaceRoot': '/tmp/test'
})['sessionId']

session_info = api_request('/api/session/get', {
    'sessionId': session_id
})
```

### 文件变更清单

#### 后端路由文件

- ✅ `src/routes/session.ts` - 会话管理路由
- ✅ `src/routes/chat.ts` - 聊天路由
- ✅ `src/routes/files.ts` - 文件操作路由（已是 POST）

#### 文档文件

- ✅ `doc/API.md` - API 文档完全重写
- ✅ `CHANGELOG_API_V2.md` - 本变更日志

#### 示例文件

- ✅ `examples/client.ts` - TypeScript 客户端示例
- ✅ `examples/README.md` - 使用说明

#### 测试文件

- ✅ `scripts/test-complete.sh` - 完整测试脚本

### 向后兼容性

⚠️ **不兼容变更**: 此次更新不向后兼容，旧的 GET/DELETE 接口已完全移除。

**升级建议**:

1. 更新所有客户端代码以使用新的 POST 接口
2. 参考 `examples/client.ts` 和 `doc/API.md`
3. 使用 `scripts/test-complete.sh` 验证新接口

### 测试验证

运行完整测试脚本:

```bash
cd packages/server
chmod +x scripts/test-complete.sh
./scripts/test-complete.sh
```

所有测试应通过:

- ✅ 健康检查
- ✅ 会话管理（创建、查询、删除、列表）
- ✅ SSE 流式聊天（支持中文）
- ✅ 聊天历史
- ✅ 文件操作（读、写、搜索、列表）

### 常见问题

#### Q: 为什么要将所有接口改为 POST？

A:

- 统一接口设计，简化客户端实现
- 更好地支持中文和特殊字符（无需 URL 编码）
- 更灵活的参数传递
- 更好的安全性

#### Q: SSE 为什么也用 POST？

A:

- SSE 协议支持 POST 方法
- 避免 URL 参数长度限制
- 中文消息无需 URL 编码
- 与其他接口保持一致

#### Q: 如何处理 EventSource 不支持 POST 的问题？

A:

- 使用 `fetch` API 读取 SSE 流
- 参考 `examples/client.ts` 中的 `streamChatWithFetch` 函数
- 示例代码已提供完整实现

#### Q: 旧的 GET/DELETE 接口还能用吗？

A:

- ❌ 已完全移除，不再支持
- 必须更新客户端代码以使用新接口

### 总结

此次更新统一了所有 HTTP 接口的设计：

- ✅ 所有接口使用 POST 方法
- ✅ 所有参数使用 JSON 格式
- ✅ 完美支持中文，无需编码
- ✅ 更简单、更安全、更灵活

**推荐立即升级以获得更好的开发体验！**
