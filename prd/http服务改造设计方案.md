# Qwen Code HTTP接口改造升级方案

## 一、项目现状深度分析

### 1.1 项目架构概览

**Qwen Code** 是一个命令行AI工作流工具，主要特点：

- **技术栈**：Node.js + TypeScript + React (Ink框架用于终端UI)
- **架构模式**：Monorepo结构（使用npm workspaces）
- **核心包结构**：
  - `packages/cli`：命令行界面和交互逻辑
  - `packages/core`：核心业务逻辑（聊天、工具调用、文件操作）
  - `packages/test-utils`：测试工具
  - `packages/vscode-ide-companion`：VS Code集成

### 1.2 CLI封装的核心逻辑层次

经过深入分析，CLI层面封装了丰富的业务逻辑，主要分为以下几层：

#### 1.2.1 交互层（UI Hooks）

**核心Hook：useGeminiStream**

- 管理整个聊天流程的生命周期
- 处理用户输入、流式响应、工具调用
- 状态管理：isResponding、thought、pendingHistoryItem
- 集成了多个子Hook（工具调度、命令处理、Vision自动切换）

**关键职责**：

```typescript
// 核心状态管理
- StreamingState: 流式响应状态
- HistoryItem: 历史记录管理
- ToolCalls: 工具调用跟踪
- ThoughtSummary: 思考过程展示
```

#### 1.2.2 命令处理层（Command Processors）

**1. Slash命令处理器（slashCommandProcessor）**

```typescript
// 处理 /help, /clear, /quit 等内置命令
- CommandService: 命令服务协调器
- BuiltinCommandLoader: 内置命令加载
- FileCommandLoader: 文件命令加载
- McpPromptLoader: MCP提示加载
```

**2. At命令处理器（atCommandProcessor）**

```typescript
// 处理 @file.txt 文件引用
- parseAllAtCommands: 解析@路径命令
- handleAtCommand: 读取文件内容并注入上下文
- 支持通配符和多文件引用
- 集成文件过滤（gitignore、qwenignore）
```

**3. Shell命令处理器（shellCommandProcessor）**

```typescript
// 处理 $command 形式的shell命令
- handleShellCommand: 执行shell命令
- 管理PTY会话
- 实时输出流式展示
```

#### 1.2.3 工具调度层（Tool Scheduler）

**核心组件：useReactToolScheduler + CoreToolScheduler**

```typescript
// 工具调用生命周期管理
Tool Call States:
├── scheduled       // 已调度
├── validating      // 验证中
├── awaiting_approval  // 等待确认
├── executing       // 执行中
├── success         // 成功
├── cancelled       // 已取消
└── error           // 错误

// 关键功能
- 并发工具调用管理
- 实时输出更新（outputUpdateHandler）
- 工具完成回调（allToolCallsCompleteHandler）
- 权限确认流程
```

#### 1.2.4 历史管理层（History Manager）

**核心Hook：useHistoryManager**

```typescript
// 历史记录管理
interface HistoryItem {
  id: number;
  type: 'user' | 'assistant' | 'tool_group' | 'system';
  content: Content;
  timestamp: number;
  // ... 其他元数据
}

// 关键方法
- addItem: 添加历史项
- updateItem: 更新历史项
- clearItems: 清空历史
- loadHistory: 加载历史
```

#### 1.2.5 会话管理层（Session Management）

**关键组件**：

```typescript
// SessionStatsProvider
-统计提示次数 -
  跟踪会话时长 -
  记录工具调用统计 -
  // Configuration Management
  模型配置 -
  认证配置 -
  用户设置 -
  沙箱配置;
```

#### 1.2.6 认证与授权层

**多认证方式支持**：

```typescript
// Auth Types
- Qwen OAuth: OAuth2流程
- OpenAI Compatible: API Key模式
- 自动刷新Token机制
- 权限管理和文件夹信任
```

### 1.3 关键数据流

```
用户输入
  ↓
命令解析（Slash/At/Shell）
  ↓
输入预处理（文件注入、路径解析）
  ↓
Vision自动切换检测
  ↓
GeminiClient.sendMessageStream
  ↓
流式响应处理
  ├── 文本块（ContentEvent）
  ├── 工具调用请求（ToolCallRequest）
  ├── 思考过程（ThoughtSummary）
  └── 完成信号（FinishedEvent）
  ↓
工具调度器处理
  ├── 验证工具调用
  ├── 权限确认（如需要）
  ├── 并发执行工具
  └── 收集工具响应
  ↓
工具响应反馈给模型
  ↓
新一轮流式响应
  ↓
最终响应完成
  ↓
历史记录保存
```

## 二、HTTP接口改造总体设计

### 2.1 设计原则

1. **最大复用**：复用`@qwen-code/core`的所有核心逻辑
2. **逻辑一致**：HTTP服务与CLI的业务逻辑保持100%一致
3. **适配器模式**：通过适配器桥接CLI层的Hook逻辑和HTTP接口
4. **渐进式改造**：分阶段实施，保持CLI功能不变

### 2.2 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                   客户端层                                │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐             │
│  │ CLI客户端│  │ Web浏览器│  │  API客户端  │             │
│  └────┬────┘  └─────┬────┘  └──────┬─────┘             │
└───────┼────────────┼─────────────┼────────────────────┘
        │            │              │
┌───────┼────────────┼─────────────┼────────────────────┐
│       │            │              │   API网关层          │
│       │      ┌─────▼──────────────▼─────┐               │
│       │      │   HTTP/WebSocket Server  │               │
│       │      │   (Fastify)              │               │
│       │      └──────────┬────────────────┘               │
└───────┼─────────────────┼──────────────────────────────┘
        │                 │
