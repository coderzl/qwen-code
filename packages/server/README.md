# Qwen Code HTTP Server

基于 Fastify 的高性能 HTTP 服务，提供 Qwen Code 的核心功能。

## 特性

- ✅ **统一 POST + JSON 接口**: 所有接口使用 POST 方法和 JSON 格式
- ✅ **完美中文支持**: 无需 URL 编码，直接发送中文消息
- ✅ **自动会话管理**: chat 接口可自动创建 session，无需手动管理
- ✅ **SSE 流式响应**: 实时接收 AI 响应
- ✅ **会话持久化**: 支持多会话管理
- ✅ **文件操作**: 读写、搜索、列表等文件操作
- ✅ **单用户模式**: 简化部署，本地使用无需认证

## 快速开始

### 1. 环境配置

创建 `.env` 文件：

```bash
cd packages/server

cat > .env << 'EOF'
# API 认证配置
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=qwen3-coder-plus-2025-09-23
AUTH_TYPE=openai
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 服务配置
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
EOF
```

**环境变量说明**:

- `OPENAI_API_KEY`: API 密钥（必需）
- `OPENAI_MODEL`: 模型名称
- `AUTH_TYPE`: 认证类型（openai/qwen-oauth等）
- `OPENAI_BASE_URL`: API 端点（可选）

### 2. 安装依赖

```bash
npm install
```

### 3. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

服务将在 `http://localhost:3000` 启动。

### 4. 最简单的测试

无需手动创建 session，直接聊天：

```bash
curl -N --no-buffer -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好，请介绍一下你自己",
    "workspaceRoot": "/tmp/test"
  }'
```

**输出**:

```
data: {"type":"connected","requestId":"...","sessionId":"auto-created-id","timestamp":...}
data: {"type":"Content","value":"你好！","timestamp":...}
data: {"type":"Content","value":"我是通义千问","timestamp":...}
...
data: {"type":"stream_end","timestamp":...}
```

## 功能对比

### HTTP服务 vs CLI 功能对照表

| 功能模块          | CLI支持 | HTTP支持 | 状态   | 说明                 |
| ----------------- | ------- | -------- | ------ | -------------------- |
| **基础功能**      |         |          |        |
| 基础聊天          | ✅      | ✅       | 完成   | SSE流式响应          |
| 会话管理          | ✅      | ✅       | 完成   | 创建、查询、删除会话 |
| 历史记录          | ✅      | ✅       | 完成   | 自动保存和查询       |
| **文件操作**      |         |          |        |
| 文件读取          | ✅      | ✅       | 完成   | 支持偏移量和限制     |
| 文件写入          | ✅      | ✅       | 完成   | 支持创建和覆盖       |
| 文件搜索          | ✅      | ✅       | 完成   | 内容搜索             |
| 目录列出          | ✅      | ✅       | 完成   | 列出目录内容         |
| **命令功能**      |         |          |        |
| Slash命令         | ✅      | ⚠️       | 计划中 | P1优先级             |
| At命令(@文件)     | ✅      | ⚠️       | 开发中 | P0优先级             |
| 自定义命令(.toml) | ✅      | ⚠️       | 开发中 | P0优先级             |
| Shell命令(!或$)   | ✅      | ❌       | 不实现 | 安全风险高           |
| **工具系统**      |         |          |        |
| 基础工具调用      | ✅      | ✅       | 完成   | 通过executeToolCall  |
| 工具权限确认      | ✅      | ❌       | 待实现 | P1优先级             |
| 并发工具管理      | ✅      | ❌       | 待实现 | P2优先级             |
| **安全功能**      |         |          |        |
| 路径安全验证      | ✅      | ✅       | 完成   | 防路径遍历           |
| 文件过滤          | ✅      | ✅       | 完成   | gitignore/qwenignore |
| 速率限制          | N/A     | ❌       | 待实现 | P2优先级             |
| 审计日志          | N/A     | ❌       | 待实现 | P2优先级             |
| **CLI特定功能**   |         |          |        |
| 终端主题          | ✅      | N/A      | 不适用 | HTTP服务无终端       |
| Vim模式           | ✅      | N/A      | 不适用 | HTTP服务无交互       |
| IDE集成           | ✅      | N/A      | 不适用 | 仅CLI支持            |

### 已实现功能 (约30%)

✅ **完全支持**

- 基础聊天和流式响应
- 会话管理（自动创建、查询、删除）
- 历史记录（自动保存和查询）
- 文件操作（读、写、搜索、列表）
- 路径安全验证
- 中文完美支持（POST + JSON）

### 开发中功能 (P0 - 核心命令)

🚧 **正在实现**

- At命令处理（@文件引用）
- 自定义命令加载（.toml文件）
- 命令执行API

预计完成时间：1-2周

### 计划中功能 (P1 - 重要命令)

📋 **待实现**

- 核心Slash命令（/help, /clear, /model等约10个）
- 命令帮助系统
- MCP提示加载

预计完成时间：1个月

### 不实现功能

❌ **安全或场景限制**

- Shell命令执行（安全风险高）
- CLI特定命令（/quit, /theme, /vim, /ide等）

**原因说明**：

1. **Shell命令**：允许HTTP客户端执行任意命令存在重大安全隐患，且HTTP远程访问场景下意义不大
2. **CLI特定命令**：这些命令依赖终端交互，在HTTP服务环境中无实际意义

## 核心功能

### 1. 自动会话管理

Chat 接口支持自动创建 session，无需额外步骤：

```bash
# 方式1: 让系统自动创建 session（推荐）
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'

# 方式2: 手动管理 session
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"workspaceRoot":"/tmp/test"}' | jq -r '.sessionId')

curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"Hello\"}"
```

