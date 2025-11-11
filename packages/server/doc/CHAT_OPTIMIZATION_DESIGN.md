# Chat接口优化设计方案

## 需求概述

1. **支持全量/增量回复模式**
   - 增量模式（默认）：每次只返回新增的消息
   - 全量模式：每次返回所有历史消息的完整列表

2. **消息结构优化**
   - 返回格式改为数组
   - 每条消息增加 `id` 字段
   - 每条消息增加 `status` 字段（生成中/生成完成）

## 请求参数设计

```typescript
interface ChatStreamRequest {
  sessionId?: string; // 会话ID（可选）
  messageId?: string; // 消息ID（可选，用于标识本次请求）
  message: string; // 用户消息（必需）
  workspaceRoot?: string; // 工作空间根目录（可选）
  model?: string; // 模型名称（可选）
  responseMode?: 'incremental' | 'full'; // 响应模式（可选，默认'incremental'）
}
```

## 响应格式设计

### 增量模式（responseMode: 'incremental'）

每次只发送新生成的消息：

```json
{
  "sessionId": "5524451f-b9f0-43dd-99d0-5cb69bba240e",
  "messageId": "dsdadfad121-121212",
  "msgStatus": "generating",
  "messages": [
    {
      "type": "content",
      "value": "I'll analyze",
      "timestamp": 1762868952963,
      "id": "dsdadfad121-121212-0",
      "status": "generating"
    }
  ]
}
```

后续更新：

```json
{
  "sessionId": "5524451f-b9f0-43dd-99d0-5cb69bba240e",
  "messageId": "dsdadfad121-121212",
  "msgStatus": "generating",
  "messages": [
    {
      "type": "content",
      "value": " the current project for you.",
      "timestamp": 1762868952963,
      "id": "dsdadfad121-121212-0",
      "status": "generated"
    }
  ]
}
```

后续更新：

```json
{
  "sessionId": "5524451f-b9f0-43dd-99d0-5cb69bba240e",
  "messageId": "dsdadfad121-121212",
  "msgStatus": "finished",
  "messages": [
    {
      "type": "tool_call_request",
      "value": {...},
      "timestamp": 1762868954357,
      "id": "dsdadfad121-121212-1",
      "status": "generated"
    }
  ]
}
```

### 全量模式（responseMode: 'full'）

每次发送所有消息的完整列表：

```json
{
  "sessionId": "5524451f-b9f0-43dd-99d0-5cb69bba240e",
  "messageId": "dsdadfad121-121212",
  "msgStatus": "generating",
  "messages": [
    {
      "type": "content",
      "value": "I'll analyze ",
      "timestamp": 1762868952963,
      "id": "dsdadfad121-121212-0",
      "status": "generating"
    }
  ]
}
```

后续更新

```json
{
  "sessionId": "5524451f-b9f0-43dd-99d0-5cb69bba240e",
  "messageId": "dsdadfad121-121212",
  "msgStatus": "generating",
  "messages": [
    {
      "type": "content",
      "value": "I'll analyze the current project for you.",
      "timestamp": 1762868952963,
      "id": "dsdadfad121-121212-0",
      "status": "generated"
    }
  ]
}
```

```json
{
  "sessionId": "5524451f-b9f0-43dd-99d0-5cb69bba240e",
  "messageId": "dsdadfad121-121212",
  "msgStatus": "finished",
  "messages": [
    {
      "type": "content",
      "value": "I'll analyze the current project for you.",
      "timestamp": 1762868952963,
      "id": "dsdadfad121-121212-0",
      "status": "generated"
    },
    {
      "type": "tool_call_request",
      "value": {...},
      "timestamp": 1762868954357,
      "id": "dsdadfad121-121212-1",
      "status": "generated"
    }
  ]
}
```

## 消息状态定义

### 整个请求的状态

- **`generating`**: 消息正在生成中（流式输出过程中）
- **`finished`**: 当前这次SSE请求所有消息都生成完成

### message元素

- **`generating`**: 消息正在生成中（流式输出过程中）
- **`generated`**: 消息生成完成（流式输出结束）

## 消息ID生成规则

1. 如果请求提供了 `messageId`，使用格式：`{messageId}-{index}`
2. 如果请求未提供 `messageId`，使用格式：`{requestId}-{index}`
3. `index` 从0开始递增，每个新消息分配一个唯一的index

## 实现细节

### 1. 消息管理

维护一个消息列表，用于：