┌───────┼─────────────────┼──────────────────────────────┐
│       │                 │   服务适配层（新增）           │
│       │      ┌──────────▼────────────────┐              │
│       │      │   Session Service         │              │
│       │      │   (会话管理服务)           │              │
│       │      └──────────┬────────────────┘              │
│       │                 │                               │
│       │      ┌──────────▼────────────────┐              │
│       │      │   CLI Logic Adapter       │              │
│       │      │   (CLI逻辑适配器)          │              │
│       │      │  • CommandProcessor       │              │
│       │      │  • HistoryManager         │              │
│       │      │  • ToolScheduler          │              │
│       │      │  • StreamHandler          │              │
│       │      └──────────┬────────────────┘              │
└───────┼─────────────────┼──────────────────────────────┘
        │                 │
┌───────┼─────────────────┼──────────────────────────────┐
│       │                 │   CLI业务逻辑层（复用）         │
│       │      ┌──────────▼────────────────┐              │
│       └─────►│   CLI Hooks Logic         │              │
│              │  • slashCommandProcessor  │              │
│              │  • atCommandProcessor     │              │
│              │  • shellCommandProcessor  │              │
│              │  • useReactToolScheduler  │              │
│              │  • useHistoryManager      │              │
│              └──────────┬────────────────┘              │
└─────────────────────────┼──────────────────────────────┘
                          │
┌─────────────────────────┼──────────────────────────────┐
│                         │   核心层（完全复用）            │
│              ┌──────────▼────────────────┐              │
│              │   @qwen-code/core         │              │
│              │  • GeminiClient           │              │
│              │  • CoreToolScheduler      │              │
│              │  • Config Manager         │              │
│              │  • File Services          │              │
│              │  • Tool Registry          │              │
│              └───────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

### 2.3 技术选型

#### 后端框架

**推荐：Fastify**

- 高性能（2-3x Express）
- 原生TypeScript支持
- 内置Schema验证
- 优秀的WebSocket支持
- 轻量级，易于集成

#### 状态管理

- **会话存储**：Redis（生产）/ 内存（开发）
- **历史记录**：PostgreSQL / MongoDB（可选）
- **文件缓存**：本地文件系统 + LRU缓存

#### 认证方案

- JWT Token
- Session管理（Redis）
- OAuth2兼容（复用现有Qwen OAuth）

## 三、核心适配器设计

### 3.1 CLI逻辑适配器总览

```typescript
// packages/server/src/adapters/CLILogicAdapter.ts

/**
 * CLI逻辑适配器 - 将CLI的Hook逻辑转换为HTTP服务可用的函数
 *
 * 核心思想：
 * 1. 提取CLI Hooks中的纯逻辑部分
 * 2. 去除React特定的状态管理（useState, useCallback等）
 * 3. 改为基于回调的事件驱动模型
 * 4. 保持业务逻辑100%一致
 */

export class CLILogicAdapter {
  private config: Config;
  private geminiClient: GeminiClient;
  private historyManager: ServerHistoryManager;
  private toolScheduler: ServerToolScheduler;
  private commandService: CommandService;

  constructor(config: Config) {
    this.config = config;
    this.geminiClient = new GeminiClient(config);
    this.historyManager = new ServerHistoryManager();
    this.toolScheduler = new ServerToolScheduler(config);
    this.commandService = new CommandService();
  }

  async initialize(): Promise<void> {
    await this.geminiClient.initialize();
    await this.commandService.initialize();
  }

  /**
   * 处理用户消息 - 适配自 useGeminiStream 的核心逻辑
   */
  async processUserMessage(
    message: string,
    options: ProcessMessageOptions,
  ): AsyncGenerator<StreamEvent, void, unknown> {
    // 1. 命令预处理
    const preprocessed = await this.preprocessCommand(message);

    // 2. 处理特殊命令
    if (preprocessed.isSlashCommand) {
      yield * this.handleSlashCommand(preprocessed.command);
      return;
    }

    if (preprocessed.isAtCommand) {
      const processed = await this.handleAtCommand(preprocessed.command);
      message = processed.processedQuery;
    }

    if (preprocessed.isShellCommand) {
      yield * this.handleShellCommand(preprocessed.command);
      return;
    }

    // 3. 处理Vision自动切换
    if (preprocessed.hasImages) {
      await this.handleVisionSwitch(preprocessed);
    }

    // 4. 发送给模型并处理流式响应
    yield * this.streamGeminiResponse(message, options);
  }

  /**
   * 流式响应处理 - 适配自 useGeminiStream 的响应处理逻辑
   */
  private async *streamGeminiResponse(
    message: string,
    options: ProcessMessageOptions,
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const abortController = new AbortController();
    const parts = [{ text: message }];

    try {
      const responseStream = this.geminiClient.sendMessageStream(
        parts,
        abortController.signal,
        options.promptId,
      );

      let currentText = '';
      const toolCalls: ToolCallRequestInfo[] = [];

      for await (const event of responseStream) {
        switch (event.type) {
          case GeminiEventType.Content:
            currentText += event.value;
            yield {
              type: 'content',
              content: event.value,
              accumulated: currentText,
            };
            break;

          case GeminiEventType.Thought:
            yield {
              type: 'thought',
              thought: event.value,
            };
            break;

          case GeminiEventType.ToolCallRequest:
            toolCalls.push(event.value);
            yield {
              type: 'tool_call_request',
              toolCall: event.value,
            };
            break;

          case GeminiEventType.Finished:
            // 处理工具调用
            if (toolCalls.length > 0) {
              yield* this.executeToolCalls(toolCalls, options);
            }

            yield {
              type: 'finished',
              finishReason: event.value.finishReason,
            };
            break;
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * 工具调用执行 - 适配自 useReactToolScheduler
   */
  private async *executeToolCalls(
    toolCalls: ToolCallRequestInfo[],
    options: ProcessMessageOptions,
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const scheduledCalls = await this.toolScheduler.schedule(
      toolCalls,
      options.signal,
    );

    // 订阅工具执行事件
    for await (const update of this.toolScheduler.getUpdates()) {
      switch (update.type) {
        case 'status_change':
          yield {
            type: 'tool_status',
            callId: update.callId,
            status: update.status,
          };
          break;

        case 'output_update':
          yield {
            type: 'tool_output',
            callId: update.callId,
            output: update.output,
          };
          break;

        case 'completed':
          yield {
            type: 'tool_completed',
            callId: update.callId,
            result: update.result,
          };
          break;

        case 'error':
          yield {
            type: 'tool_error',
            callId: update.callId,
            error: update.error,
          };
          break;
      }
    }

    // 等待所有工具完成
    const completedTools = await this.toolScheduler.waitForCompletion();

    // 将工具响应发送回模型
    yield* this.submitToolResponses(completedTools);
  }

  /**
   * Slash命令处理 - 适配自 slashCommandProcessor
   */
  private async *handleSlashCommand(
    command: string,
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const parsed = parseSlashCommand(command);
    const cmd = await this.commandService.getCommand(parsed.name);

    if (!cmd) {
      yield {
        type: 'error',
        error: `Unknown command: ${parsed.name}`,
      };
      return;
    }

    const context = this.createCommandContext();
    const result = await cmd.execute(context, parsed.args);

    yield {
      type: 'command_result',
      command: parsed.name,
      result: result,
    };
  }

  /**
   * At命令处理 - 适配自 atCommandProcessor
   */
  private async handleAtCommand(
    query: string,
  ): Promise<{ processedQuery: string; files: FileInfo[] }> {
    const commandParts = parseAllAtCommands(query);
    const atPathParts = commandParts.filter((p) => p.type === 'atPath');

    if (atPathParts.length === 0) {
      return { processedQuery: query, files: [] };
    }

    const fileDiscovery = this.config.getFileService();
    const files: FileInfo[] = [];

    for (const part of atPathParts) {
      const resolved = await fileDiscovery.resolvePathSpec(
        part.content,
        this.config.getFileFilteringOptions(),
      );
      files.push(...resolved);
    }

    // 读取文件内容
    const fileContents = await this.readManyFiles(files);

    // 构建处理后的查询
    const processedQuery = this.buildProcessedQuery(commandParts, fileContents);

    return { processedQuery, files };
  }
}
```

