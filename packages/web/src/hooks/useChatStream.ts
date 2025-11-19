/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chatStore.js';
import { chatService } from '../services/chatService.js';
import {
  ProtocolAdapter,
  type FrontendMessage,
  type FrontendMessageType,
  type ToolCallGroup,
  type ToolCallInfo,
} from '../utils/protocolAdapter.js';
import type { StreamResponse } from '../utils/protocolAdapter.js';
import type { ChatStreamRequest } from '../services/chatService.js';

export interface UseChatStreamOptions {
  responseMode?: 'incremental' | 'full';
  workspaceRoot?: string;
  model?: string;
  sessionId?: string;
}

export interface HistoryItem {
  id: number;
  type: 'user' | 'assistant' | 'system' | 'tool_group';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export function useChatStream(options: UseChatStreamOptions = {}) {
  const {
    messages,
    currentSessionId,
    isStreaming,
    error,
    addMessages,
    setMessages,
    setSessionId,
    setStreaming,
    setError,
    clearMessages,
  } = useChatStore();

  const adapterRef = useRef<ProtocolAdapter>(new ProtocolAdapter());
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (message: string, requestOptions?: Partial<ChatStreamRequest>) => {
      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // 创建新的AbortController
      abortControllerRef.current = new AbortController();

      // 重置适配器
      adapterRef.current.reset();

      setStreaming(true);
      setError(null);

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const request: ChatStreamRequest = {
        sessionId: currentSessionId || undefined,
        message,
        messageId,
        responseMode: options.responseMode || 'full',
        workspaceRoot: options.workspaceRoot,
        model: options.model,
        ...requestOptions,
      };

      // 添加用户消息到列表
      const userMessage: FrontendMessage = {
        id: `${messageId}-user`,
        type: 'content',
        content: message,
        timestamp: Date.now(),
        status: 'generated',
      };
      addMessages([userMessage]);

      try {
        await chatService.streamMessage(request, {
          onMessage: (data) => {
            try {
              // 处理connected事件（包含sessionId）
              if (typeof data === 'object' && data !== null) {
                const event = data as Record<string, unknown>;

                // 处理连接事件
                if (event.type === 'connected' && event.sessionId) {
                  setSessionId(event.sessionId as string);
                  return; // 连接事件不需要进一步处理
                }

                // 处理错误事件
                if (event.type === 'error') {
                  const errorMsg =
                    (event.error as string) ||
                    (event.message as string) ||
                    'Unknown error';
                  setError(errorMsg);
                  setStreaming(false);
                  return;
                }

                // 处理取消事件
                if (event.type === 'cancelled') {
                  setStreaming(false);
                  return;
                }

                // 处理StreamResponse格式
                if ('msgStatus' in event && 'messages' in event) {
                  const streamResponse = event as unknown as StreamResponse;

                  // 验证响应格式
                  if (
                    typeof streamResponse.sessionId === 'string' &&
                    typeof streamResponse.messageId === 'string' &&
                    Array.isArray(streamResponse.messages)
                  ) {
                    const adaptedMessages =
                      adapterRef.current.adaptStreamResponse(
                        streamResponse,
                        request.responseMode || 'full',
                      );
                    addMessages(adaptedMessages);

                    // 如果完成，停止流式状态
                    if (streamResponse.msgStatus === 'finished') {
                      setStreaming(false);
                    }
                  } else {
                    console.warn(
                      'Invalid StreamResponse format:',
                      streamResponse,
                    );
                  }
                }
              }
            } catch (error) {
              console.error('Error processing message:', error);
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : 'Failed to process message';
              setError(errorMessage);
              // 不中断流式处理，继续接收后续消息
            }
          },
          onError: (error) => {
            console.error('Chat stream error:', error);
            setError(error.message || '连接错误，请检查网络连接或服务器状态');
            setStreaming(false);
          },
          onComplete: () => {
            setStreaming(false);
          },
          signal: abortControllerRef.current.signal,
        });
      } catch (error) {
        console.error('Failed to send message:', error);
        setError(
          error instanceof Error ? error.message : 'Failed to send message',
        );
        setStreaming(false);
      }
    },
    [
      currentSessionId,
      options.responseMode,
      options.workspaceRoot,
      options.model,
      setSessionId,
      setStreaming,
      setError,
      addMessages,
    ],
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreaming(false);
  }, [setStreaming]);

  const clear = useCallback(() => {
    clearMessages();
    adapterRef.current.reset();
  }, [clearMessages]);

  const loadHistory = useCallback(
    async (sessionId: string) => {
      try {
        const response = (await chatService.getHistory(sessionId, 100, 0)) as {
          history: HistoryItem[];
          total: number;
        };

        // 将历史记录转换为FrontendMessage格式
        const historyMessages: FrontendMessage[] = [];
        const toolCallGroups = new Map<string, ToolCallGroup>();

        for (const item of response.history) {
          const messageId = `history-${item.id}`;
          if (item.type === 'user') {
            historyMessages.push({
              id: `${messageId}-user`,
              type: 'content',
              content: item.content,
              timestamp: item.timestamp,
              status: 'generated',
            });
          } else if (item.type === 'assistant') {
            // 添加助手文本消息
            historyMessages.push({
              id: messageId,
              type: 'content',
              content: item.content,
              timestamp: item.timestamp,
              status: 'generated',
            });

            // 从metadata中恢复工具调用信息
            if (item.metadata && Array.isArray(item.metadata.toolCalls)) {
              console.log(
                '[loadHistory] Found toolCalls in metadata:',
                item.metadata.toolCalls.length,
                'for assistant message',
                messageId,
              );
              const toolCalls = item.metadata.toolCalls as Array<{
                type: string;
                value: unknown;
                timestamp: number;
                id: string;
                status: string;
              }>;

              // 处理工具调用消息，按callId聚合
              for (const toolCallMsg of toolCalls) {
                console.log(
                  '[loadHistory] Processing toolCall message:',
                  toolCallMsg.type,
                  'id:',
                  toolCallMsg.id,
                );

                // toolCallMsg.value 可能是工具调用信息本身，需要正确解析
                let toolCall: {
                  callId?: string;
                  name?: string;
                  args?: Record<string, unknown>;
                  toolCall?: {
                    callId?: string;
                    name?: string;
                    args?: Record<string, unknown>;
                  };
                  result?: unknown;
                  error?: string;
                };

                // 根据消息类型解析value
                if (
                  toolCallMsg.type === 'tool_call_request' ||
                  toolCallMsg.type === 'tool_execution_start'
                ) {
                  // 这两种类型的value直接是工具调用信息
                  toolCall = toolCallMsg.value as {
                    callId?: string;
                    name?: string;
                    args?: Record<string, unknown>;
                  };
                } else if (
                  toolCallMsg.type === 'tool_execution_complete' ||
                  toolCallMsg.type === 'tool_execution_error'
                ) {
                  // 这两种类型的value包含toolCall和result/error
                  const value = toolCallMsg.value as {
                    toolCall?: {
                      callId?: string;
                      name?: string;
                      args?: Record<string, unknown>;
                    };
                    result?: unknown;
                    error?: string;
                  };
                  toolCall = {
                    toolCall: value.toolCall,
                    result: value.result,
                    error: value.error,
                  };
                } else {
                  // 其他类型，尝试直接解析
                  toolCall = toolCallMsg.value as {
                    callId?: string;
                    name?: string;
                    args?: Record<string, unknown>;
                    toolCall?: {
                      callId?: string;
                      name?: string;
                      args?: Record<string, unknown>;
                    };
                    result?: unknown;
                    error?: string;
                  };
                }

                const callId =
                  toolCall.callId ||
                  toolCall.toolCall?.callId ||
                  `history-${toolCallMsg.id}`;

                const toolName =
                  toolCall.name || toolCall.toolCall?.name || 'Unknown';
                console.log(
                  '[loadHistory] Extracted callId:',
                  callId,
                  'toolName:',
                  toolName,
                );

                // 获取或创建工具调用组
                let group = toolCallGroups.get(callId);
                if (!group) {
                  group = {
                    callId,
                    toolName,
                    status: 'requested',
                    timestamp: toolCallMsg.timestamp,
                  };
                  toolCallGroups.set(callId, group);
                  console.log(
                    '[loadHistory] Created new tool call group:',
                    callId,
                    toolName,
                  );
                }

                // 创建FrontendMessage格式的工具调用消息
                // 确定toolCall信息
                let toolCallInfo: ToolCallInfo | undefined;
                if (toolCall.callId) {
                  toolCallInfo = {
                    callId: toolCall.callId,
                    name: toolCall.name || 'Unknown',
                    args: toolCall.args || {},
                  };
                } else if (toolCall.toolCall) {
                  toolCallInfo = {
                    callId: toolCall.toolCall.callId || callId,
                    name: toolCall.toolCall.name || 'Unknown',
                    args: toolCall.toolCall.args || {},
                  };
                } else if (
                  toolCallMsg.type === 'tool_call_request' ||
                  toolCallMsg.type === 'tool_execution_start'
                ) {
                  // 对于这两种类型，value本身就是工具调用信息
                  const directToolCall = toolCallMsg.value as {
                    callId?: string;
                    name?: string;
                    args?: Record<string, unknown>;
                  };
                  toolCallInfo = {
                    callId: directToolCall.callId || callId,
                    name: directToolCall.name || 'Unknown',
                    args: directToolCall.args || {},
                  };
                }

                const frontendMsg: FrontendMessage = {
                  id: toolCallMsg.id,
                  type: toolCallMsg.type as FrontendMessageType,
                  content: '',
                  timestamp: toolCallMsg.timestamp,
                  status: toolCallMsg.status as 'generating' | 'generated',
                  toolCall: toolCallInfo,
                };

                // 根据类型更新组
                if (toolCallMsg.type === 'tool_call_request') {
                  group.request = frontendMsg;
                  group.status = 'requested';
                } else if (toolCallMsg.type === 'tool_execution_start') {
                  group.executionStart = frontendMsg;
                  group.status = 'executing';
                } else if (toolCallMsg.type === 'tool_execution_complete') {
                  // tool_execution_complete的value结构是 { toolCall: requestInfo, result: toolResponse }
                  const completeValue = toolCallMsg.value as {
                    toolCall?: {
                      callId?: string;
                      name?: string;
                      args?: Record<string, unknown>;
                    };
                    result?: unknown;
                  };

                  // 确保toolCall信息正确
                  if (!frontendMsg.toolCall && completeValue.toolCall) {
                    frontendMsg.toolCall = {
                      callId: completeValue.toolCall.callId || callId,
                      name: completeValue.toolCall.name || group.toolName,
                      args: completeValue.toolCall.args || {},
                    };
                  }

                  frontendMsg.toolExecution = {
                    toolCall: frontendMsg.toolCall || {
                      callId,
                      name: group.toolName,
                      args: {},
                    },
                    result: completeValue.result || toolCall.result,
                  };
                  group.executionComplete = frontendMsg;
                  group.status = 'completed';
                } else if (toolCallMsg.type === 'tool_execution_error') {
                  // tool_execution_error的value结构是 { toolCall: requestInfo, error: string }
                  const errorValue = toolCallMsg.value as {
                    toolCall?: {
                      callId?: string;
                      name?: string;
                      args?: Record<string, unknown>;
                    };
                    error?: string;
                  };

                  // 确保toolCall信息正确
                  if (!frontendMsg.toolCall && errorValue.toolCall) {
                    frontendMsg.toolCall = {
                      callId: errorValue.toolCall.callId || callId,
                      name: errorValue.toolCall.name || group.toolName,
                      args: errorValue.toolCall.args || {},
                    };
                  }

                  frontendMsg.toolExecution = {
                    toolCall: frontendMsg.toolCall || {
                      callId,
                      name: group.toolName,
                      args: {},
                    },
                    error: errorValue.error || toolCall.error,
                  };
                  group.executionError = frontendMsg;
                  group.status = 'error';
                }

                // 更新时间戳（使用最早的）
                if (toolCallMsg.timestamp < group.timestamp) {
                  group.timestamp = toolCallMsg.timestamp;
                }
              }
            }
          } else {
            // 处理其他类型（system, tool_group等）
            historyMessages.push({
              id: messageId,
              type: 'content',
              content: item.content,
              timestamp: item.timestamp,
              status: 'generated',
            });
          }
        }

        // 将工具调用组转换为聚合消息
        console.log(
          '[loadHistory] Tool call groups found:',
          toolCallGroups.size,
        );
        for (const group of Array.from(toolCallGroups.values())) {
          console.log(
            '[loadHistory] Creating tool_call_group message:',
            group.callId,
            group.toolName,
            group.status,
          );
          const groupMessage: FrontendMessage = {
            id: `tool-group-${group.callId}`,
            type: 'tool_call_group',
            content: `工具调用: ${group.toolName}`,
            timestamp: group.timestamp,
            status: 'generated',
            toolCallGroup: group,
          };
          historyMessages.push(groupMessage);
        }

        // 按时间戳排序
        historyMessages.sort((a, b) => a.timestamp - b.timestamp);

        console.log(
          '[loadHistory] Total messages after processing:',
          historyMessages.length,
        );
        console.log(
          '[loadHistory] Tool call group messages:',
          historyMessages.filter((m) => m.type === 'tool_call_group').length,
        );

        setMessages(historyMessages);
      } catch (err) {
        console.error('Failed to load history:', err);
        setError(err instanceof Error ? err.message : 'Failed to load history');
      }
    },
    [setMessages, setError],
  );

  const switchSession = useCallback(
    async (sessionId: string) => {
      setSessionId(sessionId);
      clearMessages();
      adapterRef.current.reset();
      await loadHistory(sessionId);
    },
    [setSessionId, clearMessages, loadHistory],
  );

  // 如果提供了sessionId选项，且与当前sessionId不同，切换session
  useEffect(() => {
    if (options.sessionId && options.sessionId !== currentSessionId) {
      switchSession(options.sessionId);
    }
  }, [options.sessionId, currentSessionId, switchSession]);

  return {
    messages,
    sendMessage,
    cancel,
    clear,
    isStreaming,
    error,
    sessionId: currentSessionId,
    loadHistory,
    switchSession,
  };
}
