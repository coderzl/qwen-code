/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FrontendMessage } from '../../utils/protocolAdapter.js';
import { ContentMessage } from './ContentMessage.js';
import { ToolCallMessage } from './ToolCallMessage.js';
import { formatTimestamp } from '../../utils/messageUtils.js';
import { cn } from '../../utils/cn.js';

interface MessageItemProps {
  message: FrontendMessage;
  enableTypingEffect?: boolean;
}

export function MessageItem({
  message,
  enableTypingEffect = true,
}: MessageItemProps) {
  const isContent = message.type === 'content';
  const isToolCall =
    message.type === 'tool_call_request' ||
    message.type === 'tool_execution_start' ||
    message.type === 'tool_execution_complete' ||
    message.type === 'tool_execution_error';

  // 判断是否是用户消息（通过ID后缀判断）
  const isUserMessage = message.id.endsWith('-user');

  return (
    <div className={cn('mb-4', isUserMessage && 'flex justify-end')}>
      <div
        className={cn(
          'flex items-start gap-3',
          isUserMessage && 'flex-row-reverse',
        )}
      >
        <div className={cn('flex-1', isUserMessage && 'max-w-3xl')}>
          {isContent && (
            <ContentMessage
              message={message}
              enableTypingEffect={enableTypingEffect && !isUserMessage}
              isUserMessage={isUserMessage}
            />
          )}
          {isToolCall && <ToolCallMessage message={message} />}
          {!isContent && !isToolCall && (
            <div
              className={cn(
                'rounded-lg p-3',
                isUserMessage
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
                'text-sm',
              )}
            >
              {message.content}
            </div>
          )}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
