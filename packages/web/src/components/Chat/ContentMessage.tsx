/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - react-markdown types compatibility issue
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTypingEffect } from '../../hooks/useTypingEffect.js';
import type { FrontendMessage } from '../../utils/protocolAdapter.js';
import { cn } from '../../utils/cn.js';

interface ContentMessageProps {
  message: FrontendMessage;
  enableTypingEffect?: boolean;
  isUserMessage?: boolean;
}

export function ContentMessage({
  message,
  enableTypingEffect = true,
  isUserMessage = false,
}: ContentMessageProps) {
  const displayedContent = useTypingEffect(message.content, {
    speed: 20,
    enabled:
      enableTypingEffect && message.status === 'generating' && !isUserMessage,
  });

  const isGenerating = message.status === 'generating' && !isUserMessage;

  if (isUserMessage) {
    // 用户消息样式
    return (
      <div className={cn('rounded-lg p-4', 'bg-blue-500 text-white')}>
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      </div>
    );
  }

  // 助手消息样式
  return (
    <div
      className={cn(
        'rounded-lg p-4',
        'bg-gray-50 dark:bg-gray-800',
        'border border-gray-200 dark:border-gray-700',
      )}
    >
      <div className="markdown-content prose prose-sm dark:prose-invert max-w-none">
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-ignore - react-markdown types compatibility issue */}
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {displayedContent || ''}
        </ReactMarkdown>
      </div>
      {isGenerating && (
        <span className="inline-block w-2 h-4 ml-1 bg-gray-400 dark:bg-gray-500 animate-pulse" />
      )}
    </div>
  );
}