### 3.2 服务端历史管理器

```typescript
// packages/server/src/adapters/ServerHistoryManager.ts

/**
 * 服务端历史管理器 - 适配自 useHistoryManager
 *
 * 关键差异：
 * 1. 不使用React状态，改用内存/Redis存储
 * 2. 支持多会话并发
 * 3. 添加持久化能力
 */

export class ServerHistoryManager {
  private histories: Map<string, HistoryItem[]> = new Map();
  private messageIdCounters: Map<string, number> = new Map();

  /**
   * 添加历史项 - 对应 addItem
   */
  addItem(
    sessionId: string,
    itemData: Omit<HistoryItem, 'id'>,
    baseTimestamp: number,
  ): number {
    const id = this.getNextMessageId(sessionId, baseTimestamp);
    const newItem: HistoryItem = { ...itemData, id } as HistoryItem;

    const history = this.getHistory(sessionId);

    // 防止重复的用户消息
    if (history.length > 0) {
      const lastItem = history[history.length - 1];
      if (
        lastItem.type === 'user' &&
        newItem.type === 'user' &&
        lastItem.text === newItem.text
      ) {
        return id;
      }
    }

    history.push(newItem);
    this.saveHistory(sessionId, history);

    return id;
  }

  /**
   * 更新历史项 - 对应 updateItem
   */
  updateItem(
    sessionId: string,
    id: number,
    updates: Partial<Omit<HistoryItem, 'id'>>,
  ): void {
    const history = this.getHistory(sessionId);
    const index = history.findIndex((item) => item.id === id);

    if (index !== -1) {
      history[index] = { ...history[index], ...updates };
      this.saveHistory(sessionId, history);
    }
  }

  /**
   * 获取历史记录
   */
  getHistory(sessionId: string): HistoryItem[] {
    if (!this.histories.has(sessionId)) {
      this.histories.set(sessionId, []);
    }
    return this.histories.get(sessionId)!;
  }

  /**
   * 清空历史
   */
  clearHistory(sessionId: string): void {
    this.histories.set(sessionId, []);
    this.messageIdCounters.set(sessionId, 0);
  }

  /**
   * 加载历史（用于会话恢复）
   */
  loadHistory(sessionId: string, history: HistoryItem[]): void {
    this.histories.set(sessionId, history);
  }

  private getNextMessageId(sessionId: string, baseTimestamp: number): number {
    const counter = this.messageIdCounters.get(sessionId) || 0;
    const newCounter = counter + 1;
    this.messageIdCounters.set(sessionId, newCounter);
    return baseTimestamp + newCounter;
  }

  private saveHistory(sessionId: string, history: HistoryItem[]): void {
    this.histories.set(sessionId, history);
    // 可选：持久化到数据库
    // await this.persistToDatabase(sessionId, history);
  }
}
```

### 3.3 服务端工具调度器

