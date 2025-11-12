/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 类型声明文件，用于 ai/react 模块
 * 由于 ai/react 的类型定义可能不完整，我们在这里提供补充类型
 */

declare module '@ai-sdk/react' {
  export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt?: Date;
  }

  export interface UseChatOptions {
    api?: string;
    fetch?: (url: string, options?: RequestInit) => Promise<Response>;
    body?: Record<string, unknown>;
    onResponse?: (response: Response) => void;
    onFinish?: (message: Message) => void;
    onError?: (error: Error) => void;
  }

  export interface UseChatReturn {
    messages: Message[];
    sendMessage: (message: {
      role: 'user' | 'assistant' | 'system';
      content: string;
    }) => void;
    error: Error | undefined;
    setMessages: (
      messages: Message[] | ((messages: Message[]) => Message[]),
    ) => void;
    stop: () => void;
    regenerate: () => void;
    status: 'idle' | 'in_progress' | 'error';
    clearError: () => void;
  }

  export function useChat(options?: UseChatOptions): UseChatReturn;
}
