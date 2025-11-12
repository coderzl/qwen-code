/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { MessageItem } from './MessageItem.js';
import type { FrontendMessage } from '../../utils/protocolAdapter.js';

interface MessageListProps {
  messages: FrontendMessage[];
  enableTypingEffect?: boolean;
}

export function MessageList({
  messages,
  enableTypingEffect = true,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const prevMessagesLengthRef = useRef(messages.length);

  // 检查用户是否在底部附近（50px 范围内）
  const isNearBottom = () => {
    if (!containerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    return scrollHeight - scrollTop - clientHeight < 50;
  };

  // 监听滚动事件
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setShouldAutoScroll(isNearBottom());
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // 自动滚动到底部（仅在应该滚动时）
  useEffect(() => {
    const isNewMessage = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    // 如果有新消息且用户应该在底部，则自动滚动
    if (isNewMessage && shouldAutoScroll) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    } else if (isNewMessage) {
      // 有新消息但用户不在底部，更新状态以便下次自动滚动
      // 但这次不滚动，让用户继续查看历史消息
      setShouldAutoScroll(isNearBottom());
    }
  }, [messages, shouldAutoScroll]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
        <p>还没有消息，开始对话吧！</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin h-full"
    >
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          enableTypingEffect={enableTypingEffect}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
