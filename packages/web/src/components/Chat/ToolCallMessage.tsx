/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import type { FrontendMessage } from '../../utils/protocolAdapter.js';
import { cn } from '../../utils/cn.js';

interface ToolCallMessageProps {
  message: FrontendMessage;
}

function CollapsibleSection({
  title,
  children,
  defaultExpanded = false,
  className,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={className}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity"
      >
        <span className={cn('transition-transform', isExpanded && 'rotate-90')}>
          ▶
        </span>
        {title}
      </button>
      {isExpanded && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function ToolCallMessage({ message }: ToolCallMessageProps) {
  const { type, toolCall, toolExecution } = message;

  if (type === 'tool_call_request' && toolCall) {
    const hasArgs = toolCall.args && Object.keys(toolCall.args).length > 0;

    return (
      <div
        className={cn(
          'rounded-lg p-4',
          'bg-blue-50 dark:bg-blue-900/20',
          'border border-blue-200 dark:border-blue-800',
        )}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="font-medium text-blue-700 dark:text-blue-300">
            调用工具: {toolCall.name}
          </span>
        </div>
        {hasArgs && (
          <CollapsibleSection
            title={
              <span className="text-sm text-blue-600 dark:text-blue-400">
                查看参数详情
              </span>
            }
            className="mt-2"
          >
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <pre className="whitespace-pre-wrap font-mono text-xs bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          </CollapsibleSection>
        )}
      </div>
    );
  }

  if (type === 'tool_execution_start' && toolCall) {
    return (
      <div
        className={cn(
          'rounded-lg p-4',
          'bg-yellow-50 dark:bg-yellow-900/20',
          'border border-yellow-200 dark:border-yellow-800',
        )}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span className="font-medium text-yellow-700 dark:text-yellow-300">
            执行中: {toolCall.name}
          </span>
        </div>
      </div>
    );
  }

  if (type === 'tool_execution_complete' && toolExecution) {
    const hasResult = toolExecution.result !== undefined;

    return (
      <div
        className={cn(
          'rounded-lg p-4',
          'bg-green-50 dark:bg-green-900/20',
          'border border-green-200 dark:border-green-800',
        )}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="font-medium text-green-700 dark:text-green-300">
            执行完成: {toolExecution.toolCall.name}
          </span>
        </div>
        {hasResult && (
          <CollapsibleSection
            title={
              <span className="text-sm text-green-600 dark:text-green-400">
                查看执行结果
              </span>
            }
            className="mt-2"
          >
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <pre className="whitespace-pre-wrap font-mono text-xs bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">
                {JSON.stringify(toolExecution.result, null, 2) as string}
              </pre>
            </div>
          </CollapsibleSection>
        )}
      </div>
    );
  }

  if (type === 'tool_execution_error' && toolExecution) {
    const hasError = toolExecution.error;

    return (
      <div
        className={cn(
          'rounded-lg p-4',
          'bg-red-50 dark:bg-red-900/20',
          'border border-red-200 dark:border-red-800',
        )}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="font-medium text-red-700 dark:text-red-300">
            执行错误: {toolExecution.toolCall?.name || 'Unknown'}
          </span>
        </div>
        {hasError && (
          <CollapsibleSection
            title={
              <span className="text-sm text-red-600 dark:text-red-400">
                查看错误详情
              </span>
            }
            className="mt-2"
          >
            <div className="text-sm text-red-600 dark:text-red-400">
              <pre className="whitespace-pre-wrap font-mono text-xs bg-white dark:bg-gray-800 p-2 rounded border border-red-200 dark:border-red-800">
                {typeof toolExecution.error === 'string'
                  ? toolExecution.error
                  : JSON.stringify(toolExecution.error, null, 2)}
              </pre>
            </div>
          </CollapsibleSection>
        )}
      </div>
    );
  }

  return null;
}
