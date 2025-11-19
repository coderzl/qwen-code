/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 后端流式响应格式
 */
export interface StreamResponse {
  sessionId: string;
  messageId: string;
  msgStatus: 'generating' | 'finished';
  messages: StreamMessage[];
}

/**
 * 后端流式消息格式
 */
export interface StreamMessage {
  type: string;
  value: unknown;
  timestamp: number;
  id: string;
  status: 'generating' | 'generated';
}

/**
 * 前端消息类型
 */
export type FrontendMessageType =
  | 'content'
  | 'tool_call_request'
  | 'tool_execution_start'
  | 'tool_execution_complete'
  | 'tool_execution_error'
  | 'tool_call_group' // 聚合的工具调用组
  | 'file_references'
  | 'warning'
  | 'error';

/**
 * 工具调用信息
 */
export interface ToolCallInfo {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  description?: string;
  icon?: string;
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  toolCall: ToolCallInfo;
  result?: unknown;
  error?: string;
}

/**
 * 工具调用组（聚合多个工具调用阶段）
 */
export interface ToolCallGroup {
  callId: string;
  toolName: string;
  status: 'requested' | 'executing' | 'completed' | 'error';
  // 各个阶段的消息
  request?: FrontendMessage; // tool_call_request
  executionStart?: FrontendMessage; // tool_execution_start
  executionComplete?: FrontendMessage; // tool_execution_complete
  executionError?: FrontendMessage; // tool_execution_error
  // 时间戳（使用最早的时间戳）
  timestamp: number;
}

/**
 * 前端消息格式
 */
export interface FrontendMessage {
  id: string;
  type: FrontendMessageType;
  content: string;
  timestamp: number;
  status: 'generating' | 'generated';
  // 工具调用相关
  toolCall?: ToolCallInfo;
  toolExecution?: ToolExecutionResult;
  // 工具调用组（聚合后的工具调用）
  toolCallGroup?: ToolCallGroup;
  // 文件引用相关
  fileReferences?: Array<{ path: string; size: number }>;
}

/**
 * 协议适配器
 * 将后端协议转换为前端友好的格式
 */
export class ProtocolAdapter {
  private contentBuffer: Map<string, string> = new Map();

  /**
   * 重置内容缓冲区
   */
  reset(): void {
    this.contentBuffer.clear();
  }

  /**
   * 适配流式响应消息
   */
  adaptStreamResponse(
    response: StreamResponse,
    responseMode: 'incremental' | 'full' = 'incremental',
  ): FrontendMessage[] {
    const adaptedMessages: FrontendMessage[] = [];
    const toolCallGroups = new Map<string, ToolCallGroup>();

    // 第一步：适配所有消息
    for (const message of response.messages) {
      const adapted = this.adaptMessage(message, responseMode);
      if (adapted) {
        // 如果是工具调用相关消息，尝试聚合
        if (
          adapted.type === 'tool_call_request' ||
          adapted.type === 'tool_execution_start' ||
          adapted.type === 'tool_execution_complete' ||
          adapted.type === 'tool_execution_error'
        ) {
          const callId = adapted.toolCall?.callId;
          if (callId) {
            // 获取或创建工具调用组
            let group = toolCallGroups.get(callId);
            if (!group) {
              group = {
                callId,
                toolName: adapted.toolCall?.name || 'Unknown',
                status: 'requested',
                timestamp: adapted.timestamp,
              };
              toolCallGroups.set(callId, group);
            }

            // 更新组的状态和消息
            if (adapted.type === 'tool_call_request') {
              group.request = adapted;
              group.status = 'requested';
            } else if (adapted.type === 'tool_execution_start') {
              group.executionStart = adapted;
              group.status = 'executing';
            } else if (adapted.type === 'tool_execution_complete') {
              group.executionComplete = adapted;
              group.status = 'completed';
            } else if (adapted.type === 'tool_execution_error') {
              group.executionError = adapted;
              group.status = 'error';
            }

            // 更新时间戳（使用最早的）
            if (adapted.timestamp < group.timestamp) {
              group.timestamp = adapted.timestamp;
            }
          } else {
            // 没有callId，直接添加
            adaptedMessages.push(adapted);
          }
        } else {
          // 非工具调用消息，直接添加
          adaptedMessages.push(adapted);
        }
      }
    }

    // 第二步：将工具调用组转换为聚合消息
    for (const group of Array.from(toolCallGroups.values())) {
      const groupMessage: FrontendMessage = {
        id: `tool-group-${group.callId}`,
        type: 'tool_call_group',
        content: `工具调用: ${group.toolName}`,
        timestamp: group.timestamp,
        status: 'generated',
        toolCallGroup: group,
      };
      adaptedMessages.push(groupMessage);
    }

    // 第三步：按时间戳排序
    adaptedMessages.sort((a, b) => a.timestamp - b.timestamp);

    return adaptedMessages;
  }