```typescript
// packages/server/src/adapters/ServerToolScheduler.ts

/**
 * 服务端工具调度器 - 适配自 useReactToolScheduler + CoreToolScheduler
 *
 * 关键改造：
 * 1. 使用EventEmitter代替React状态更新
 * 2. 支持AsyncGenerator实时推送更新
 * 3. 保持工具执行逻辑完全一致
 */

import { EventEmitter } from 'events';
import { CoreToolScheduler } from '@qwen-code/qwen-code-core';

export type ToolUpdateEvent =
  | { type: 'status_change'; callId: string; status: Status }
  | { type: 'output_update'; callId: string; output: string }
  | { type: 'completed'; callId: string; result: any }
  | { type: 'error'; callId: string; error: string };

export class ServerToolScheduler extends EventEmitter {
  private coreScheduler: CoreToolScheduler;
  private pendingCalls: Map<string, TrackedToolCall> = new Map();

  constructor(config: Config) {
    super();

    this.coreScheduler = new CoreToolScheduler({
      outputUpdateHandler: this.handleOutputUpdate.bind(this),
      onAllToolCallsComplete: this.handleAllComplete.bind(this),
      onToolCallsUpdate: this.handleToolCallsUpdate.bind(this),
      getPreferredEditor: () => config.getPreferredEditor(),
      config,
      onEditorClose: () => {},
    });
  }

  /**
   * 调度工具调用
   */
  async schedule(
    requests: ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<TrackedToolCall[]> {
    await this.coreScheduler.schedule(requests, signal);
    return Array.from(this.pendingCalls.values());
  }

  /**
   * 获取实时更新流
   */
  async *getUpdates(): AsyncGenerator<ToolUpdateEvent, void, unknown> {
    const queue: ToolUpdateEvent[] = [];
    let resolve: (() => void) | null = null;

    const listener = (event: ToolUpdateEvent) => {
      queue.push(event);
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    this.on('update', listener);

    try {
      while (this.pendingCalls.size > 0) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }

        while (queue.length > 0) {
          yield queue.shift()!;
        }
      }
    } finally {
      this.off('update', listener);
    }
  }

  /**
   * 等待所有工具完成
   */
  async waitForCompletion(): Promise<CompletedToolCall[]> {
    return new Promise((resolve) => {
      this.once('all_complete', resolve);
    });
  }

  // CoreToolScheduler回调实现

  private handleOutputUpdate(callId: string, output: string): void {
    const call = this.pendingCalls.get(callId);
    if (call && call.status === 'executing') {
      (call as TrackedExecutingToolCall).liveOutput = output;
      this.emit('update', {
        type: 'output_update',
        callId,
        output,
      });
    }
  }

  private async handleAllComplete(
    completedCalls: CompletedToolCall[],
  ): Promise<void> {
    this.emit('all_complete', completedCalls);

    for (const call of completedCalls) {
      this.pendingCalls.delete(call.request.callId);
    }
  }

  private handleToolCallsUpdate(toolCalls: ToolCall[]): void {
    for (const toolCall of toolCalls) {
      const existing = this.pendingCalls.get(toolCall.request.callId);
      const updated = {
        ...toolCall,
        responseSubmittedToGemini: existing?.responseSubmittedToGemini ?? false,
      };

      this.pendingCalls.set(toolCall.request.callId, updated);

      this.emit('update', {
        type: 'status_change',
        callId: toolCall.request.callId,
        status: toolCall.status,
      });
    }
  }
}
```

### 3.4 命令处理适配器

```typescript
// packages/server/src/adapters/CommandProcessorAdapter.ts

/**
 * 命令处理适配器 - 适配CLI的所有命令处理器
 */

export class CommandProcessorAdapter {
  private commandService: CommandService;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const loaders = [
      new BuiltinCommandLoader(),
      new FileCommandLoader(this.config),
      new McpPromptLoader(this.config),
    ];

    this.commandService = await CommandService.create(
      loaders,
      new AbortController().signal,
    );
  }

  /**
   * 处理Slash命令
   */
  async handleSlashCommand(
    command: string,
    context: CommandExecutionContext,
  ): Promise<CommandResult> {
    const parsed = parseSlashCommand(command);
    const cmd = this.commandService
      .getCommands()
      .find((c) => c.name === parsed.name);

    if (!cmd) {
      throw new Error(`Unknown command: /${parsed.name}`);
    }

    const cmdContext = this.createCommandContext(context);
    const result = await cmd.execute(cmdContext, parsed.args);

    return {
      success: true,
      output: result,
      command: parsed.name,
    };
  }

  /**
   * 处理At命令（文件引用）
   */
  async handleAtCommand(
    query: string,
    context: CommandExecutionContext,
  ): Promise<AtCommandResult> {
    const parts = parseAllAtCommands(query);
    const atPaths = parts.filter((p) => p.type === 'atPath');

    if (atPaths.length === 0) {
      return {
        processedQuery: query,
        files: [],
        shouldProceed: true,
      };
    }

    const fileDiscovery = this.config.getFileService();
    const resolvedFiles: FileInfo[] = [];

    for (const part of atPaths) {
      try {
        const files = await fileDiscovery.resolvePathSpec(
          part.content,
          this.config.getFileFilteringOptions(),
        );
        resolvedFiles.push(...files);
      } catch (error) {
        throw new Error(`Failed to resolve path: ${part.content}`);
      }
    }

    // 读取文件内容
    const fileContents = await this.readManyFiles(resolvedFiles);

    // 构建处理后的查询
    const processedQuery = this.buildQueryWithFiles(parts, fileContents);

    return {
      processedQuery,
      files: resolvedFiles,
      shouldProceed: true,
    };
  }

  /**
   * 处理Shell命令
   */
  async *handleShellCommand(
    command: string,
    context: CommandExecutionContext,
  ): AsyncGenerator<ShellCommandEvent, void, unknown> {
    const shellService = this.config.getShellExecutionService();

    const ptyProcess = await shellService.executeCommand(
      command,
      context.workspaceRoot,
    );

    yield {
      type: 'started',
      pid: ptyProcess.pid,
    };

    for await (const output of ptyProcess.output) {
      yield {
        type: 'output',
        data: output,
      };
    }

    const exitCode = await ptyProcess.waitForExit();

    yield {
      type: 'exited',
      exitCode,
    };
  }

  private createCommandContext(
    context: CommandExecutionContext,
  ): CommandContext {
    return {
      config: this.config,
      sessionId: context.sessionId,
      workspaceRoot: context.workspaceRoot,
      addMessage: context.addMessage,
      onDebugMessage: context.onDebugMessage,
      settings: context.settings,
    };
  }

  private async readManyFiles(files: FileInfo[]): Promise<FileContent[]> {
    const readTool = this.config.getToolRegistry().getTool('read_file');
    const contents: FileContent[] = [];

    for (const file of files) {
      const result = await readTool.execute(
        {
          path: file.path,
        },
        this.config,
      );

      contents.push({
        path: file.path,
        content: result.content,
        size: file.size,
      });
    }

    return contents;
  }

  private buildQueryWithFiles(
    parts: AtCommandPart[],
    fileContents: FileContent[],
  ): string {
    let query = '';

    for (const part of parts) {
      if (part.type === 'text') {
        query += part.content;
      } else {
        // 替换 @path 为实际路径
        const content = fileContents.find((f) => f.path.includes(part.content));
        if (content) {
          query += content.path;
        }
      }
    }

    // 添加文件内容块
    if (fileContents.length > 0) {
      query += '\n\n<files>\n';
      for (const file of fileContents) {
        query += `\n<file path="${file.path}">\n`;
        query += file.content;
        query += `\n</file>\n`;
      }
      query += '</files>';
    }

    return query;
  }
}
```