- 增量模式：只发送新增或更新的消息（content类型只发送增量内容）
- 全量模式：每次发送完整列表（content类型累积全量内容）

```typescript
interface StreamMessage {
  type: string;
  value: unknown;
  timestamp: number;
  id: string;
  status: 'generating' | 'generated';
}

interface StreamResponse {
  sessionId: string;
  messageId: string;
  msgStatus: 'generating' | 'finished';
  messages: StreamMessage[];
}

class MessageCollector {
  private messages: StreamMessage[] = [];
  private messageIdPrefix: string;
  private responseMode: 'incremental' | 'full';
  private lastSentIndex: number = -1; // 用于增量模式，记录上次发送的最后一条消息索引
  private currentContentMessage: StreamMessage | null = null; // 当前正在累积的content消息
  private currentContentValue: string = ''; // 累积的content内容（仅用于全量模式）

  constructor(
    messageId: string,
    responseMode: 'incremental' | 'full' = 'incremental',
  ) {
    this.messageIdPrefix = messageId;
    this.responseMode = responseMode;
  }

  /**
   * 添加或更新content消息（流式内容）
   * 增量模式：每次只发送新增的内容片段
   * 全量模式：累积内容，每次发送完整内容
   */
  appendContent(
    incrementalValue: string,
    isComplete: boolean = false,
  ): StreamMessage {
    if (this.currentContentMessage === null) {
      // 创建新的content消息
      const id = `${this.messageIdPrefix}-${this.messages.length}`;
      this.currentContentMessage = {
        type: 'content',
        value: this.responseMode === 'incremental' ? incrementalValue : '',
        timestamp: Date.now(),
        id,
        status: isComplete ? 'generated' : 'generating',
      };
      this.messages.push(this.currentContentMessage);
      this.currentContentValue = incrementalValue;

      if (this.responseMode === 'full') {
        // 全量模式：value包含累积的完整内容
        this.currentContentMessage.value = this.currentContentValue;
      }

      return this.currentContentMessage;
    } else {
      // 更新现有的content消息
      this.currentContentValue += incrementalValue;

      if (this.responseMode === 'incremental') {
        // 增量模式：只更新value为新增的内容片段
        this.currentContentMessage.value = incrementalValue;
      } else {
        // 全量模式：更新value为累积的完整内容
        this.currentContentMessage.value = this.currentContentValue;
      }

      this.currentContentMessage.status = isComplete
        ? 'generated'
        : 'generating';
      this.currentContentMessage.timestamp = Date.now();

      return this.currentContentMessage;
    }
  }

  /**
   * 完成当前content消息（收到Finished事件时调用）
   */
  completeContentMessage(): void {
    if (this.currentContentMessage) {
      this.currentContentMessage.status = 'generated';
      this.currentContentMessage = null;
      this.currentContentValue = '';
    }
  }

  /**
   * 添加新消息（非content类型）
   */
  addMessage(
    type: string,
    value: unknown,
    status: 'generating' | 'generated' = 'generating',
  ): StreamMessage {
    // 如果当前有未完成的content消息，先完成它
    if (
      this.currentContentMessage &&
      this.currentContentMessage.status === 'generating'
    ) {
      this.completeContentMessage();
    }

    const id = `${this.messageIdPrefix}-${this.messages.length}`;
    const message: StreamMessage = {
      type,
      value,
      timestamp: Date.now(),
      id,
      status,
    };
    this.messages.push(message);
    return message;
  }

  /**
   * 更新最后一条消息的状态
   */
  updateLastMessageStatus(status: 'generating' | 'generated'): void {
    if (this.messages.length > 0) {
      this.messages[this.messages.length - 1].status = status;
      this.messages[this.messages.length - 1].timestamp = Date.now();
    }
  }

  /**
   * 获取要发送的消息列表
   * 增量模式：只返回新增或更新的消息
   * 全量模式：返回所有消息
   */
  getMessagesToSend(): StreamMessage[] {
    if (this.responseMode === 'full') {
      return this.messages;
    } else {
      // 增量模式：返回自上次发送后新增或更新的消息
      const newMessages = this.messages.slice(this.lastSentIndex + 1);
      this.lastSentIndex = this.messages.length - 1;
      return newMessages;
    }
  }

  /**
   * 获取所有消息（用于调试或历史记录）
   */
  getAllMessages(): StreamMessage[] {
    return this.messages;
  }

  /**
   * 检查是否所有消息都已完成
   */
  isAllComplete(): boolean {
    return this.messages.every((msg) => msg.status === 'generated');
  }
}
```

