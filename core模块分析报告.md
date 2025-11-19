# Core模块分析报告

## 1. History过期时间配置分析

### 1.1 当前实现情况

#### 服务器端会话超时（packages/server）

在 `packages/server/src/services/SessionService.ts` 中，存在会话超时机制：

```26:27:packages/server/src/services/SessionService.ts
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30分钟
```

- **超时时间**：30分钟（硬编码）
- **清理机制**：每分钟检查一次过期会话
- **清理逻辑**：在 `cleanupExpiredSessions()` 方法中实现

```340:361:packages/server/src/services/SessionService.ts
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
        expiredSessions.push(id);
      }
    }

    for (const sessionId of expiredSessions) {
      this.deleteSession(sessionId);
    }

    if (expiredSessions.length > 0) {
      this.emit('sessions_expired', {
        count: expiredSessions.length,
        sessionIds: expiredSessions,
        timestamp: new Date(),
      });
    }
  }
```

#### Core模块中的Chat History文件

在 `packages/core/src/services/chatRecordingService.ts` 中，chat history文件存储在：

- **存储路径**：`~/.qwen/tmp/<project_hash>/chats/`
- **文件格式**：`session-<timestamp>-<sessionId>.json`

**问题**：目前**没有发现**chat history文件的自动过期清理机制。这些文件只是被创建和更新，但没有自动删除的逻辑。

### 1.2 如何调整History过期时间

#### 方案1：修改服务器端会话超时时间（推荐用于HTTP服务）

如果需要调整服务器端的会话超时时间，可以：

1. **直接修改代码**：修改 `packages/server/src/services/SessionService.ts` 中的 `SESSION_TIMEOUT` 常量
2. **通过配置参数化**：将 `SESSION_TIMEOUT` 改为可配置项，从环境变量或配置文件中读取

示例修改：

```typescript
// 从环境变量读取，默认30分钟
private readonly SESSION_TIMEOUT = parseInt(
  process.env.SESSION_TIMEOUT_MS || '1800000'
);
```

#### 方案2：为Core模块添加Chat History清理机制

如果需要清理core模块中的chat history文件，需要添加清理逻辑：

1. **在 `ChatRecordingService` 中添加清理方法**
2. **定期扫描并删除过期的session文件**
3. **可以通过配置项设置过期时间**

建议实现位置：`packages/core/src/services/chatRecordingService.ts`

## 2. 默认中文回答配置分析

### 2.1 Prompt生成逻辑

系统提示（System Prompt）的生成在 `packages/core/src/core/prompts.ts` 中的 `getCoreSystemPrompt` 函数：

```108:339:packages/core/src/core/prompts.ts
export function getCoreSystemPrompt(
  userMemory?: string,
  model?: string,
): string {
  // if QWEN_SYSTEM_MD is set (and not 0|false), override system prompt from file
  // default path is .qwen/system.md but can be modified via custom path in QWEN_SYSTEM_MD
  let systemMdEnabled = false;
  // The default path for the system prompt file. This can be overridden.
  let systemMdPath = path.resolve(path.join(QWEN_CONFIG_DIR, 'system.md'));
  // Resolve the environment variable to get either a path or a switch value.
  const systemMdResolution = resolvePathFromEnv(process.env['QWEN_SYSTEM_MD']);

  // Proceed only if the environment variable is set and is not disabled.
  if (systemMdResolution.value && !systemMdResolution.isDisabled) {
    systemMdEnabled = true;

    // We update systemMdPath to this new custom path.
    if (!systemMdResolution.isSwitch) {
      systemMdPath = systemMdResolution.value;
    }

    // require file to exist when override is enabled
    if (!fs.existsSync(systemMdPath)) {
      throw new Error(`missing system prompt file '${systemMdPath}'`);
    }
  }

  const basePrompt = systemMdEnabled
    ? fs.readFileSync(systemMdPath, 'utf8')
    : `
You are Qwen Code, an interactive CLI agent developed by Alibaba Group, specializing in software engineering tasks. Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions and utilizing your available tools.
...
```

### 2.2 当前系统提示内容

查看默认的系统提示，**没有包含语言要求**。系统提示主要关注：

- 代码规范和约定
- 任务管理
- 工具使用
- 安全性规则

### 2.3 实现默认中文回答的方案

#### 方案1：通过自定义System Prompt文件（推荐）

可以通过以下方式配置默认中文回答：

1. **创建自定义系统提示文件**：`.qwen/system.md`
2. **在文件中添加语言要求**：包含 "Always respond in 中文" 或类似指令
3. **启用自定义提示**：设置环境变量 `QWEN_SYSTEM_MD=true` 或 `QWEN_SYSTEM_MD=1`

**步骤**：

```bash
# 1. 创建系统提示文件
mkdir -p .qwen
cat > .qwen/system.md << 'EOF'
You are Qwen Code, an interactive CLI agent developed by Alibaba Group, specializing in software engineering tasks.

**Language Requirement**: Always respond in 中文 (Chinese). All your responses, explanations, and communications must be in Chinese unless the user explicitly requests otherwise.

Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions and utilizing your available tools.

# Core Mandates
...
EOF

# 2. 启用自定义提示
export QWEN_SYSTEM_MD=true
```

#### 方案2：修改默认系统提示（需要修改代码）

直接修改 `packages/core/src/core/prompts.ts` 中的默认系统提示，在开头添加语言要求：

```typescript
const basePrompt = systemMdEnabled
  ? fs.readFileSync(systemMdPath, 'utf8')
  : `
**Language Requirement**: Always respond in 中文 (Chinese). All your responses, explanations, and communications must be in Chinese unless the user explicitly requests otherwise.

You are Qwen Code, an interactive CLI agent developed by Alibaba Group, specializing in software engineering tasks. Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions and utilizing your available tools.
...
```

#### 方案3：通过User Memory配置

User Memory会被追加到系统提示的末尾：

```333:338:packages/core/src/core/prompts.ts
  const memorySuffix =
    userMemory && userMemory.trim().length > 0
      ? `\n\n---\n\n${userMemory.trim()}`
      : '';

  return `${basePrompt}${memorySuffix}`;
```

可以在User Memory中添加语言要求，但这种方式不如在系统提示开头添加有效。

### 2.4 验证配置是否生效

配置后，可以通过以下方式验证：

1. **检查系统提示内容**：在代码中打印 `getCoreSystemPrompt()` 的返回值
2. **测试响应**：向qwen-code提问，观察是否默认使用中文回答

### 2.5 推荐方案

**推荐使用方案1（自定义System Prompt文件）**，原因：

- ✅ 不需要修改代码
- ✅ 可以灵活调整
- ✅ 不影响其他用户
- ✅ 符合现有的配置机制

## 总结

1. **History过期时间**：
   - 服务器端有30分钟的超时机制（可修改）
   - Core模块的chat history文件目前没有自动清理机制（需要添加）

2. **默认中文回答**：
   - ✅ **可以通过配置实现**
   - ✅ **推荐方式**：创建 `.qwen/system.md` 文件并设置 `QWEN_SYSTEM_MD=true`
   - ✅ 在系统提示中添加 "Always respond in 中文" 指令即可实现默认中文回答