### 2. 中文支持

使用 POST + JSON，中文消息无需任何编码：

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好，请用中文回答：什么是人工智能？"
  }'
```

### 3. 会话复用

保存第一次返回的 sessionId，后续请求复用：

```bash
# 第一次聊天，获取 sessionId
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}' > /tmp/response.txt

# 从响应中提取 sessionId
SESSION_ID=$(grep -o '"sessionId":"[^"]*"' /tmp/response.txt | head -1 | cut -d'"' -f4)

# 后续聊天复用 session
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"继续\"}"
```

## API 文档

详细的 API 文档请查看：

- **API 参考**: [`doc/API.md`](doc/API.md)
- **配置指南**: [`doc/CONFIG_GUIDE.md`](doc/CONFIG_GUIDE.md)
- **功能迁移**: [`doc/FEATURE_MIGRATION.md`](doc/FEATURE_MIGRATION.md)

## 示例代码

### TypeScript/JavaScript

参见 [`examples/client.ts`](examples/client.ts)：

```typescript
import { streamChatWithFetch } from './examples/client';

// 最简单的方式：不提供 sessionId，自动创建
await streamChatWithFetch(
  undefined,
  '你好，请介绍你自己',
  {
    onConnected: (requestId, sessionId) => {
      console.log('Session ID:', sessionId);
    },
    onContent: (content) => {
      process.stdout.write(content);
    },
    onEnd: () => console.log('\nDone!'),
  },
  {
    workspaceRoot: '/tmp/test',
  },
);
```

运行示例：

```bash
cd examples
tsx client.ts
```

### Shell 脚本

快速测试脚本：

```bash
# 简单测试
./test-quick-chat.sh

# 完整测试
./scripts/test-complete.sh
```

## 主要接口

### 聊天接口（核心）

```bash
POST /api/chat/stream
```

**请求体**:

```json
{
  "message": "你好", // 必需
  "sessionId": "xxx", // 可选：不提供则自动创建
  "workspaceRoot": "/tmp/test", // 可选：创建新session时使用
  "model": "qwen3-coder-plus" // 可选：创建新session时使用
}
```

**响应**: SSE 流，包含：

- `connected` 事件（包含 sessionId）
- `Content` 事件（AI 响应内容）
- `stream_end` 事件

### 会话管理

```bash
# 创建会话
POST /api/session
Body: {"workspaceRoot": "/tmp/test"}

# 获取会话信息
POST /api/session/get
Body: {"sessionId": "xxx"}

# 删除会话
POST /api/session/delete
Body: {"sessionId": "xxx"}

# 列出所有会话
POST /api/sessions/list
Body: {}
```

### 文件操作

```bash
# 读取文件
POST /api/files/read
Body: {"sessionId": "xxx", "path": "README.md"}

# 写入文件
POST /api/files/write
Body: {"sessionId": "xxx", "path": "test.txt", "content": "..."}

# 搜索文件
POST /api/files/search
Body: {"sessionId": "xxx", "pattern": "TODO"}

# 列出目录
POST /api/files/list
Body: {"sessionId": "xxx", "path": "."}
```

## 开发

### 项目结构

```
packages/server/
├── src/
│   ├── index.ts              # 入口文件
│   ├── routes/               # 路由定义
│   │   ├── session.ts        # 会话管理
│   │   ├── chat.ts           # 聊天接口
│   │   ├── files.ts          # 文件操作
│   │   └── health.ts         # 健康检查
│   ├── services/             # 服务层
│   │   └── SessionService.ts # 会话管理服务
│   ├── middleware/           # 中间件
│   └── types/                # 类型定义
├── doc/                      # 文档
├── examples/                 # 示例代码
└── scripts/                  # 脚本工具
```

### 测试

```bash
# 运行单元测试
npm test

# Lint 检查
npm run lint

# 类型检查
npm run typecheck

# 完整功能测试
./scripts/test-complete.sh
```

## 故障排除

### 问题：Chat not initialized

**原因**: 环境变量未正确配置或服务未重启。

**解决**:

1. 检查 `.env` 文件或环境变量
2. 重启服务
3. 查看启动日志确认初始化成功

### 问题：流立即被取消

**原因**: 使用 curl 时未加 `-N --no-buffer` 参数。

**解决**:

```bash
# 正确方式
curl -N --no-buffer -X POST ...

# 或使用快速测试脚本
./test-quick-chat.sh
```

### 问题：400 Bad Request

**原因**:

- JSON 格式错误
- 缺少必需参数

**解决**:

- 检查 JSON 语法
- 确保 `message` 参数存在
- 参考 API 文档

## 配置说明

详细配置说明请查看 [`doc/CONFIG_GUIDE.md`](doc/CONFIG_GUIDE.md)。

### 环境变量优先级

1. 直接环境变量（`export OPENAI_API_KEY=...`）
2. `.env` 文件（项目根目录）
3. 默认值

### 推荐配置

**本地开发**:

```env
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=qwen3-coder-plus-2025-09-23
AUTH_TYPE=openai
LOG_LEVEL=debug
```

**生产环境**:

```env
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=qwen3-coder-plus-2025-09-23
AUTH_TYPE=openai
LOG_LEVEL=info
PORT=3000
HOST=0.0.0.0
```

## 许可证

Apache 2.0 License

## 相关链接

- [API 文档](doc/API.md)
- [配置指南](doc/CONFIG_GUIDE.md)
- [功能迁移进度](doc/FEATURE_MIGRATION.md)
- [示例代码](examples/)
