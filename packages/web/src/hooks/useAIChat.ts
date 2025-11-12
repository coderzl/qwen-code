/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useChat } from '@ai-sdk/react';
import { useMemo, useState, useCallback } from 'react';
import { createAISdkFetch } from '../services/aiSdkAdapter.js';
import {
  adaptAISdkMessages,
  type FrontendMessage,
} from '../utils/aiSdkMessageAdapter.js';

export interface UseAIChatOptions {
  sessionId?: string;
  workspaceRoot?: string;
  model?: string;
  responseMode?: 'incremental' | 'full';
  baseUrl?: string;
}

/**
 * 使用 Vercel AI SDK 的 useChat hook
 * 适配后端协议到 Vercel AI SDK 格式
 */
export function useAIChat(options: UseAIChatOptions = {}) {
  const {
    sessionId: providedSessionId,
    workspaceRoot,
    model,
    responseMode = 'full',
    baseUrl: providedBaseUrl = '',
  } = options;

  // 在开发环境中，如果 baseUrl 为空，使用后端服务器地址
  // 在生产环境中，baseUrl 应该由环境变量或配置提供
  const baseUrl =
    providedBaseUrl ||
    (typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : '');

  // 自己管理 input 状态
  const [input, setInput] = useState('');

  // 创建自定义 fetch 函数
  const customFetch = useMemo(() => {
    const fetchFn = createAISdkFetch(baseUrl);
    console.log('[useAIChat] 创建自定义 fetch 函数, baseUrl:', baseUrl);
    // 包装一层，确保被调用
    return async (url: string, options?: RequestInit) => {
      console.log('[useAIChat] 自定义 fetch 被调用, url:', url);
      return fetchFn(url, options);
    };
  }, [baseUrl]);

  // 使用 Vercel AI SDK 的 useChat hook
  // 注意：Vercel AI SDK 可能不支持 fetch 参数，或者只在特定情况下使用
  // 我们需要使用绝对 URL 并确保它指向正确的后端
  const apiUrl = baseUrl
    ? `${baseUrl}/api/chat`
    : 'http://localhost:3000/api/chat';

  console.log('[useAIChat] 配置 useChat:');
  console.log('[useAIChat] apiUrl:', apiUrl);
  console.log('[useAIChat] baseUrl:', baseUrl);
  console.log('[useAIChat] customFetch:', typeof customFetch);

  const chatHelpers = useChat({
    // 使用绝对 URL，确保请求发送到正确的后端
    api: apiUrl,
    fetch: customFetch,
    body: {
      sessionId: providedSessionId,
      workspaceRoot,
      model,
      responseMode,
    },
    onResponse: (_response: Response) => {
      // 尝试从响应中提取 sessionId
      // 注意：sessionId 会在适配器的第一个 chunk 中返回
      console.log('[useAIChat] onResponse:', _response.url, _response.status);
    },
    onFinish: (_message: unknown) => {
      // 消息完成时的回调
      console.log('[useAIChat] Message finished');
    },
    onError: (error: unknown) => {
      console.error('[useAIChat] Chat error:', error);
    },
  });

  // 类型断言以访问实际存在的属性
  const typedChatHelpers = chatHelpers as unknown as {
    messages: Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      createdAt?: Date;
    }>;
    sendMessage: (message?: {
      role?: 'user' | 'assistant' | 'system';
      content?: string;
      [key: string]: unknown;
    }) => void;
    error: Error | undefined;
    setMessages: (
      messages:
        | Array<{
            id: string;
            role: 'user' | 'assistant' | 'system';
            content: string;
          }>
        | ((
            messages: Array<{
              id: string;
              role: 'user' | 'assistant' | 'system';
              content: string;
            }>,
          ) => Array<{
            id: string;
            role: 'user' | 'assistant' | 'system';
            content: string;
          }>),
    ) => void;
    stop: () => void;
    regenerate: () => void;
    status: 'idle' | 'in_progress' | 'error';
    clearError: () => void;
  };

  const {
    messages: aiMessages,
    sendMessage: aiSendMessage,
    error: aiError,
    setMessages: aiSetMessages,
    stop,
    status,
    regenerate,
  } = typedChatHelpers;

  const isLoading = status === 'in_progress';

  // 将 AI SDK 消息转换为 FrontendMessage 格式
  const messages: FrontendMessage[] = useMemo(() => {
    // 将消息格式转换为适配器期望的格式
    const adaptedMessages = aiMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content || '',
      createdAt: msg.createdAt,
    }));
    return adaptAISdkMessages(
      adaptedMessages as Array<{
        id: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        createdAt?: Date;
      }>,
    );
  }, [aiMessages]);

  // 实现 handleInputChange
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    [],
  );

  // 适配 handleSubmit
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (
        input.trim() &&
        aiSendMessage &&
        typeof aiSendMessage === 'function'
      ) {
        try {
          // 使用 sendMessage 发送消息
          aiSendMessage({
            role: 'user',
            content: input.trim(),
          });
          // 清空输入
          setInput('');
        } catch (error) {
          console.error('Failed to send message:', error);
        }
      }
    },
    [input, aiSendMessage],
  );

  // 适配 sendMessage（用于直接发送消息）
  const sendMessage = useCallback(
    (message: string) => {
      if (aiSendMessage && typeof aiSendMessage === 'function') {
        try {
          aiSendMessage({
            role: 'user',
            content: message,
          });
        } catch (error) {
          console.error('Failed to send message:', error);
        }
      } else {
        console.error('sendMessage is not available from useChat');
      }
    },
    [aiSendMessage],
  );

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    sendMessage,
    isLoading,
    error: aiError?.message || null,
    setMessages: aiSetMessages,
    reload: regenerate,
    cancel: stop,
    clear: () => aiSetMessages([]),
    isStreaming: isLoading,
    sessionId: providedSessionId || null,
  };
}
