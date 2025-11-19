/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import type { ToolCallGroup } from '../../utils/protocolAdapter.js';
import { cn } from '../../utils/cn.js';

interface ToolCallGroupProps {
  group: ToolCallGroup;
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

/**
 * 状态角标组件
 */
function StatusBadge({
  status,
  className,
}: {
  status: ToolCallGroup['status'];
  className?: string;
}) {
  const statusConfig = {
    requested: {
      label: '已请求',
      color: 'bg-blue-500',
      textColor: 'text-blue-700 dark:text-blue-300',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
    },
    executing: {
      label: '执行中',
      color: 'bg-yellow-500',
      textColor: 'text-yellow-700 dark:text-yellow-300',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      borderColor: 'border-yellow-200 dark:border-yellow-800',
      animate: true,
    },
    completed: {
      label: '已完成',
      color: 'bg-green-500',
      textColor: 'text-green-700 dark:text-green-300',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
    },
    error: {
      label: '执行失败',
      color: 'bg-red-500',
      textColor: 'text-red-700 dark:text-red-300',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        config.textColor,
        config.bgColor,
        config.borderColor,
        'border',
        className,
      )}
    >
      <div
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          config.color,
          'animate' in config && config.animate && 'animate-pulse',
        )}
      />
      {config.label}
    </div>
  );
}

export function ToolCallGroupComponent({ group }: ToolCallGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    toolName,
    status,
    request,
    executionStart,
    executionComplete,
    executionError,
  } = group;

  // 根据状态确定主色调
  const getMainColor = () => {
    switch (status) {
      case 'requested':
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          text: 'text-blue-700 dark:text-blue-300',
        };
      case 'executing':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          text: 'text-yellow-700 dark:text-yellow-300',
        };
      case 'completed':
        return {
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
          text: 'text-green-700 dark:text-green-300',
        };
      case 'error':
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          text: 'text-red-700 dark:text-red-300',
        };
      default:
        return {
          bg: 'bg-gray-50 dark:bg-gray-900/20',
          border: 'border-gray-200 dark:border-gray-800',
          text: 'text-gray-700 dark:text-gray-300',
        };
    }
  };

  const colors = getMainColor();

  return (
    <div className={cn('rounded-lg p-4 border', colors.bg, colors.border)}>
      {/* 头部：工具名称和状态 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={cn('transition-transform', isExpanded && 'rotate-90')}
          >
            ▶
          </span>
          <span className={cn('font-medium', colors.text)}>{toolName}</span>
        </div>
        <StatusBadge status={status} />
      </button>

      {/* 展开后的详细信息 */}
      {isExpanded && (
        <div className="mt-4 space-y-3">
          {/* 工具调用请求 */}
          {request && request.toolCall && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                调用参数
              </div>
              {request.toolCall.args &&
              Object.keys(request.toolCall.args).length > 0 ? (
                <CollapsibleSection
                  title={
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      查看参数详情
                    </span>
                  }
                >
                  <pre className="whitespace-pre-wrap font-mono text-xs bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">
                    {JSON.stringify(request.toolCall.args, null, 2)}
                  </pre>
                </CollapsibleSection>
              ) : (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  无参数
                </div>
              )}
            </div>
          )}

          {/* 执行开始 */}
          {executionStart && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">执行开始时间:</span>{' '}
              {new Date(executionStart.timestamp).toLocaleTimeString('zh-CN')}
            </div>
          )}

          {/* 执行完成 */}
          {executionComplete && executionComplete.toolExecution && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                执行结果
              </div>
              {executionComplete.toolExecution.result !== undefined ? (
                <CollapsibleSection
                  title={
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      查看执行结果
                    </span>
                  }
                >
                  <pre className="whitespace-pre-wrap font-mono text-xs bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">
                    {
                      JSON.stringify(
                        executionComplete.toolExecution.result,
                        null,
                        2,
                      ) as string
                    }
                  </pre>
                </CollapsibleSection>
              ) : (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  无返回结果
                </div>
              )}
            </div>
          )}

          {/* 执行错误 */}
          {executionError && executionError.toolExecution && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-red-700 dark:text-red-300">
                执行错误
              </div>
              {executionError.toolExecution.error && (
                <CollapsibleSection
                  title={
                    <span className="text-xs text-red-600 dark:text-red-400">
                      查看错误详情
                    </span>
                  }
                >
                  <pre className="whitespace-pre-wrap font-mono text-xs bg-white dark:bg-gray-800 p-2 rounded border border-red-200 dark:border-red-800">
                    {typeof executionError.toolExecution.error === 'string'
                      ? executionError.toolExecution.error
                      : JSON.stringify(
                          executionError.toolExecution.error,
                          null,
                          2,
                        )}
                  </pre>
                </CollapsibleSection>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
