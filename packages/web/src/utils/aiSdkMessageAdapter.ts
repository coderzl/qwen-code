/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Message } from '@ai-sdk/react';
import type { FrontendMessage } from './protocolAdapter.js';

export type { FrontendMessage } from './protocolAdapter.js';

/**
 * 将 Vercel AI SDK 的 Message 格式转换为 FrontendMessage 格式
 */
export function adaptAISdkMessage(message: Message): FrontendMessage {
  return {
    id: message.id,
    type: 'content',
    content: message.content || '',
    timestamp: message.createdAt
      ? new Date(message.createdAt).getTime()
      : Date.now(),
    status: 'generated',
  };
}

/**
 * 将 Vercel AI SDK 的 Message[] 转换为 FrontendMessage[]
 */
export function adaptAISdkMessages(messages: Message[]): FrontendMessage[] {
  return messages.map(adaptAISdkMessage);
}
