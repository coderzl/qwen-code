/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FrontendMessage } from './protocolAdapter.js';

/**
 * 格式化时间戳
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 检查消息是否已完成
 */
export function isMessageComplete(message: FrontendMessage): boolean {
  return message.status === 'generated';
}

/**
 * 检查消息是否正在生成
 */
export function isMessageGenerating(message: FrontendMessage): boolean {
  return message.status === 'generating';
}

/**
 * 获取消息显示内容
 */
export function getMessageDisplayContent(message: FrontendMessage): string {
  if (message.type === 'content') {
    return message.content;
  }
  return message.content;
}

/**
 * 合并相同ID的消息（用于增量更新）
 */
export function mergeMessages(
  existing: FrontendMessage[],
  newMessages: FrontendMessage[],
): FrontendMessage[] {
  const messageMap = new Map<string, FrontendMessage>();

  // 先添加现有消息
  for (const msg of existing) {
    messageMap.set(msg.id, msg);
  }

  // 更新或添加新消息
  for (const msg of newMessages) {
    const existingMsg = messageMap.get(msg.id);
    if (existingMsg) {
      // 更新现有消息
      messageMap.set(msg.id, {
        ...existingMsg,
        ...msg,
        // 对于content类型，在增量模式下需要合并内容
        content:
          msg.type === 'content' && existingMsg.type === 'content'
            ? msg.content // 新消息已经包含累积内容
            : msg.content,
      });
    } else {
      // 添加新消息
      messageMap.set(msg.id, msg);
    }
  }

  return Array.from(messageMap.values()).sort(
    (a, b) => a.timestamp - b.timestamp,
  );
}