  /**
   * 适配单条消息
   */
  private adaptMessage(
    message: StreamMessage,
    responseMode: 'incremental' | 'full',
  ): FrontendMessage | null {
    // 验证消息格式
    if (!message.id || !message.type || typeof message.timestamp !== 'number') {
      console.warn('Invalid message format:', message);
      return null;
    }

    const baseMessage: FrontendMessage = {
      id: message.id,
      type: message.type as FrontendMessageType,
      content: '',
      timestamp: message.timestamp,
      status: message.status || 'generated',
    };

    switch (message.type) {
      case 'content': {
        // 处理content消息
        let content: string;
        if (responseMode === 'incremental') {
          // 增量模式：累积内容
          // 注意：在增量模式下，message.value只包含新增的片段
          const current = this.contentBuffer.get(message.id) || '';
          const incremental = (message.value as string) || '';
          content = current + incremental;
          this.contentBuffer.set(message.id, content);
        } else {
          // 全量模式：直接使用value（已经包含完整内容）
          content = (message.value as string) || '';
          this.contentBuffer.set(message.id, content);
        }
        return {
          ...baseMessage,
          content,
        };
      }

      case 'tool_call_request': {
        // 工具调用请求
        const toolCall = message.value as ToolCallInfo;
        return {
          ...baseMessage,
          content: `调用工具: ${toolCall.name}`,
          toolCall,
        };
      }

      case 'tool_execution_start': {
        // 工具执行开始
        const toolCall = message.value as ToolCallInfo;
        return {
          ...baseMessage,
          content: `执行工具: ${toolCall.name}`,
          toolCall,
        };
      }

      case 'tool_execution_complete': {
        // 工具执行完成
        const value = message.value as {
          toolCall?: ToolCallInfo;
          result?: unknown;
        };
        const toolCall = value.toolCall || (message.value as ToolCallInfo);
        return {
          ...baseMessage,
          content: `工具执行完成: ${toolCall.name}`,
          toolExecution: {
            toolCall,
            result: value.result,
          },
          toolCall,
        };
      }

      case 'tool_execution_error': {
        // 工具执行错误
        const value = message.value as {
          toolCall?: ToolCallInfo;
          error?: string;
        };
        const toolCall = value.toolCall || (message.value as ToolCallInfo);
        return {
          ...baseMessage,
          content: `工具执行错误: ${value.error || 'Unknown error'}`,
          toolExecution: {
            toolCall,
            error: value.error,
          },
          toolCall,
        };
      }

      case 'file_references': {
        // 文件引用
        const files = (
          message.value as { files: Array<{ path: string; size: number }> }
        ).files;
        return {
          ...baseMessage,
          content: `引用了 ${files.length} 个文件`,
          fileReferences: files,
        };
      }

      case 'warning':
      case 'error': {
        // 警告或错误
        const content =
          typeof message.value === 'string'
            ? message.value
            : (message.value as { message?: string }).message || 'Unknown';
        return {
          ...baseMessage,
          content,
        };
      }

      default:
        // 未知类型，尝试转换为字符串
        return {
          ...baseMessage,
          content: String(message.value || ''),
        };
    }
  }

  /**
   * 获取累积的内容（用于调试）
   */
  getAccumulatedContent(messageId: string): string {
    return this.contentBuffer.get(messageId) || '';
  }
}