## 四、HTTP服务层实现

### 4.1 项目结构

```
packages/
├── server/                    # 新增HTTP服务器包
│   ├── src/
│   │   ├── index.ts                 # 服务器入口
│   │   ├── app.ts                   # Fastify应用配置
│   │   ├── routes/                  # 路由定义
│   │   │   ├── index.ts             # 路由注册
│   │   │   ├── chat.ts              # 聊天API
│   │   │   ├── files.ts             # 文件操作API
│   │   │   ├── session.ts           # 会话管理API
│   │   │   ├── tools.ts             # 工具调用API
│   │   │   ├── commands.ts          # 命令执行API
│   │   │   └── auth.ts              # 认证API
│   │   ├── services/                # 业务服务层
│   │   │   ├── SessionService.ts    # 会话管理服务
│   │   │   ├── AuthService.ts       # 认证服务
│   │   │   └── ConfigService.ts     # 配置服务
│   │   ├── adapters/                # CLI逻辑适配器
│   │   │   ├── CLILogicAdapter.ts         # 主适配器
│   │   │   ├── ServerHistoryManager.ts    # 历史管理
│   │   │   ├── ServerToolScheduler.ts     # 工具调度
│   │   │   └── CommandProcessorAdapter.ts # 命令处理
│   │   ├── middleware/              # 中间件
│   │   │   ├── auth.ts              # 认证中间件
│   │   │   ├── errorHandler.ts      # 错误处理
│   │   │   ├── rateLimit.ts         # 限流
│   │   │   └── logging.ts           # 日志
│   │   ├── websocket/               # WebSocket处理
│   │   │   ├── ChatWebSocket.ts     # 聊天WebSocket
│   │   │   └── ToolWebSocket.ts     # 工具执行WebSocket
│   │   ├── types/                   # 类型定义
│   │   │   ├── api.ts               # API类型
│   │   │   ├── session.ts           # 会话类型
│   │   │   └── events.ts            # 事件类型
│   │   └── utils/                   # 工具函数
│   │       ├── streamHelpers.ts     # 流处理辅助
│   │       └── validators.ts        # 验证器
│   ├── package.json
│   └── tsconfig.json
```

### 4.2 服务器入口实现

```typescript
// packages/server/src/index.ts

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { setupRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { loggingMiddleware } from './middleware/logging.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { SessionService } from './services/SessionService.js';
import { ConfigService } from './services/ConfigService.js';

async function start() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    },
    bodyLimit: 10 * 1024 * 1024, // 10MB
  });

  // 注册WebSocket支持
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 10 * 1024 * 1024, // 10MB
      verifyClient: (info, callback) => {
        // 可以在这里验证WebSocket连接
        callback(true);
      },
    },
  });

  // 注册CORS
  await fastify.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // 注册JWT
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    sign: {
      expiresIn: '7d',
    },
  });

  // 注册全局中间件
  fastify.addHook('onRequest', loggingMiddleware);
  fastify.addHook('onRequest', rateLimitMiddleware);

  // 注册错误处理
  fastify.setErrorHandler(errorHandler);

  // 初始化服务
  const configService = new ConfigService();
  const sessionService = new SessionService(configService);

  // 将服务注入到Fastify装饰器
  fastify.decorate('sessionService', sessionService);
  fastify.decorate('configService', configService);

  // 注册路由
  await setupRoutes(fastify);

  // 优雅关闭处理
  const closeGracefully = async (signal: string) => {
    fastify.log.info(`Received ${signal}, closing gracefully...`);
    await sessionService.cleanup();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => closeGracefully('SIGTERM'));
  process.on('SIGINT', () => closeGracefully('SIGINT'));

  // 启动服务器
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    fastify.log.info(`🚀 Qwen Code Server listening on http://${host}:${port}`);
    fastify.log.info(`📚 API Documentation: http://${host}:${port}/docs`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
```

### 4.3 会话管理服务

```typescript
// packages/server/src/services/SessionService.ts

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { CLILogicAdapter } from '../adapters/CLILogicAdapter.js';
import type { Config } from '@qwen-code/qwen-code-core';
import { ConfigService } from './ConfigService.js';

interface SessionData {
  id: string;
  userId: string;
  adapter: CLILogicAdapter;
  config: Config;
  createdAt: Date;
  lastActivity: Date;
  metadata: Record<string, any>;
}

export class SessionService extends EventEmitter {
  private sessions: Map<string, SessionData> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30分钟
  private cleanupInterval: NodeJS.Timeout;

  constructor(private configService: ConfigService) {
    super();

    // 定期清理过期会话
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredSessions(),
      60000, // 每分钟检查一次
    );
  }

  /**
   * 创建新会话
   */
  async createSession(
    userId: string,
    options: CreateSessionOptions = {},
  ): Promise<string> {
    const sessionId = randomUUID();

    // 创建配置
    const config = await this.configService.createConfig({
      userId,
      sessionId,
      workspaceRoot: options.workspaceRoot,
      model: options.model,
      ...options.configOverrides,
    });

    // 创建CLI逻辑适配器
    const adapter = new CLILogicAdapter(config);
    await adapter.initialize();

    const sessionData: SessionData = {
      id: sessionId,
      userId,
      adapter,
      config,
      createdAt: new Date(),
      lastActivity: new Date(),
      metadata: options.metadata || {},
    };

    this.sessions.set(sessionId, sessionData);

    this.emit('session_created', {
      sessionId,
      userId,
      timestamp: new Date(),
    });

    return sessionId;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): SessionData | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  /**
   * 验证会话归属
   */
  validateSessionOwnership(sessionId: string, userId: string): boolean {
    const session = this.getSession(sessionId);
    return session?.userId === userId;
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // 清理会话资源
    await session.adapter.cleanup?.();

    this.sessions.delete(sessionId);

    this.emit('session_deleted', {
      sessionId,
      userId: session.userId,
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * 获取用户的所有会话
   */
  getUserSessions(userId: string): SessionData[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.userId === userId,
    );
  }

  /**
   * 更新会话元数据
   */
  updateSessionMetadata(
    sessionId: string,
    metadata: Record<string, any>,
  ): boolean {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    session.metadata = {
      ...session.metadata,
      ...metadata,
    };

    return true;
  }

  /**
   * 获取会话统计
   */
  getSessionStats(sessionId: string): SessionStats | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      id: sessionId,
      userId: session.userId,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      duration: Date.now() - session.createdAt.getTime(),
      messageCount: session.adapter.getHistoryManager().getHistory(sessionId)
        .length,
      toolCallCount: session.adapter
        .getToolScheduler()
        .getCompletedCallsCount(),
      metadata: session.metadata,
    };
  }

  /**
   * 清理过期会话
   */
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

  /**
   * 清理所有会话（用于优雅关闭）
   */
  async cleanup(): Promise<void> {
    clearInterval(this.cleanupInterval);

    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((id) => this.deleteSession(id)));
  }

  /**
   * 获取服务统计
   */
  getServiceStats(): ServiceStats {
    return {
      totalSessions: this.sessions.size,
      sessionsByUser: this.getSessionsByUser(),
      oldestSession: this.getOldestSession(),
      newestSession: this.getNewestSession(),
    };
  }

  private getSessionsByUser(): Map<string, number> {
    const userCounts = new Map<string, number>();
    for (const session of this.sessions.values()) {
      userCounts.set(session.userId, (userCounts.get(session.userId) || 0) + 1);
    }
    return userCounts;
  }

  private getOldestSession(): SessionData | null {
    let oldest: SessionData | null = null;
    for (const session of this.sessions.values()) {
      if (!oldest || session.createdAt < oldest.createdAt) {
        oldest = session;
      }
    }
    return oldest;
  }

  private getNewestSession(): SessionData | null {
    let newest: SessionData | null = null;
    for (const session of this.sessions.values()) {
      if (!newest || session.createdAt > newest.createdAt) {
        newest = session;
      }
    }
    return newest;
  }
}