### 2. 流式事件处理

对于不同类型的事件：

1. **Content事件**（流式文本输出）：
   - **增量模式**：
     - 每次收到content片段，调用 `appendContent(incrementalValue, false)`
     - 只发送新增的内容片段（value = incrementalValue）
     - status保持为'generating'
   - **全量模式**：
     - 每次收到content片段，调用 `appendContent(incrementalValue, false)`
     - 发送累积的完整内容（value = 所有累积的内容）
     - status保持为'generating'
   - **完成时**：
     - 收到Finished事件，调用 `completeContentMessage()`
     - status更新为'generated'
     - 发送最后一条更新

2. **ToolCallRequest事件**：
   - 创建新消息：`addMessage('tool_call_request', toolCallValue, 'generating')`
   - 立即发送（status='generating'）
   - 发送后更新status='generated'（可选，因为工具调用请求通常立即完成）

3. **ToolExecution事件**：
   - **开始**：`addMessage('tool_execution_start', toolCallInfo, 'generating')`
   - **完成**：`addMessage('tool_execution_complete', toolResult, 'generated')`
   - 或者更新最后一条消息的状态

4. **Finished事件**：
   - 完成当前content消息（如果存在）
   - 设置msgStatus='finished'
   - 发送最后一条更新

### 3. 状态更新时机

#### 消息状态（message.status）

- **generating**:
  - Content事件流式输出过程中（每次收到content片段）
  - ToolCallRequest刚创建时
  - ToolExecution执行过程中

- **generated**:
  - Content事件流式输出完成（收到Finished事件，调用completeContentMessage）
  - ToolCallRequest创建后（通常立即完成）
  - ToolExecution执行完成后

#### 请求状态（msgStatus）

- **generating**:
  - 从请求开始到所有消息生成完成
  - 只要还有任何消息的status='generating'，msgStatus='generating'

- **finished**:
  - 所有消息的status都变为'generated'
  - 收到Finished事件且所有消息都完成
  - 这是最后一次SSE事件

### 4. 响应构建

每次发送SSE事件时，构建响应对象：

```typescript
function buildResponse(
  sessionId: string,
  messageId: string,
  collector: MessageCollector,
): StreamResponse {
  const messages = collector.getMessagesToSend();
  const msgStatus = collector.isAllComplete() ? 'finished' : 'generating';

  return {
    sessionId,
    messageId,
    msgStatus,
    messages,
  };
}
```

### 5. 完整流程示例

#### 增量模式流程

```typescript
// 1. 初始化
const collector = new MessageCollector(messageId, 'incremental');
let msgStatus = 'generating';

// 2. 收到Content事件（第一次）
collector.appendContent("I'll", false);
sendSSE(buildResponse(sessionId, messageId, collector));
// 发送: {msgStatus: "generating", messages: [{type: "content", value: "I'll", status: "generating", ...}]}

// 3. 收到Content事件（第二次）
collector.appendContent(' analyze', false);
sendSSE(buildResponse(sessionId, messageId, collector));
// 发送: {msgStatus: "generating", messages: [{type: "content", value: " analyze", status: "generating", ...}]}

// 4. Content完成
collector.completeContentMessage();
sendSSE(buildResponse(sessionId, messageId, collector));
// 发送: {msgStatus: "generating", messages: [{type: "content", value: " analyze", status: "generated", ...}]}

// 5. 收到ToolCallRequest
collector.addMessage('tool_call_request', toolCallValue, 'generated');
sendSSE(buildResponse(sessionId, messageId, collector));
// 发送: {msgStatus: "generating", messages: [{type: "tool_call_request", value: {...}, status: "generated", ...}]}

// 6. 所有消息完成
sendSSE(buildResponse(sessionId, messageId, collector));
// 发送: {msgStatus: "finished", messages: []} 或包含最后更新的消息
```

#### 全量模式流程

