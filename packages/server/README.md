# Qwen Code HTTP Server

HTTP服务接口，提供Qwen Code的REST API和SSE流式聊天功能。

## 特性

- 🚀 基于Fastify的高性能HTTP服务器
- 💬 SSE（Server-Sent Events）流式聊天
- 📦 直接复用@qwen-code/core的核心功能
- 🎯 轻量级设计，无冗余适配层
- 🔒 单用户模式（适合本地开发和个人使用）

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量（可选）

复制`.env.example`到`.env`并修改配置：

```bash
cp .env.example .env
```

详细配置说明请参考 [配置指南](doc/CONFIG_GUIDE.md)。

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

### 生产运行

```bash
npm start
```

## API文档

完整的API文档请参考 [API.md](doc/API.md)。

### 快速示例

#### 创建会话

```bash
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"workspaceRoot":"/tmp/test","model":"qwen-code"}'
```

#### SSE流式聊天

```bash
curl -N "http://localhost:3000/api/chat/stream?sessionId=xxx&message=hello"
```

#### 读取文件

```bash
curl -X POST http://localhost:3000/api/files/read \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","path":"/tmp/test.txt"}'
```

更多示例请查看 [API.md](doc/API.md)。

## 架构设计

### 核心原则

- **直接复用Core层**: 使用`GeminiClient`、`Config`等核心组件
- **轻量级适配**: 只在必要时进行适配（如会话管理）
- **无冗余代码**: 避免重复实现已有功能

### 目录结构

```
packages/server/
├── doc/                    # 文档目录
│   ├── API.md             # API文档
│   ├── CONFIG_GUIDE.md    # 配置指南
│   └── FEATURE_MIGRATION.md # 功能迁移进度
├── scripts/               # 脚本目录
│   └── test-complete.sh   # 完整测试脚本
├── src/
│   ├── index.ts           # 服务器入口
│   ├── types/             # 类型定义
│   ├── services/          # 业务服务
│   │   └── SessionService.ts
│   ├── routes/            # 路由
│   │   ├── index.ts
│   │   ├── health.ts
│   │   ├── session.ts
│   │   ├── chat.ts
│   │   └── files.ts
│   ├── middleware/        # 中间件
│   │   ├── errorHandler.ts
│   │   └── logging.ts
│   └── utils/             # 工具函数
│       └── pathSecurity.ts
├── package.json
├── tsconfig.json
└── README.md
```

## 开发指南

### 添加新路由

1. 在`src/routes/`创建新路由文件
2. 在`src/routes/index.ts`中注册
3. 使用SessionService管理会话

### 调试

开发模式启用了pretty日志输出：

```bash
npm run dev
```

### 测试

运行完整测试套件：

```bash
./scripts/test-complete.sh
```

或运行单元测试：

```bash
npm test
```

## 测试

### 自动化测试

使用提供的测试脚本进行完整测试：

```bash
cd packages/server
chmod +x scripts/test-complete.sh
./scripts/test-complete.sh
```

测试脚本会：

1. 停止旧服务
2. 启动新服务
3. 测试所有API端点
4. 包含完整的SSE聊天测试
5. 生成测试报告

### 手动测试

参考 [API.md](doc/API.md) 中的示例进行手动测试。

## 部署

### Docker

```bash
docker build -t qwen-code-server .
docker run -p 3000:3000 qwen-code-server
```

### Docker Compose

```bash
docker-compose up -d
```

## 功能迁移进度

当前功能迁移进度请参考 [FEATURE_MIGRATION.md](doc/FEATURE_MIGRATION.md)。

**当前完成度**: 约 30%

- ✅ 基础架构搭建
- ✅ 会话管理
- ✅ SSE流式聊天
- ✅ 文件操作
- ❌ 命令处理（Slash/At/Shell命令）
- ⚠️ 工具调用（部分完成）
- ❌ 安全加固（部分完成）
- ❌ 性能优化
- ⚠️ 监控部署（部分完成）

## 安全说明

### 当前模式

当前实现为**单用户模式**：

- 所有会话属于固定用户 `local-user`
- 无需认证即可访问所有API
- 适合本地开发和个人使用

**注意**: 生产环境建议添加认证机制。

### 路径安全

所有文件操作API都会验证路径，防止路径遍历攻击：

- 路径必须相对于工作区根目录
- 不允许访问工作区外的文件
- 自动规范化路径

## 文档

- [API文档](doc/API.md) - 完整的API参考
- [配置指南](doc/CONFIG_GUIDE.md) - 环境变量配置说明
- [功能迁移进度](doc/FEATURE_MIGRATION.md) - CLI功能迁移状态

## 许可证

Apache-2.0
