/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ChatStreamRequest {
  sessionId?: string;
  messageId?: string;
  message: string;
  workspaceRoot?: string;
  model?: string;
  responseMode?: 'incremental' | 'full';
}

export interface ChatStreamOptions {
  onMessage?: (data: unknown) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  signal?: AbortSignal;
}

/**
 * Chat API服务
 */
export class ChatService {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * 发送消息并接收流式响应
   */
  async streamMessage(
    request: ChatStreamRequest,
    options: ChatStreamOptions = {},
  ): Promise<void> {
    const { onMessage, onError, onComplete, signal } = options;

    try {
      const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal,
      });

      if (!response.ok) {
        // 尝试解析错误响应
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          } else if (typeof errorData === 'string') {
            errorMessage = errorData;
          }
        } catch {
          // 如果无法解析JSON，使用默认错误消息
        }
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (signal?.aborted) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        for (const line of lines) {
          if (line.trim() === '') {
            continue; // 跳过空行
          }
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6).trim();
              if (jsonStr) {
                const data = JSON.parse(jsonStr);
                onMessage?.(data);
              }
            } catch (error) {
              console.error('Failed to parse SSE data:', error, 'Line:', line);
              // 不抛出错误，继续处理其他消息
            }
          } else if (line.startsWith('event: ')) {
            // 处理SSE事件类型（可选）
            const eventType = line.slice(7).trim();
            console.debug('SSE event type:', eventType);
          } else if (line.startsWith('id: ')) {
            // 处理SSE ID（可选）
            const eventId = line.slice(4).trim();
            console.debug('SSE event id:', eventId);
          }
        }
      }

      onComplete?.();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // 请求被取消，不视为错误
        return;
      }
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 获取历史记录
   */
  async getHistory(
    sessionId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/api/chat/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, limit, offset }),
    });

    if (!response.ok) {
      // 尝试解析错误响应
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // 如果无法解析JSON，使用默认错误消息
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }
}

// 在开发环境中，使用后端服务器地址
// 在生产环境中，baseUrl 应该由环境变量或配置提供
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // 开发环境：使用后端服务器地址
    if (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    ) {
      return 'http://localhost:3000';
    }
  }
  // 生产环境：使用相对路径（依赖代理或同域部署）
  return '';
};

export const chatService = new ChatService(getBaseUrl());