```typescript
// 1. 初始化
const collector = new MessageCollector(messageId, 'full');

// 2. 收到Content事件（第一次）
collector.appendContent("I'll", false);
sendSSE(buildResponse(sessionId, messageId, collector));
// 发送: {msgStatus: "generating", messages: [{type: "content", value: "I'll", status: "generating", ...}]}

// 3. 收到Content事件（第二次）
collector.appendContent(' analyze', false);
sendSSE(buildResponse(sessionId, messageId, collector));
// 发送: {msgStatus: "generating", messages: [{type: "content", value: "I'll analyze", status: "generating", ...}]}

// 4. Content完成
collector.completeContentMessage();
sendSSE(buildResponse(sessionId, messageId, collector));
// 发送: {msgStatus: "generating", messages: [{type: "content", value: "I'll analyze", status: "generated", ...}]}

// 5. 收到ToolCallRequest
collector.addMessage('tool_call_request', toolCallValue, 'generated');
sendSSE(buildResponse(sessionId, messageId, collector));
// 发送: {msgStatus: "generating", messages: [
//   {type: "content", value: "I'll analyze", status: "generated", ...},
//   {type: "tool_call_request", value: {...}, status: "generated", ...}
// ]}

// 6. 所有消息完成
sendSSE(buildResponse(sessionId, messageId, collector));
// 发送: {msgStatus: "finished", messages: [所有消息的完整列表]}
```

### 6. 关键实现细节

#### Content消息的增量处理

**增量模式下的特殊处理**：

- Content消息在流式输出过程中，每次只发送新增的片段
- 客户端需要维护一个累积缓冲区：`accumulatedContent[messageId] += message.value`
- 当status变为'generated'时，表示这条content消息已完成，客户端可以停止累积

**示例**：

```typescript
// 客户端代码示例（增量模式）
const contentBuffer: Record<string, string> = {};

function handleMessage(message: StreamMessage) {
  if (message.type === 'content') {
    if (message.status === 'generating') {
      // 累积内容
      contentBuffer[message.id] =
        (contentBuffer[message.id] || '') + message.value;
      displayContent(contentBuffer[message.id]);
    } else if (message.status === 'generated') {
      // 完成累积
      contentBuffer[message.id] =
        (contentBuffer[message.id] || '') + message.value;
      displayContent(contentBuffer[message.id]);
      // 可选：标记为完成
    }
  }
}
```

#### 消息发送逻辑

```typescript
function sendStreamUpdate(
  reply: FastifyReply,
  sessionId: string,
  messageId: string,
  collector: MessageCollector,
): void {
  const response: StreamResponse = {
    sessionId,
    messageId,
    msgStatus: collector.isAllComplete() ? 'finished' : 'generating',
    messages: collector.getMessagesToSend(),
  };

  reply.raw.write(`data: ${JSON.stringify(response)}\n\n`);

  if (reply.raw.flush) {
    reply.raw.flush();
  }
}
```

#### 工具调用循环中的消息管理

在工具调用循环中，需要正确处理消息状态：

```typescript
// 工具调用开始
collector.addMessage('tool_execution_start', toolCallInfo, 'generating');
sendStreamUpdate(reply, sessionId, messageId, collector);

// 工具执行中...
// 可以发送进度更新（如果需要）

// 工具执行完成
collector.addMessage('tool_execution_complete', toolResult, 'generated');
sendStreamUpdate(reply, sessionId, messageId, collector);

// 继续下一轮循环，发送工具结果给模型
// 新的content消息会创建新的消息ID
```

### 7. 兼容性考虑

- **默认使用增量模式**：保持向后兼容，现有客户端可以忽略新字段
- **向后兼容**：如果客户端不支持新格式，可以忽略id、status、msgStatus字段
- **SSE格式不变**：保持 `data: {json}\n\n` 格式，只是data字段的内容结构改变
- **可选参数**：messageId和responseMode都是可选的，默认行为与当前一致
- **渐进增强**：客户端可以选择性地使用新特性，不影响基本功能

## 实现要点总结

### 1. Content消息处理

- **增量模式**：
  - `value`字段只包含本次新增的内容片段
  - 客户端需要自己累积内容：`fullContent += message.value`
  - 适合实时显示，减少网络传输

- **全量模式**：
  - `value`字段包含累积的完整内容
  - 客户端直接使用`value`即可
  - 适合需要完整历史的场景

### 2. 状态管理

- **msgStatus**：整个请求的状态
  - `generating`：还有消息在生成中
  - `finished`：所有消息都已完成（最后一次SSE事件）

- **message.status**：单条消息的状态
  - `generating`：消息正在生成
  - `generated`：消息生成完成

### 3. 消息ID规则

- 格式：`{messageId}-{index}`
- 如果没有提供messageId，使用requestId
- index从0开始，每个新消息递增

### 4. 发送策略

- **增量模式**：
  - 只发送新增或更新的消息
  - Content消息每次只发送增量片段
  - 最后发送一次空数组或包含最后更新的消息

- **全量模式**：
  - 每次发送所有消息的完整列表
  - Content消息每次发送累积的完整内容
  - 最后发送一次包含所有消息的完整列表