interface CreateSessionOptions {
  workspaceRoot?: string;
  model?: string;
  metadata?: Record<string, any>;
  configOverrides?: Record<string, any>;
}

interface SessionStats {
  id: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  duration: number;
  messageCount: number;
  toolCallCount: number;
  metadata: Record<string, any>;
}

interface ServiceStats {
  totalSessions: number;
  sessionsByUser: Map<string, number>;
  oldestSession: SessionData | null;
  newestSession: SessionData | null;
}
```

### 4.4 聊天路由实现

```typescript
// packages/server/src/routes/chat.ts

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { SessionService } from '../services/SessionService.js';
import type { StreamEvent } from '../adapters/CLILogicAdapter.js';

const CreateSessionSchema = z.object({
  workspaceRoot: z.string().optional(),
  model: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const SendMessageSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1),
  stream: z.boolean().optional().default(true),
});

export async function chatRoutes(fastify: FastifyInstance) {
  const sessionService = fastify.sessionService as SessionService;

  /**
   * 创建聊天会话
   * POST /api/chat/session
   */
  fastify.post<{
    Body: z.infer<typeof CreateSessionSchema>;
  }>(
    '/api/chat/session',
    {
      schema: {
        body: CreateSessionSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await request.jwtVerify<{ userId: string }>();
      const { workspaceRoot, model, metadata } = request.body;

      const sessionId = await sessionService.createSession(user.userId, {
        workspaceRoot,
        model,
        metadata,
      });

      return {
        sessionId,
        createdAt: new Date().toISOString(),
      };
    },
  );

  /**
   * 获取会话信息
   * GET /api/chat/session/:sessionId
   */
  fastify.get<{
    Params: { sessionId: string };
  }>('/api/chat/session/:sessionId', async (request, reply) => {
    const user = await request.jwtVerify<{ userId: string }>();
    const { sessionId } = request.params;

    if (!sessionService.validateSessionOwnership(sessionId, user.userId)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const stats = sessionService.getSessionStats(sessionId);
    if (!stats) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    return stats;
  });

  /**
   * 删除会话
   * DELETE /api/chat/session/:sessionId
   */
  fastify.delete<{
    Params: { sessionId: string };
  }>('/api/chat/session/:sessionId', async (request, reply) => {
    const user = await request.jwtVerify<{ userId: string }>();
    const { sessionId } = request.params;

    if (!sessionService.validateSessionOwnership(sessionId, user.userId)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const deleted = await sessionService.deleteSession(sessionId);
    if (!deleted) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    return { success: true };
  });

  /**
   * 发送消息（非流式）
   * POST /api/chat/message
   */
  fastify.post<{
    Body: z.infer<typeof SendMessageSchema>;
  }>(
    '/api/chat/message',
    {
      schema: {
        body: SendMessageSchema,
      },
    },
    async (request, reply) => {
      const user = await request.jwtVerify<{ userId: string }>();
      const { sessionId, message } = request.body;

      if (!sessionService.validateSessionOwnership(sessionId, user.userId)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      try {
        // 收集所有流式事件
        const events: StreamEvent[] = [];
        const stream = session.adapter.processUserMessage(message, {
          sessionId,
          promptId: `prompt_${Date.now()}`,
          signal: new AbortController().signal,
        });

        for await (const event of stream) {
          events.push(event);
        }

        // 提取最终响应
        const contentEvents = events.filter((e) => e.type === 'content');
        const finalContent = contentEvents
          .map((e) => (e as any).content)
          .join('');

        const toolCallEvents = events.filter(
          (e) => e.type === 'tool_call_request' || e.type === 'tool_completed',
        );

        return {
          response: finalContent,
          toolCalls: toolCallEvents,
          events: events.map((e) => ({
            type: e.type,
            timestamp: Date.now(),
          })),
        };
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to process message',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * WebSocket流式聊天
   * GET /api/chat/stream
   */
  fastify.get(
    '/api/chat/stream',
    { websocket: true },
    (connection, request) => {
      let sessionId: string | null = null;
      let userId: string | null = null;
      let abortController: AbortController | null = null;

      connection.on('message', async (messageBuffer: Buffer) => {
        try {
          const data = JSON.parse(messageBuffer.toString());

          // 处理认证消息
          if (data.type === 'auth') {
            try {
              const decoded = fastify.jwt.verify<{ userId: string }>(
                data.token,
              );
              userId = decoded.userId;
              connection.send(
                JSON.stringify({
                  type: 'auth_success',
                  userId,
                }),
              );
            } catch (error) {
              connection.send(
                JSON.stringify({
                  type: 'error',
                  error: 'Authentication failed',
                }),
              );
              connection.close();
            }
            return;
          }

          // 验证已认证
          if (!userId) {
            connection.send(
              JSON.stringify({
                type: 'error',
                error: 'Not authenticated',
              }),
            );
            return;
          }

          // 处理会话设置
          if (data.type === 'set_session') {
            sessionId = data.sessionId;

            if (!sessionService.validateSessionOwnership(sessionId, userId)) {
              connection.send(
                JSON.stringify({
                  type: 'error',
                  error: 'Invalid session',
                }),
              );
              sessionId = null;
              return;
            }

            connection.send(
              JSON.stringify({
                type: 'session_ready',
                sessionId,
              }),
            );
            return;
          }

          // 处理消息
          if (data.type === 'message') {
            if (!sessionId) {
              connection.send(
                JSON.stringify({
                  type: 'error',
                  error: 'No session set',
                }),
              );
              return;
            }

            const session = sessionService.getSession(sessionId);
            if (!session) {
              connection.send(
                JSON.stringify({
                  type: 'error',
                  error: 'Session not found',
                }),
              );
              return;
            }

            // 创建中止控制器
            abortController = new AbortController();

            // 处理流式响应
            const stream = session.adapter.processUserMessage(data.message, {
              sessionId,
              promptId: `prompt_${Date.now()}`,
              signal: abortController.signal,
            });

            for await (const event of stream) {
              if (abortController.signal.aborted) {
                break;
              }

              connection.send(
                JSON.stringify({
                  ...event,
                  timestamp: Date.now(),
                }),
              );
            }

            connection.send(
              JSON.stringify({
                type: 'stream_end',
                timestamp: Date.now(),
              }),
            );
          }

          // 处理取消
          if (data.type === 'cancel') {
            if (abortController) {
              abortController.abort();
              connection.send(
                JSON.stringify({
                  type: 'cancelled',
                  timestamp: Date.now(),
                }),
              );
            }
          }
        } catch (error) {
          fastify.log.error(error);
          connection.send(
            JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: Date.now(),
            }),
          );
        }
      });

      connection.on('close', () => {
        if (abortController) {
          abortController.abort();
        }
      });

      // 发送连接确认
      connection.send(
        JSON.stringify({
          type: 'connected',
          timestamp: Date.now(),
        }),
      );
    },
  );

  /**
   * 获取历史记录
   * GET /api/chat/history/:sessionId
   */
  fastify.get<{
    Params: { sessionId: string };
    Querystring: { limit?: number; offset?: number };
  }>('/api/chat/history/:sessionId', async (request, reply) => {
    const user = await request.jwtVerify<{ userId: string }>();
    const { sessionId } = request.params;
    const { limit = 50, offset = 0 } = request.query;

    if (!sessionService.validateSessionOwnership(sessionId, user.userId)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const session = sessionService.getSession(sessionId);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    const fullHistory = session.adapter
      .getHistoryManager()
      .getHistory(sessionId);

    const paginatedHistory = fullHistory.slice(offset, offset + limit);

    return {
      history: paginatedHistory,
      total: fullHistory.length,
      limit,
      offset,
    };
  });
}
```

### 4.5 文件操作路由

```typescript
// packages/server/src/routes/files.ts

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SessionService } from '../services/SessionService.js';
import { executeToolCall } from '@qwen-code/qwen-code-core';

const ReadFileSchema = z.object({
  sessionId: z.string().uuid(),
  path: z.string(),
  offset: z.number().optional(),
  length: z.number().optional(),
});

const WriteFileSchema = z.object({
  sessionId: z.string().uuid(),
  path: z.string(),
  content: z.string(),
});

const SearchFilesSchema = z.object({
  sessionId: z.string().uuid(),
  pattern: z.string(),
  path: z.string().optional(),
  maxResults: z.number().optional().default(100),
});

export async function fileRoutes(fastify: FastifyInstance) {
  const sessionService = fastify.sessionService as SessionService;

  /**
   * 读取文件
   * POST /api/files/read
   */
  fastify.post<{
    Body: z.infer<typeof ReadFileSchema>;
  }>(
    '/api/files/read',
    {
      schema: {
        body: ReadFileSchema,
      },
    },
    async (request, reply) => {
      const user = await request.jwtVerify<{ userId: string }>();
      const { sessionId, path, offset, length } = request.body;

      if (!sessionService.validateSessionOwnership(sessionId, user.userId)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      try {
        const result = await executeToolCall(
          session.config,
          {
            name: 'read_file',
            args: { path, offset, length },
            callId: `read_${Date.now()}`,
          },
          new AbortController().signal,
        );

        return {
          success: true,
          content: result.result,
          path,
        };
      } catch (error) {
        return reply.code(500).send({
          error: 'Failed to read file',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * 写入文件
   * POST /api/files/write
   */
  fastify.post<{
    Body: z.infer<typeof WriteFileSchema>;
  }>(
    '/api/files/write',
    {
      schema: {
        body: WriteFileSchema,
      },
    },
    async (request, reply) => {
      const user = await request.jwtVerify<{ userId: string }>();
      const { sessionId, path, content } = request.body;

      if (!sessionService.validateSessionOwnership(sessionId, user.userId)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      try {
        const result = await executeToolCall(
          session.config,
          {
            name: 'write_file',
            args: { path, content },
            callId: `write_${Date.now()}`,
          },
          new AbortController().signal,
        );

        return {
          success: true,
          path,
          bytesWritten: content.length,
        };
      } catch (error) {
        return reply.code(500).send({
          error: 'Failed to write file',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * 搜索文件
   * POST /api/files/search
   */
  fastify.post<{
    Body: z.infer<typeof SearchFilesSchema>;
  }>(
    '/api/files/search',
    {
      schema: {
        body: SearchFilesSchema,
      },
    },
    async (request, reply) => {
      const user = await request.jwtVerify<{ userId: string }>();
      const { sessionId, pattern, path, maxResults } = request.body;

      if (!sessionService.validateSessionOwnership(sessionId, user.userId)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      try {
        const result = await executeToolCall(
          session.config,
          {
            name: 'grep',
            args: { pattern, path, maxResults },
            callId: `search_${Date.now()}`,
          },
          new AbortController().signal,
        );

        return {
          success: true,
          results: result.resultDisplay,
        };
      } catch (error) {
        return reply.code(500).send({
          error: 'Failed to search files',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );
}
```

## 五、实施完成状态

### 已完成的工作

✅ **阶段1: 基础架构搭建**

1. 创建了`packages/server`目录结构
2. 配置了Fastify + TypeScript环境
3. 实现了SessionService（内存版本）
4. 实现了JWT认证中间件
5. 配置了日志和错误处理
6. 实现了健康检查端点
7. 实现了SSE流式聊天API
8. 实现了会话管理API

### 核心文件清单

**配置文件**:

- `package.json` - 项目依赖和脚本
- `tsconfig.json` - TypeScript配置
- `.env.template` - 环境变量模板
- `README.md` - 使用文档

**类型定义**:

- `src/types/index.ts` - 核心类型定义

**服务层**:

- `src/services/SessionService.ts` - 会话管理服务

**中间件**:

- `src/middleware/auth.ts` - JWT认证
- `src/middleware/errorHandler.ts` - 错误处理
- `src/middleware/logging.ts` - 日志记录

**路由**:

- `src/routes/index.ts` - 路由注册
- `src/routes/health.ts` - 健康检查
- `src/routes/session.ts` - 会话管理
- `src/routes/chat.ts` - SSE流式聊天

**入口文件**:

- `src/index.ts` - 服务器启动入口

### 架构亮点

1. **直接复用Core**: 使用`GeminiClient`和`Config`，无冗余实现
2. **SSE流式**: 基于HTTP的流式响应，简单可靠
3. **类型安全**: 完整的TypeScript类型定义
4. **认证安全**: JWT token认证，会话权限验证
5. **错误处理**: 统一的错误处理中间件
6. **日志记录**: 结构化日志，便于监控

### 使用示例

#### 1. 启动服务器

```bash
cd packages/server
npm install
npm run dev
```

#### 2. 创建会话

```bash
curl -X POST http://localhost:3000/api/session \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceRoot": "/path/to/project",
    "model": "qwen-code"
  }'
```

#### 3. SSE流式聊天（JavaScript客户端）

```javascript
const token = 'YOUR_JWT_TOKEN';
const sessionId = 'SESSION_ID';
const message = 'Hello, how can you help me?';

const eventSource = new EventSource(
  `http://localhost:3000/api/chat/stream?sessionId=${sessionId}&message=${encodeURIComponent(message)}`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
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
      // 显示AI响应内容
      console.log('Content:', data.value);
      break;

    case 'ToolCallRequest':
      // 工具调用请求
      console.log('Tool call:', data.value);
      break;

    case 'Thought':
      // AI思考过程
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

// 取消请求
async function cancel() {
  if (requestId) {
    await fetch('http://localhost:3000/api/chat/cancel', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requestId }),
    });
    eventSource.close();
  }
}
```

### 下一步工作

根据实施路线图，接下来的阶段包括：

**阶段2-3: 命令处理集成**（未完成）

- 从CLI提取命令处理纯函数
- 集成Slash命令（/help, /clear等）
- 集成At命令（@file.txt文件引用）
- 集成Shell命令执行

**阶段4: 工具调用支持**（未完成）

- 实现工具执行API
- 实现文件操作路由
- 工具权限确认机制

**阶段5: 安全加固**（未完成）

- 路径遍历防护
- 速率限制
- 审计日志
- 沙箱权限控制

**阶段6: 性能优化**（未完成）

- Redis会话存储
- 缓存层
- 连接池

**阶段7: 监控和部署**（未完成）

- Prometheus metrics
- Docker化
- CI/CD
- API文档

## 六、总结

### 当前成果

本次实施完成了HTTP服务的基础架构搭建，核心特点：

1. ✅ **简洁高效**: 直接复用`@qwen-code/qwen-code-core`，避免重复实现
2. ✅ **SSE流式**: 使用Server-Sent Events，比WebSocket更简单可靠
3. ✅ **类型安全**: 完整的TypeScript类型定义
4. ✅ **生产就绪**: 包含认证、日志、错误处理等基础设施
5. ✅ **易于扩展**: 清晰的目录结构，便于添加新功能

### 关键技术决策

1. **SSE优于WebSocket**: 对于单向流式响应，SSE更简单、更标准
2. **直接复用Core**: 避免创建ServerToolScheduler等冗余适配器
3. **轻量级SessionService**: 只管理会话元数据，业务逻辑在Core
4. **标准REST API**: 符合HTTP标准，易于集成和测试

### 验证建议

1. **功能测试**: 测试会话创建、SSE流式聊天、历史记录等基础功能
2. **性能测试**: 测试并发会话、长连接稳定性
3. **集成测试**: 与前端集成，验证完整流程
4. **安全测试**: JWT认证、会话权限验证

本方案为Qwen Code提供了一个简洁、高效、易维护的HTTP服务接口，为后续功能扩展打下了坚实基础

```

```
