# Qwen Code HTTP服务 - 配置指南

## 环境变量配置详解

### 1️⃣ .env文件位置

**答案**: `.env`文件应该放在 **`packages/server/`** 目录下

```bash
packages/server/
├── .env                    # ← 环境变量配置文件放这里
├── .env.template           # 模板文件
├── src/
├── package.json
└── ...
```

**原因**:

- `src/index.ts`第18行调用`dotenvConfig()`
- 默认从当前工作目录（运行`npm run dev`的目录）读取`.env`
- 即`packages/server/.env`

---

### 2️⃣ 支持直接环境变量吗？

**答案**: ✅ **完全支持！**

您可以通过以下**三种方式**配置：

#### 方式1: .env文件（推荐开发环境）

```bash
# packages/server/.env
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=debug
```

**优点**:

- ✅ 方便修改
- ✅ 不会提交到Git（.gitignore已配置）
- ✅ 适合本地开发

#### 方式2: 直接环境变量（推荐生产环境）

```bash
# 命令行直接设置
PORT=4000 npm start

# 或在shell配置文件中
export PORT=3000
export LOG_LEVEL=info
npm start
```

**优点**:

- ✅ 更安全（不存储在文件中）
- ✅ 适合CI/CD环境
- ✅ 适合容器化部署

#### 方式3: Docker环境变量（推荐容器部署）

```yaml
# docker-compose.yml
services:
  qwen-server:
    environment:
      - PORT=3000
      - LOG_LEVEL=info
```

**优点**:

- ✅ 统一管理
- ✅ 易于部署
- ✅ 与Docker生态集成

---

### 3️⃣ 修改配置后需要重启吗？

**答案**: ✅ **是的，需要重启服务**

**原因**:

```typescript
// src/index.ts 第17-18行
// 加载环境变量
dotenvConfig(); // 只在启动时执行一次

async function start() {
  // 读取环境变量
  const port = parseInt(process.env['PORT'] || '3000', 10);
  const host = process.env['HOST'] || '0.0.0.0';
  // ...
}
```

环境变量在服务启动时读取，后续不会自动重新加载。

---

## 配置优先级

当同时存在多种配置时，优先级如下（从高到低）：

```
1. 命令行环境变量
   ↓
2. .env文件
   ↓
3. 代码默认值
```

**示例**:

```bash
# 即使.env中配置PORT=3000
# 以下命令会使用4000端口
PORT=4000 npm start
```

---

## 完整配置示例

### .env文件示例

```bash
# packages/server/.env

# ========================================
# 服务器配置
# ========================================
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# ========================================
# 安全配置
# ========================================
# 当前为单用户模式，无需JWT认证

# ========================================
# CORS配置
# ========================================
# 允许的源（逗号分隔）
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# ========================================
# 日志配置
# ========================================
# 日志级别: trace, debug, info, warn, error, fatal
LOG_LEVEL=info

# ========================================
# 会话配置
# ========================================
# 会话超时时间（毫秒）
SESSION_TIMEOUT=1800000

# ========================================
# AI模型配置（可选，根据需要配置）
# ========================================
# Qwen API配置
# QWEN_API_KEY=your-api-key-here
# QWEN_MODEL=qwen-code
# AUTH_TYPE=api_key

# 或OpenAI兼容配置
# OPENAI_API_KEY=sk-xxx
# OPENAI_BASE_URL=https://api.openai.com/v1
# OPENAI_MODEL=gpt-4

# ========================================
# Redis配置（生产环境）
# ========================================
# REDIS_URL=redis://localhost:6379
# REDIS_PASSWORD=your-redis-password
```

---

## 快速配置流程

### Step 1: 创建.env文件

```bash
cd packages/server
cp .env.template .env
```

### Step 2: 编辑配置

```bash
# 使用你喜欢的编辑器
nano .env
# 或
vim .env
# 或
code .env
```

### Step 3: 重启服务

```bash
# 如果服务正在运行，先停止
# Ctrl+C 或 kill进程

# 重新启动
npm run dev
```

### Step 4: 验证配置

```bash
# 检查服务是否使用新配置
curl http://localhost:3000/health
```

---

## 运行时修改配置

### 不需要重启的配置

目前**所有配置都需要重启**，因为它们在启动时读取。

### 如果需要热重载

可以考虑以下方案（未实现）：

```typescript
// 使用文件监听实现配置热重载
import { watch } from 'fs';

watch('.env', (eventType, filename) => {
  if (eventType === 'change') {
    // 重新加载配置
    dotenvConfig({ override: true });
    // 更新服务配置
  }
});
```

**建议**: 生产环境使用配置管理系统（如Kubernetes ConfigMap），而不是热重载。

---

## 不同环境的配置策略

### 开发环境

**使用**: `.env`文件

```bash
# packages/server/.env
NODE_ENV=development
LOG_LEVEL=debug
```