## 优势

1. **增量模式**：
   - 减少网络传输（只发送增量内容）
   - 适合实时显示（客户端可以逐字显示）
   - 降低服务器内存压力

2. **全量模式**：
   - 客户端无需维护状态
   - 适合需要完整历史的场景
   - 简化客户端实现

3. **消息ID**：
   - 便于客户端追踪和去重
   - 支持消息的更新和替换

4. **状态字段**：
   - 客户端可以显示加载状态
   - 区分生成中和已完成的消息

5. **msgStatus字段**：
   - 客户端可以知道整个请求是否完成
   - 便于显示整体进度

## 边界情况处理

### 1. 空消息数组

- **增量模式**：
  - 当msgStatus='finished'时，messages可能为空数组
  - 这表示没有新消息，只是状态更新（从generating变为finished）
  - 客户端应该根据msgStatus判断请求是否完成

- **全量模式**：
  - 当msgStatus='finished'时，messages应该包含所有消息的完整列表
  - 即使没有新消息，也要发送完整列表以保持一致性

### 2. Content消息为空

- 如果content消息的value为空字符串，仍然应该发送
- 客户端可以根据id判断是否是同一条消息的更新

### 3. 工具调用失败

- 工具执行失败时，应该创建错误消息
- status设置为'generated'（因为已经完成，只是结果失败）
- value包含错误信息

### 4. 并发工具调用

- 多个工具并发执行时，每个工具创建独立的消息
- 消息ID按创建顺序递增
- 状态独立管理

## 注意事项

1. **消息ID唯一性**：需要保证在同一请求内唯一
2. **状态更新及时性**：状态更新需要及时，避免客户端显示错误状态
3. **全量模式性能**：全量模式可能产生较大的数据量，需要注意性能
4. **向后兼容**：默认使用增量模式，保持向后兼容
5. **Content累积**：增量模式下，客户端需要自己累积content内容
6. **空消息数组**：当msgStatus='finished'时，增量模式下messages可能为空数组
7. **时间戳更新**：每次更新消息时，需要更新timestamp字段
8. **消息顺序**：消息按照创建顺序分配ID，保证顺序性
9. **状态一致性**：msgStatus应该与所有消息的status保持一致
10. **错误处理**：工具执行失败时，应该创建错误消息而不是静默失败

## 客户端实现建议

### 1. 消息状态管理

客户端应该维护一个消息状态映射：

```typescript
interface ClientMessageState {
  id: string;
  type: string;
  value: unknown;
  status: 'generating' | 'generated';
  accumulatedContent?: string; // 仅用于增量模式的content消息
}

const messageState: Map<string, ClientMessageState> = new Map();

function handleStreamMessage(response: StreamResponse) {
  for (const message of response.messages) {
    if (message.type === 'content' && responseMode === 'incremental') {
      // 增量模式：累积content
      const existing = messageState.get(message.id);
      if (existing) {
        existing.accumulatedContent =
          (existing.accumulatedContent || '') + message.value;
        existing.status = message.status;
        existing.value = existing.accumulatedContent; // 用于显示
      } else {
        messageState.set(message.id, {
          ...message,
          accumulatedContent: message.value as string,
          value: message.value,
        });
      }
    } else {
      // 全量模式或其他类型消息：直接更新
      messageState.set(message.id, message as ClientMessageState);
    }
  }

  // 根据msgStatus判断是否完成
  if (response.msgStatus === 'finished') {
    // 请求完成，可以清理或保存状态
  }
}
```

### 2. 消息去重

使用消息ID进行去重：

```typescript
const processedMessageIds = new Set<string>();

function handleMessage(message: StreamMessage) {
  if (processedMessageIds.has(message.id)) {
    // 更新现有消息
    updateMessage(message);
  } else {
    // 新消息
    processedMessageIds.add(message.id);
    addMessage(message);
  }
}
```

### 3. 状态显示

根据status和msgStatus显示不同的UI状态：

```typescript
function getMessageDisplayStatus(
  message: ClientMessageState,
  msgStatus: string,
) {
  if (msgStatus === 'finished' && message.status === 'generated') {
    return 'completed';
  }
  if (message.status === 'generating') {
    return 'loading';
  }
  return 'ready';
}
```

### 4. 性能优化

- **增量模式**：适合实时显示，减少内存占用
- **全量模式**：适合需要完整历史的场景，但要注意大消息列表的性能
- **消息缓存**：客户端可以缓存已处理的消息，避免重复渲染
