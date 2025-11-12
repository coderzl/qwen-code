/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef } from 'react';
import { useChatStore } from '../stores/chatStore.js';
import { chatService } from '../services/chatService.js';
import {
  ProtocolAdapter,
  type FrontendMessage,
} from '../utils/protocolAdapter.js';
import type { StreamResponse } from '../utils/protocolAdapter.js';
import type { ChatStreamRequest } from '../services/chatService.js';

export interface UseChatStreamOptions {
  responseMode?: 'incremental' | 'full';
  workspaceRoot?: string;
  model?: string;
}

export function useChatStream(options: UseChatStreamOptions = {}) {
  const {
    messages,
    currentSessionId,
    isStreaming,
    error,
    addMessages,
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

  return {
    messages,
    sendMessage,
    cancel,
    clear,
    isStreaming,
    error,
    sessionId: currentSessionId,
  };
}
