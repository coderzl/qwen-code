# Qwen Code 多用户无状态架构改造方案

**版本**: v1.0  
**日期**: 2025-01-19  
**状态**: 可落地实施

---

## 📋 目录

1. [概述](#1-概述)
2. [架构设计](#2-架构设计)
3. [会话隔离机制](#3-会话隔离机制)
4. [数据存储方案](#4-数据存储方案)
5. [通用沙箱工具设计](#5-通用沙箱工具设计)
6. [远程沙箱架构](#6-远程沙箱架构)
7. [实施计划](#7-实施计划)
8. [技术规范](#8-技术规范)

---

## 1. 概述

### 1.1 改造目标

将 Qwen Code 从单用户本地执行模式改造为**多用户无状态应用**，支持：

- ✅ **单进程支持多用户并发**：一个应用实例可同时处理多个用户的不同会话
- ✅ **完全无状态**：应用进程不保存任何会话状态，所有状态存储在外部存储
- ✅ **数据隔离**：会话数据逻辑隔离 + 用户代码物理隔离（沙箱）
- ✅ **水平扩展**：支持任意数量的应用实例，通过负载均衡分发请求
- ✅ **统一工具执行**：通过通用 `SandboxToolInvocation` 简化沙箱工具实现

### 1.2 核心变更对照表

| 组件             | 当前实现               | 改造后                       |
| ---------------- | ---------------------- | ---------------------------- |
| **内部流程工具** | 文件系统（`~/.qwen/`） | Redis + PostgreSQL           |
| **代码操作工具** | 本地直接执行           | 远程沙箱 gRPC 调用           |
| **会话状态**     | 内存变量               | Redis 缓存 + DB 持久化       |
| **工具调用**     | 每个工具独立实现       | 通用 `SandboxToolInvocation` |
| **沙箱管理**     | Docker 本地容器        | 沙箱池 + 预热机制            |

---

## 2. 架构设计

### 2.1 整体架构图

```
┌────────────────────────────────────────────────────────────────┐
│                   用户层 (Multi-User)                           │
├───────┬───────┬───────┬───────┬───────┬───────┬────────────────┤
│User A │User B │User C │User D │User E │User F │  ...           │
└───┬───┴───┬───┴───┬───┴───┬───┴───┬───┴───┬───┴────────────────┘
    │       │       │       │       │       │
    └───────┴───────┴───────┴───────┴───────┘
                    │
    ┌───────────────▼────────────────────────────────┐
    │      API Gateway / Load Balancer               │
    │  • Session 路由                                 │
    │  • JWT 验证                                     │
    │  • Rate Limiting                               │
    └───────────────┬────────────────────────────────┘
                    │
    ┌───────────────▼────────────────────────────────┐
    │   Qwen Code Application (Stateless Cluster)    │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
    │  │Instance 1│  │Instance 2│  │Instance N│     │
    │  └──────────┘  └──────────┘  └──────────┘     │
    └───┬───────────────┬───────────────┬────────────┘
        │               │               │
  ┌─────▼─────┐  ┌──────▼──────┐  ┌────▼────────────┐
  │PostgreSQL │  │    Redis    │  │  Sandbox Pool   │
  │           │  │             │  │                 │
  │• Sessions │  │• Todos      │  │ ┌─────────────┐ │
  │• Users    │  │• Memory     │  │ │ Sandbox A   │ │
  │• History  │  │• Context    │  │ │ (Session 1) │ │
  │• Audit    │  │• Cache      │  │ └─────────────┘ │
  │           │  │             │  │ ┌─────────────┐ │
  │  S3/MinIO │  │             │  │ │ Sandbox B   │ │
  │• Archives │  │             │  │ │ (Session 2) │ │
  └───────────┘  └─────────────┘  │ └─────────────┘ │
                                  │ ┌─────────────┐ │
                                  │ │Pre-warmed   │ │
                                  │ │Pool (idle)  │ │
                                  │ └─────────────┘ │
                                  └─────────────────┘
```

### 2.2 请求处理流程

```
用户请求 → API Gateway
  ├─ 提取 Session ID (Header/Cookie)
  ├─ 验证 JWT Token
  ├─ Rate Limiting 检查
  │
  ▼
路由到应用实例
  ├─ Session Manager 加载会话上下文 (Redis)
  ├─ 验证会话有效性
  ├─ 检查用户配额
  │
  ▼
LLM Orchestrator 处理对话
  ├─ 加载对话历史 (PostgreSQL + Redis)
  ├─ 调用 LLM API
  ├─ 解析工具调用
  │
  ▼
Tool Dispatcher 执行工具
  ├─ 内部流程工具 → 本地执行 (操作 Redis/DB)
  └─ 代码操作工具 → 沙箱执行 (gRPC 调用)
     ├─ Sandbox Manager 获取/创建沙箱
     ├─ gRPC 发送请求
     ├─ 流式接收结果
     └─ 缓存结果 (可选)
  │
  ▼
返回响应
  ├─ 更新会话状态 (Redis)
  ├─ 异步持久化历史 (PostgreSQL)
  └─ 返回给用户
```

---

## 3. 会话隔离机制

### 3.1 数据库 Schema

```sql
-- ============================================
-- 用户表
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  password_hash VARCHAR(255),

  -- 配额管理
  max_sessions INT DEFAULT 5,
  max_sandboxes INT DEFAULT 3,
  storage_limit BIGINT DEFAULT 10737418240,
  api_rate_limit INT DEFAULT 1000,

  -- 偏好设置
  preferences JSONB DEFAULT '{
    "defaultModel": "qwen-coder-plus",
    "defaultTemperature": 0.7
  }'::jsonb,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================
-- 会话表
-- ============================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 状态
  status VARCHAR(20) DEFAULT 'active',
  approval_mode VARCHAR(20) DEFAULT 'default',

  -- 沙箱关联
  sandbox_id VARCHAR(255),
  sandbox_status VARCHAR(20) DEFAULT 'pending',

  -- 工作环境
  workspace_dir TEXT DEFAULT '/workspace',
  environment_vars JSONB DEFAULT '{}'::jsonb,

  -- 元数据
  metadata JSONB DEFAULT '{}'::jsonb,

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),

  INDEX idx_sessions_user_id (user_id),
  INDEX idx_sessions_status (status),
  INDEX idx_sessions_sandbox_id (sandbox_id)
);

-- ============================================
-- 对话历史表（按月分区）
-- ============================================
CREATE TABLE chat_history (
  id BIGSERIAL,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content JSONB NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE chat_history_2025_01 PARTITION OF chat_history
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- ============================================
-- 工具执行记录表
-- ============================================
CREATE TABLE tool_executions (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  tool_name VARCHAR(100) NOT NULL,
  call_id VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL,
  params JSONB NOT NULL,
  result JSONB,
  duration_ms INT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- ============================================
-- 沙箱表
-- ============================================
CREATE TABLE sandboxes (
  id VARCHAR(255) PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'pending',
  cpu_limit DECIMAL(3,2) DEFAULT 1.0,
  memory_limit BIGINT DEFAULT 2147483648,
  disk_limit BIGINT DEFAULT 10737418240,
  ip_address INET,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 Redis 数据结构

```typescript
const RedisKeys = {
  // Session 上下文
  SESSION_CONTEXT: (sid: string) => `session:context:${sid}`,

  // Todo 列表
  SESSION_TODOS: (sid: string) => `session:todos:${sid}`,

  // 记忆片段
  SESSION_MEMORY: (sid: string) => `session:memory:${sid}`,

  // 文件缓存
  SESSION_FILE: (sid: string, hash: string) => `session:file:${sid}:${hash}`,

  // 沙箱状态
  SANDBOX_STATUS: (sandboxId: string) => `sandbox:status:${sandboxId}`,
};

// 使用示例
class RedisService {
  async saveTodos(sessionId: string, todos: TodoItem[]): Promise<void> {
    const key = RedisKeys.SESSION_TODOS(sessionId);
    const pipeline = this.redis.pipeline();

    pipeline.del(key);
    todos.forEach((todo) => {
      pipeline.hset(key, todo.id, JSON.stringify(todo));
    });
    pipeline.expire(key, 86400); // 24 小时

    await pipeline.exec();
  }
}
```

---

## 4. 数据存储方案

### 4.1 TodoWriteTool 改造

```typescript
/**
 * Todo 数据仓库
 */
class TodoRepository {
  constructor(
    private redis: Redis,
    private db: Pool,
  ) {}

  async getTodos(sessionId: string): Promise<TodoItem[]> {
    // 优先从 Redis 读取
    const key = `session:todos:${sessionId}`;
    const todos = await this.redis.hgetall(key);

    if (Object.keys(todos).length > 0) {
      return Object.values(todos).map((json) => JSON.parse(json));
    }

    // Redis miss，查数据库
    const result = await this.db.query(
      'SELECT todos FROM session_todos WHERE session_id = $1',
      [sessionId],
    );

    return result.rows[0]?.todos || [];
  }

  async saveTodos(sessionId: string, todos: TodoItem[]): Promise<void> {
    // 写入 Redis
    const key = `session:todos:${sessionId}`;
    const pipeline = this.redis.pipeline();
    pipeline.del(key);
    todos.forEach((todo) => pipeline.hset(key, todo.id, JSON.stringify(todo)));
    pipeline.expire(key, 86400);
    await pipeline.exec();

    // 异步持久化到 PostgreSQL
    this.db
      .query(
        `
      INSERT INTO session_todos (session_id, todos, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (session_id) DO UPDATE SET
        todos = EXCLUDED.todos, updated_at = NOW()
    `,
        [sessionId, JSON.stringify(todos)],
      )
      .catch(console.error);
  }
}

/**
 * TodoWriteToolInvocation 改造
 */
class TodoWriteToolInvocation extends BaseToolInvocation<
  TodoWriteParams,
  ToolResult
> {
  constructor(
    private sessionId: string,
    private todoRepo: TodoRepository,
    params: TodoWriteParams,
  ) {
    super(params);
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    await this.todoRepo.saveTodos(this.sessionId, this.params.todos);

    return {
      llmContent: `Todos updated successfully.`,
      returnDisplay: { type: 'todo_list', todos: this.params.todos },
    };
  }
}
```

### 4.2 MemoryTool 改造

```typescript
class MemoryRepository {
  constructor(
    private redis: Redis,
    private db: Pool,
  ) {}

  async addMemory(
    userId: string,
    sessionId: string,
    fact: string,
    scope: 'global' | 'project',
  ): Promise<void> {
    // 持久化到数据库
    const result = await this.db.query(
      `
      INSERT INTO memories (user_id, session_id, fact, scope)
      VALUES ($1, $2, $3, $4) RETURNING id
    `,
      [userId, sessionId, fact, scope],
    );

    // 更新 Redis 缓存
    const key =
      scope === 'global'
        ? `user:memory:${userId}`
        : `session:memory:${sessionId}`;

    await this.redis.zadd(
      key,
      Date.now(),
      JSON.stringify({
        id: result.rows[0].id,
        fact,
        timestamp: new Date(),
      }),
    );

    await this.redis.zremrangebyrank(key, 0, -101); // 保留最近 100 条
  }
}
```

---

## 5. 通用沙箱工具设计

### 5.1 核心接口

```typescript
/**
 * 沙箱操作类型
 */
enum SandboxOperationType {
  EXECUTE_COMMAND = 'execute_command',
  READ_FILE = 'read_file',
  WRITE_FILE = 'write_file',
  EDIT_FILE = 'edit_file',
  LIST_DIRECTORY = 'list_directory',
  SEARCH_FILES = 'search_files',
}

/**
 * 沙箱操作策略接口
 */
interface ISandboxOperationStrategy<TParams = any> {
  readonly operationType: SandboxOperationType;
  validateParams(params: TParams): string | null;
  buildRequest(params: TParams): SandboxOperationRequest;
  processResponse(
    response: SandboxOperationResponse,
    params: TParams,
  ): ToolResult;
  supportsStreaming(): boolean;
  getCacheKey?(params: TParams, sessionId: string): string | null;
  getCacheTTL?(): number;
}

/**
 * 沙箱执行上下文
 */
interface SandboxExecutionContext {
  sessionId: string;
  userId: string;
  sandboxManager: ISandboxManager;
  cache: ICacheService;
  config: Config;
}
```

### 5.2 通用 SandboxToolInvocation

```typescript
class SandboxToolInvocation<TParams extends object> extends BaseToolInvocation<
  TParams,
  ToolResult
> {
  constructor(
    params: TParams,
    private context: SandboxExecutionContext,
    private strategy: ISandboxOperationStrategy<TParams>,
  ) {
    super(params);
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: ToolResultDisplay) => void,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 1. 参数验证
      const error = this.strategy.validateParams(this.params);
      if (error) {
        return this.createErrorResult(error, ToolErrorType.INVALID_TOOL_PARAMS);
      }

      // 2. 检查缓存
      if (this.strategy.getCacheKey) {
        const cacheKey = this.strategy.getCacheKey(
          this.params,
          this.context.sessionId,
        );
        if (cacheKey) {
          const cached = await this.context.cache.get(cacheKey);
          if (cached) return JSON.parse(cached);
        }
      }

      // 3. 获取沙箱
      const sandbox = await this.context.sandboxManager.getSandbox(
        this.context.sessionId,
      );

      // 4. 构建请求
      const request = this.strategy.buildRequest(this.params);

      // 5. 执行操作
      const response =
        this.strategy.supportsStreaming() && updateOutput
          ? await this.executeWithStreaming(
              sandbox,
              request,
              signal,
              updateOutput,
            )
          : await sandbox.execute(request, signal);

      // 6. 处理响应
      const result = this.strategy.processResponse(response, this.params);

      // 7. 缓存结果
      if (this.strategy.getCacheKey && !result.error) {
        const cacheKey = this.strategy.getCacheKey(
          this.params,
          this.context.sessionId,
        );
        if (cacheKey) {
          const ttl = this.strategy.getCacheTTL?.() || 300;
          await this.context.cache.set(cacheKey, JSON.stringify(result), {
            ttl,
          });
        }
      }

      return result;
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : String(error),
        ToolErrorType.EXECUTION_FAILED,
      );
    }
  }

  private async executeWithStreaming(
    sandbox: ISandboxClient,
    request: SandboxOperationRequest,
    signal: AbortSignal,
    updateOutput: (output: ToolResultDisplay) => void,
  ): Promise<SandboxOperationResponse> {
    const stream = sandbox.executeStream(request, signal);
    let finalResponse: SandboxOperationResponse | null = null;

    for await (const chunk of stream) {
      if (signal.aborted) {
        stream.cancel();
        break;
      }
      if (chunk.type === 'output') {
        updateOutput(chunk.data);
      } else if (chunk.type === 'final') {
        finalResponse = chunk.data;
      }
    }

    if (!finalResponse) throw new Error('No final response from sandbox');
    return finalResponse;
  }

  private createErrorResult(message: string, type: ToolErrorType): ToolResult {
    return {
      llmContent: `Error: ${message}`,
      returnDisplay: message,
      error: { message, type },
    };
  }
}
```

### 5.3 策略实现示例

```typescript
/**
 * Shell 命令执行策略
 */
class ShellCommandStrategy
  implements ISandboxOperationStrategy<ShellToolParams>
{
  readonly operationType = SandboxOperationType.EXECUTE_COMMAND;

  validateParams(params: ShellToolParams): string | null {
    if (!params.command?.trim()) return 'Command cannot be empty';
    return null;
  }

  buildRequest(params: ShellToolParams): SandboxOperationRequest {
    return {
      type: SandboxOperationType.EXECUTE_COMMAND,
      params: {
        command: params.command,
        is_background: params.is_background || false,
        working_dir: params.directory || '/workspace',
        timeout: 300000,
      },
    };
  }

  processResponse(response: SandboxOperationResponse): ToolResult {
    if (!response.success) {
      return {
        llmContent: `Command failed: ${response.error?.message}`,
        returnDisplay: response.error?.message || 'Unknown error',
        error: {
          message: response.error?.message || 'Command failed',
          type: ToolErrorType.SHELL_EXECUTION_ERROR,
        },
      };
    }

    const { stdout, exit_code } = response.data;
    if (exit_code !== 0) {
      return {
        llmContent: `Exit code ${exit_code}`,
        returnDisplay: { ansiOutput: stdout },
        error: {
          message: `Exit code ${exit_code}`,
          type: ToolErrorType.SHELL_NON_ZERO_EXIT,
        },
      };
    }

    return {
      llmContent: stdout,
      returnDisplay: { ansiOutput: stdout },
    };
  }

  supportsStreaming(): boolean {
    return true;
  }

  getCacheKey(params: ShellToolParams, sessionId: string): string | null {
    // 只缓存只读命令
    const readOnlyCommands = ['ls', 'cat', 'grep', 'find'];
    const firstCmd = params.command.trim().split(/\s+/)[0];
    if (readOnlyCommands.includes(firstCmd)) {
      const hash = crypto
        .createHash('md5')
        .update(params.command)
        .digest('hex');
      return `session:shell:${sessionId}:${hash}`;
    }
    return null;
  }

  getCacheTTL(): number {
    return 60; // 1 分钟
  }
}

/**
 * 文件读取策略
 */
class ReadFileStrategy
  implements ISandboxOperationStrategy<ReadFileToolParams>
{
  readonly operationType = SandboxOperationType.READ_FILE;

  validateParams(params: ReadFileToolParams): string | null {
    if (!params.absolute_path) return 'File path required';
    if (!path.isAbsolute(params.absolute_path)) return 'Path must be absolute';
    return null;
  }

  buildRequest(params: ReadFileToolParams): SandboxOperationRequest {
    return {
      type: SandboxOperationType.READ_FILE,
      params: {
        path: params.absolute_path,
        offset: params.offset,
        limit: params.limit,
      },
    };
  }

  processResponse(response: SandboxOperationResponse): ToolResult {
    if (!response.success) {
      return {
        llmContent: `Failed to read file: ${response.error?.message}`,
        returnDisplay: response.error?.message || 'Read failed',
        error: {
          message: response.error?.message || 'File read failed',
          type: ToolErrorType.FILE_NOT_FOUND,
        },
      };
    }
    return {
      llmContent: response.data.content,
      returnDisplay: response.data.content,
    };
  }

  supportsStreaming(): boolean {
    return false;
  }

  getCacheKey(params: ReadFileToolParams, sessionId: string): string {
    const hash = crypto
      .createHash('md5')
      .update(`${params.absolute_path}:${params.offset}:${params.limit}`)
      .digest('hex');
    return `session:file:${sessionId}:${hash}`;
  }

  getCacheTTL(): number {
    return 1800; // 30 分钟
  }
}
```

### 5.4 工具定义改造

```typescript
/**
 * Shell Tool 改造
 */
export class ShellTool extends BaseDeclarativeTool<
  ShellToolParams,
  ToolResult
> {
  static readonly Name = ToolNames.SHELL;
  private readonly strategy = new ShellCommandStrategy();

  constructor(private context: SandboxExecutionContext) {
    super(
      ShellTool.Name,
      ToolDisplayNames.SHELL,
      getShellToolDescription(),
      Kind.Execute,
      shellToolSchema,
      false,
      true, // canUpdateOutput
    );
  }

  build(params: ShellToolParams): ToolInvocation<ShellToolParams, ToolResult> {
    return new SandboxToolInvocation(params, this.context, this.strategy);
  }
}

/**
 * Read File Tool 改造
 */
export class ReadFileTool extends BaseDeclarativeTool<
  ReadFileToolParams,
  ToolResult
> {
  static readonly Name = ToolNames.READ_FILE;
  private readonly strategy = new ReadFileStrategy();

  constructor(private context: SandboxExecutionContext) {
    super(
      ReadFileTool.Name,
      ToolDisplayNames.READ_FILE,
      getReadFileToolDescription(),
      Kind.Read,
      readFileToolSchema,
    );
  }

  build(
    params: ReadFileToolParams,
  ): ToolInvocation<ReadFileToolParams, ToolResult> {
    return new SandboxToolInvocation(params, this.context, this.strategy);
  }
}
```

---

## 6. 远程沙箱架构

### 6.1 gRPC 接口定义

```protobuf
// sandbox.proto
syntax = "proto3";

package qwen.sandbox;

service SandboxService {
  rpc ExecuteCommand(CommandRequest) returns (stream CommandResponse);
  rpc ReadFile(FileRequest) returns (FileResponse);
  rpc WriteFile(WriteFileRequest) returns (WriteFileResponse);
  rpc ListDirectory(ListDirRequest) returns (ListDirResponse);
  rpc HealthCheck(Empty) returns (HealthResponse);
}

message CommandRequest {
  string command = 1;
  bool is_background = 2;
  string working_dir = 3;
  map<string, string> env_vars = 4;
}

message CommandResponse {
  oneof data {
    string stdout = 1;
    string stderr = 2;
    int32 exit_code = 3;
  }
}

message FileRequest {
  string path = 1;
  int32 offset = 2;
  int32 limit = 3;
}

message FileResponse {
  bytes content = 1;
  int64 size = 2;
}
```

### 6.2 沙箱管理器

```typescript
/**
 * 沙箱池管理器
 */
class SandboxPoolManager implements ISandboxManager {
  private pool: Map<string, ISandboxClient> = new Map();
  private preWarmedPool: ISandboxClient[] = [];

  private config = {
    minIdle: 5,
    maxIdle: 20,
    maxActive: 100,
  };

  constructor(private docker: Docker) {
    this.startPoolRefiller();
  }

  async getSandbox(sessionId: string): Promise<ISandboxClient> {
    // 检查是否已有沙箱
    if (this.pool.has(sessionId)) {
      return this.pool.get(sessionId)!;
    }

    // 从预热池获取
    let sandbox = this.preWarmedPool.pop();

    if (!sandbox) {
      // 创建新沙箱
      sandbox = await this.createSandbox();
    }

    // 绑定到会话
    await sandbox.bindToSession(sessionId);
    this.pool.set(sessionId, sandbox);

    // 异步补充预热池
    this.refillPool().catch(console.error);

    return sandbox;
  }

  async destroySandbox(sessionId: string): Promise<void> {
    const sandbox = this.pool.get(sessionId);
    if (!sandbox) return;

    await sandbox.destroy();
    this.pool.delete(sessionId);
  }

  private async createSandbox(): Promise<ISandboxClient> {
    const container = await this.docker.createContainer({
      Image: 'qwen-code-sandbox:latest',
      Env: ['NODE_ENV=production'],
      HostConfig: {
        Memory: 2147483648, // 2GB
        CpuQuota: 100000,
        NetworkMode: 'sandbox-net',
        SecurityOpt: ['no-new-privileges:true'],
      },
    });

    await container.start();

    const info = await container.inspect();
    const ipAddress = info.NetworkSettings.IPAddress;

    return new SandboxClient(container.id, `${ipAddress}:50051`);
  }

  private async refillPool(): Promise<void> {
    const needed = this.config.minIdle - this.preWarmedPool.length;
    if (needed <= 0) return;

    const promises = Array(needed)
      .fill(0)
      .map(() => this.createSandbox());
    const sandboxes = await Promise.all(promises);
    this.preWarmedPool.push(...sandboxes);
  }

  private startPoolRefiller(): void {
    setInterval(() => {
      this.refillPool().catch(console.error);
    }, 30000); // 每 30 秒检查一次
  }
}
```

### 6.3 沙箱客户端

```typescript
/**
 * gRPC 沙箱客户端
 */
class SandboxClient implements ISandboxClient {
  private client: SandboxServiceClient;

  constructor(
    private containerId: string,
    private address: string,
  ) {
    this.client = new SandboxServiceClient(
      address,
      grpc.credentials.createInsecure(),
    );
  }

  async execute(
    request: SandboxOperationRequest,
    signal: AbortSignal,
  ): Promise<SandboxOperationResponse> {
    switch (request.type) {
      case SandboxOperationType.EXECUTE_COMMAND:
        return this.executeCommand(request.params, signal);
      case SandboxOperationType.READ_FILE:
        return this.readFile(request.params);
      default:
        throw new Error(`Unsupported operation: ${request.type}`);
    }
  }

  async executeCommand(
    params: any,
    signal: AbortSignal,
  ): Promise<SandboxOperationResponse> {
    return new Promise((resolve, reject) => {
      const call = this.client.executeCommand({
        command: params.command,
        is_background: params.is_background,
        working_dir: params.working_dir,
      });

      let stdout = '';
      let stderr = '';
      let exitCode: number | null = null;

      call.on('data', (response: CommandResponse) => {
        if (response.stdout) stdout += response.stdout;
        if (response.stderr) stderr += response.stderr;
        if (response.exit_code !== undefined) exitCode = response.exit_code;
      });

      call.on('end', () => {
        resolve({
          success: exitCode === 0,
          data: { stdout, stderr, exit_code: exitCode },
        });
      });

      call.on('error', (error) => {
        reject(error);
      });

      signal.addEventListener('abort', () => {
        call.cancel();
      });
    });
  }

  async readFile(params: any): Promise<SandboxOperationResponse> {
    return new Promise((resolve, reject) => {
      this.client.readFile(
        {
          path: params.path,
          offset: params.offset,
          limit: params.limit,
        },
        (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: true,
              data: {
                content: response.content.toString('utf-8'),
                size: response.size,
              },
            });
          }
        },
      );
    });
  }

  executeStream(
    request: SandboxOperationRequest,
    signal: AbortSignal,
  ): AsyncIterable<SandboxStreamChunk> {
    // 实现流式接口
    return this.createStreamIterator(request, signal);
  }

  private async *createStreamIterator(
    request: SandboxOperationRequest,
    signal: AbortSignal,
  ): AsyncIterableIterator<SandboxStreamChunk> {
    const call = this.client.executeCommand({
      command: request.params.command,
      working_dir: request.params.working_dir,
    });

    for await (const response of call) {
      if (signal.aborted) {
        call.cancel();
        break;
      }

      if (response.stdout) {
        yield { type: 'output', data: { ansiOutput: response.stdout } };
      }

      if (response.exit_code !== undefined) {
        yield {
          type: 'final',
          data: {
            success: response.exit_code === 0,
            data: { exit_code: response.exit_code },
          },
        };
      }
    }
  }

  async destroy(): Promise<void> {
    const container = this.docker.getContainer(this.containerId);
    await container.stop();
    await container.remove();
  }
}
```

---

## 7. 实施计划

### 7.1 第一阶段：基础设施准备（1-2 周）

#### 任务清单

- [ ] **数据库搭建**
  - [ ] 部署 PostgreSQL 14+
  - [ ] 执行 schema 迁移脚本
  - [ ] 创建分区表（chat_history）
  - [ ] 设置数据库备份策略

- [ ] **缓存服务搭建**
  - [ ] 部署 Redis 7.0+
  - [ ] 配置持久化（AOF + RDB）
  - [ ] 设置主从复制（可选）

- [ ] **对象存储搭建**
  - [ ] 部署 MinIO 或配置 S3
  - [ ] 创建存储桶
  - [ ] 配置生命周期策略

### 7.2 第二阶段：核心组件开发（3-4 周）

#### 任务清单

- [ ] **会话管理模块**
  - [ ] 实现 `SessionManager`
  - [ ] 实现 `SessionLifecycleManager`
  - [ ] 实现会话清理定时任务

- [ ] **数据仓库层**
  - [ ] 实现 `TodoRepository`
  - [ ] 实现 `MemoryRepository`
  - [ ] 实现 `RedisService`

- [ ] **通用沙箱工具**
  - [ ] 实现 `SandboxToolInvocation`
  - [ ] 实现各工具策略（Shell、ReadFile、WriteFile）
  - [ ] 改造现有工具（ShellTool、ReadFileTool 等）

### 7.3 第三阶段：沙箱服务开发（2-3 周）

#### 任务清单

- [ ] **gRPC 服务端**
  - [ ] 定义 protobuf 接口
  - [ ] 实现 SandboxService
  - [ ] 实现健康检查

- [ ] **沙箱管理器**
  - [ ] 实现 `SandboxPoolManager`
  - [ ] 实现预热池机制
  - [ ] 实现沙箱监控

- [ ] **沙箱客户端**
  - [ ] 实现 `SandboxClient`
  - [ ] 实现流式通信
  - [ ] 实现错误重试

### 7.4 第四阶段：集成与测试（2 周）

#### 任务清单

- [ ] **单元测试**
  - [ ] TodoRepository 测试
  - [ ] SandboxToolInvocation 测试
  - [ ] 策略类测试

- [ ] **集成测试**
  - [ ] 多会话并发测试
  - [ ] 沙箱隔离测试
  - [ ] 故障恢复测试

- [ ] **压力测试**
  - [ ] 1000 并发会话
  - [ ] 100 并发沙箱
  - [ ] 长时间运行测试

### 7.5 第五阶段：部署与上线（1 周）

#### 任务清单

- [ ] **部署**
  - [ ] 配置 Docker Compose / Kubernetes
  - [ ] 配置监控告警
  - [ ] 配置日志收集

- [ ] **灰度发布**
  - [ ] 10% 流量测试
  - [ ] 50% 流量测试
  - [ ] 100% 全量上线

---

## 8. 技术规范

### 8.1 代码规范

```typescript
// 文件命名规范
// packages/core/src/sandbox/
//   ├── sandbox-manager.ts
//   ├── sandbox-client.ts
//   ├── sandbox-pool.ts
//   ├── strategies/
//   │   ├── shell-command-strategy.ts
//   │   ├── read-file-strategy.ts
//   │   └── write-file-strategy.ts
//   └── index.ts

// 导出规范
export {
  SandboxToolInvocation,
  ISandboxOperationStrategy,
  SandboxExecutionContext,
} from './sandbox-tool-invocation.js';
```

### 8.2 配置管理

```typescript
// packages/core/src/config/sandbox-config.ts
export interface SandboxConfig {
  pool: {
    minIdle: number;
    maxIdle: number;
    maxActive: number;
  };
  resources: {
    cpuLimit: number;
    memoryLimit: number;
    diskLimit: number;
  };
  network: {
    mode: 'bridge' | 'host' | 'none';
    enableInternet: boolean;
  };
}

// 默认配置
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  pool: {
    minIdle: 5,
    maxIdle: 20,
    maxActive: 100,
  },
  resources: {
    cpuLimit: 1.0,
    memoryLimit: 2 * 1024 * 1024 * 1024,
    diskLimit: 10 * 1024 * 1024 * 1024,
  },
  network: {
    mode: 'bridge',
    enableInternet: true,
  },
};
```

### 8.3 错误处理规范

```typescript
// 统一错误类型
export enum SandboxErrorType {
  CONNECTION_FAILED = 'SANDBOX_CONNECTION_FAILED',
  EXECUTION_TIMEOUT = 'SANDBOX_EXECUTION_TIMEOUT',
  RESOURCE_LIMIT_EXCEEDED = 'SANDBOX_RESOURCE_LIMIT_EXCEEDED',
  PERMISSION_DENIED = 'SANDBOX_PERMISSION_DENIED',
}

// 错误处理示例
try {
  const result = await sandbox.execute(request, signal);
} catch (error) {
  if (error.code === 'DEADLINE_EXCEEDED') {
    throw new SandboxError(
      SandboxErrorType.EXECUTION_TIMEOUT,
      'Sandbox execution timeout',
    );
  }
  throw error;
}
```

### 8.4 日志规范

```typescript
// 结构化日志
logger.info('Sandbox created', {
  sessionId,
  sandboxId: container.id,
  resources: {
    cpu: config.cpuLimit,
    memory: config.memoryLimit,
  },
  duration: Date.now() - startTime,
});

// 性能日志
logger.metric('sandbox.execution.duration', {
  operationType: 'execute_command',
  duration: durationMs,
  success: true,
  fromCache: false,
});
```

### 8.5 监控指标

```typescript
// Prometheus 指标定义
const metrics = {
  // 沙箱池指标
  sandboxPoolSize: new Gauge({
    name: 'sandbox_pool_size',
    help: 'Current sandbox pool size',
    labelNames: ['status'], // idle, active
  }),

  // 工具执行指标
  toolExecutionDuration: new Histogram({
    name: 'tool_execution_duration_seconds',
    help: 'Tool execution duration',
    labelNames: ['tool_name', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
  }),

  // 会话指标
  activeSessions: new Gauge({
    name: 'active_sessions_total',
    help: 'Number of active sessions',
  }),
};
```

---

## 9. 附录

### 9.1 完整文件清单

```
packages/core/src/
├── sandbox/
│   ├── sandbox-tool-invocation.ts          # 通用沙箱调用
│   ├── sandbox-manager.ts                  # 沙箱管理器
│   ├── sandbox-client.ts                   # gRPC 客户端
│   ├── sandbox-pool.ts                     # 沙箱池
│   ├── strategies/
│   │   ├── base-strategy.ts
│   │   ├── shell-command-strategy.ts
│   │   ├── read-file-strategy.ts
│   │   ├── write-file-strategy.ts
│   │   └── edit-file-strategy.ts
│   └── index.ts
├── session/
│   ├── session-manager.ts                  # 会话管理器
│   ├── session-lifecycle-manager.ts        # 生命周期管理
│   └── index.ts
├── repositories/
│   ├── todo-repository.ts                  # Todo 数据仓库
│   ├── memory-repository.ts                # Memory 数据仓库
│   ├── redis-service.ts                    # Redis 服务
│   └── index.ts
└── proto/
    └── sandbox.proto                       # gRPC 接口定义
```

### 9.2 环境变量配置

```bash
# .env.example

# 数据库配置
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=qwen_code
POSTGRES_USER=qwen
POSTGRES_PASSWORD=your_password

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# S3/MinIO 配置
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=qwen-code

# 沙箱配置
SANDBOX_POOL_MIN_IDLE=5
SANDBOX_POOL_MAX_IDLE=20
SANDBOX_POOL_MAX_ACTIVE=100
SANDBOX_CPU_LIMIT=1.0
SANDBOX_MEMORY_LIMIT=2147483648
SANDBOX_DISK_LIMIT=10737418240

# 会话配置
SESSION_MAX_LIFETIME=86400
SESSION_IDLE_TIMEOUT=7200
SESSION_CLEANUP_INTERVAL=300
```

### 9.3 Docker Compose 示例

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: qwen_code
      POSTGRES_USER: qwen
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - '5432:5432'

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    ports:
      - '6379:6379'

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY}
    volumes:
      - minio-data:/data
    ports:
      - '9000:9000'
      - '9001:9001'

  qwen-code:
    image: qwen-code:latest
    depends_on:
      - postgres
      - redis
      - minio
    environment:
      POSTGRES_HOST: postgres
      REDIS_HOST: redis
      S3_ENDPOINT: http://minio:9000
    ports:
      - '3000:3000'
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

volumes:
  postgres-data:
  redis-data:
  minio-data:
```

---

## 总结

本方案提供了完整的多用户无状态架构改造路径，包括：

✅ **会话隔离**：通过 Session ID 实现逻辑隔离  
✅ **数据持久化**：PostgreSQL + Redis 双层存储  
✅ **通用沙箱工具**：策略模式统一沙箱操作  
✅ **远程沙箱**：gRPC + Docker 容器池  
✅ **可扩展性**：支持水平扩展和负载均衡

方案完全可落地实施，所有技术选型均基于现有技术栈，改造成本可控。

---

**文档维护者**: Qwen Code Team  
**最后更新**: 2025-01-19