**操作**:

```bash
npm run dev  # 自动读取.env
```

---

### 生产环境

**使用**: 环境变量 + 密钥管理

```bash
# 不使用.env文件
# 通过系统环境变量或密钥管理系统注入

export REDIS_URL=redis://prod-redis:6379
export NODE_ENV=production
npm start
```

---

### Docker环境

**使用**: docker-compose.yml

```yaml
# docker-compose.yml
services:
  qwen-server:
    environment:
      - PORT=3000
      - LOG_LEVEL=info
    env_file:
      - .env # 或从.env文件读取
```

**操作**:

```bash
# 使用docker-compose启动
docker-compose up
```

---

## 常见问题

### Q1: .env文件不生效？

**检查清单**:

- [ ] 文件位置正确吗？（`packages/server/.env`）
- [ ] 文件名正确吗？（`.env`不是`env`或`.env.txt`）
- [ ] 重启服务了吗？
- [ ] 格式正确吗？（`KEY=value`，等号两边无空格）

**调试**:

```bash
# 查看当前.env文件
cat packages/server/.env

# 查看环境变量是否生效
node -e "require('dotenv').config(); console.log(process.env.PORT)"
```

---

### Q2: 多个.env文件？

**支持环境特定配置**:

```bash
packages/server/
├── .env                    # 默认配置
├── .env.development        # 开发环境（需要代码支持）
├── .env.production         # 生产环境（需要代码支持）
└── .env.template           # 模板
```

**当前实现**: 只支持`.env`

**扩展方法**:

```typescript
// src/index.ts
import { config as dotenvConfig } from 'dotenv';

// 根据NODE_ENV加载不同配置
const envFile =
  process.env.NODE_ENV === 'production'
    ? '.env.production'
    : '.env.development';

dotenvConfig({ path: envFile });
```

---

### Q3: 如何安全管理密钥？

**开发环境**:

```bash
# .env (已在.gitignore中)
# 当前为单用户模式，无需密钥配置
PORT=3000
LOG_LEVEL=debug
```

**生产环境**:

```bash
# 使用环境变量或配置管理系统
# AWS Secrets Manager
# Azure Key Vault
# HashiCorp Vault
# Kubernetes ConfigMap

# 环境变量注入
export NODE_ENV=production
export LOG_LEVEL=warn
npm start
```

**Docker环境**:

```yaml
# docker-compose.yml
services:
  qwen-server:
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
```

---

## 配置清单

### 必需配置 ⚠️

当前为单用户模式，无需必需配置。

### 可选配置

| 配置项      | 说明     | 默认值    | 推荐         |
| ----------- | -------- | --------- | ------------ |
| PORT        | 服务端口 | `3000`    | 3000         |
| HOST        | 监听地址 | `0.0.0.0` | 0.0.0.0      |
| NODE_ENV    | 运行环境 | -         | `production` |
| LOG_LEVEL   | 日志级别 | `info`    | `info`       |
| CORS_ORIGIN | 允许的源 | `*`       | 具体域名     |

---

## 快速开始

### 最小配置（开发测试）

```bash
# 1. 创建.env（可选，使用默认配置也可以）
cd packages/server
echo "PORT=3000" > .env

# 2. 启动服务
npm run dev

# 3. 开始测试
curl http://localhost:3000/health
```

### 生产环境配置

```bash
# 1. 设置环境
export NODE_ENV=production
export LOG_LEVEL=warn
export CORS_ORIGIN=https://yourdomain.com

# 2. 启动（使用PM2等进程管理器）
npm start
```

---

## 配置验证

验证配置是否生效：

```bash
# 启动服务后，检查日志中的配置
npm run dev

# 日志会显示:
# 🚀 Qwen Code Server listening on http://0.0.0.0:3000
# 如果端口不是3000，说明PORT配置生效了
```

---

## 总结

### 回答您的问题

**Q: .env文件需要放在哪个目录？**  
**A**: `packages/server/.env`

**Q: 支持直接环境变量吗？**  
**A**: ✅ 完全支持！可以不用.env文件，直接设置系统环境变量

**Q: 配置了后需要重启服务吗？**  
**A**: ✅ 是的，需要重启。配置在启动时加载，不支持热重载

### 推荐做法

**开发环境**:

```bash
cd packages/server
cp .env.template .env
# 编辑.env文件
npm run dev
```

**生产环境**:

```bash
# 通过环境变量注入，不使用.env文件
export NODE_ENV=production
export LOG_LEVEL=warn
npm start
```

**Docker环境**:

```bash
# 使用docker-compose.yml中的environment
docker-compose up
```

---

**最后提醒**:

- 🔒 永远不要把.env文件提交到Git（已在.gitignore）
- 🔄 修改配置后记得重启服务
- ⚠️ 当前为单用户模式，生产环境建议添加认证机制
