# Qwen Code HTTP Server - 快速开始

## 30秒快速体验

### 1. 配置环境变量

```bash
export OPENAI_API_KEY="sk-your-api-key"
export OPENAI_MODEL="qwen3-coder-plus-2025-09-23"
export AUTH_TYPE="openai"
```

### 2. 启动服务

```bash
cd packages/server
npm run dev
```

### 3. 直接聊天（自动创建 session）

```bash
curl -N --no-buffer -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好，请用一句话介绍你自己"
  }'
```

**就这么简单！** ✨

## 核心优势

### ✅ 无需手动创建 Session

**旧方式** (需要2步):

```bash
# 步骤1: 创建 session
SESSION_ID=$(curl -X POST .../api/session ...)

# 步骤2: 聊天
curl "...?sessionId=$SESSION_ID&message=hello"
```

**新方式** (1步完成):

```bash
# 直接聊天，自动创建
curl -X POST .../api/chat/stream -d '{"message":"hello"}'
```

### ✅ 完美中文支持

**旧方式** (需要 URL 编码):

```bash
curl -G --data-urlencode "message=你好"
```

**新方式** (直接使用):

```bash
curl -X POST ... -d '{"message":"你好"}'
```

### ✅ 统一的接口设计

所有接口都是 `POST + JSON`，使用方式完全一致：

```bash
# 创建会话
curl -X POST /api/session -d '{"workspaceRoot":"/tmp"}'

# 获取会话
curl -X POST /api/session/get -d '{"sessionId":"xxx"}'

# 删除会话
curl -X POST /api/session/delete -d '{"sessionId":"xxx"}'

# 聊天
curl -X POST /api/chat/stream -d '{"message":"hello"}'

# 读文件
curl -X POST /api/files/read -d '{"sessionId":"xxx","path":"README.md"}'
```

## 常用命令

### 健康检查

```bash
curl http://localhost:3000/health
```

### 快速聊天

```bash
# 创建测试脚本
cat > chat.sh << 'EOF'
#!/bin/bash
curl -N --no-buffer -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$1\"}"
EOF

chmod +x chat.sh

# 使用
./chat.sh "你好，请介绍你自己"
./chat.sh "什么是人工智能？"
```

### 复用 Session（保持上下文）

```bash
# 第一次聊天，保存 sessionId
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"你好，我叫张三"}' 2>&1 | tee /tmp/chat.log

# 提取 sessionId
SESSION_ID=$(grep -o '"sessionId":"[^"]*"' /tmp/chat.log | head -1 | cut -d'"' -f4)
echo "Session ID: $SESSION_ID"

# 第二次聊天（AI 会记住你叫张三）
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"我叫什么名字？\"}"
```

## 完整示例

### Shell 脚本

参见 [`test-quick-chat.sh`](test-quick-chat.sh)：

```bash
./test-quick-chat.sh
```

### TypeScript

参见 [`examples/client.ts`](examples/client.ts)：

```bash
cd examples
tsx client.ts
```

## 环境配置

### 方式1: 环境变量（推荐开发）

```bash
export OPENAI_API_KEY="sk-xxx"
export OPENAI_MODEL="qwen3-coder-plus-2025-09-23"
export AUTH_TYPE="openai"

npm run dev
```

### 方式2: .env 文件（推荐生产）

```bash
cat > .env << 'EOF'
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=qwen3-coder-plus-2025-09-23
AUTH_TYPE=openai
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
EOF

npm run dev
```

## 故障排除

### 问题：401 Unauthorized

**原因**: API key 无效或未设置

**解决**:

```bash
# 检查环境变量
echo $OPENAI_API_KEY

# 重新设置
export OPENAI_API_KEY="sk-your-valid-key"

# 重启服务
npm run dev
```

### 问题：流立即结束

**原因**: curl 未使用 `-N --no-buffer` 参数

**解决**:

```bash
# 正确方式
curl -N --no-buffer -X POST ...

# 或使用测试脚本
./test-quick-chat.sh
```

### 问题：中文乱码

**原因**: 终端编码问题

**解决**:

```bash
# 确保终端使用 UTF-8
export LANG=zh_CN.UTF-8
```

## 进阶使用

### 文件操作

```bash
# 读取文件
curl -X POST http://localhost:3000/api/files/read \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","path":"README.md"}'

# 写入文件
curl -X POST http://localhost:3000/api/files/write \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","path":"test.txt","content":"Hello"}'

# 搜索文件
curl -X POST http://localhost:3000/api/files/search \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","pattern":"TODO"}'
```

### 会话管理

```bash
# 列出所有会话
curl -X POST http://localhost:3000/api/sessions/list \
  -H "Content-Type: application/json" \
  -d '{}'

# 获取会话详情
curl -X POST http://localhost:3000/api/session/get \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx"}'

# 删除会话
curl -X POST http://localhost:3000/api/session/delete \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx"}'
```

## 参考资料

- 📚 [API 完整文档](doc/API.md)
- 🔧 [配置指南](doc/CONFIG_GUIDE.md)
- 📊 [功能迁移进度](doc/FEATURE_MIGRATION.md)
- 🔄 [API v2 变更日志](CHANGELOG_API_V2.md)
- 💡 [优化总结](OPTIMIZATION_SUMMARY.md)

---

**开始使用吧！** 🚀
