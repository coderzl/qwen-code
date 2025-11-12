/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useChatStream } from '../../hooks/useChatStream.js';
import { useChatStore } from '../../stores/chatStore.js';
import { MessageList } from './MessageList.js';
import { InputArea } from './InputArea.js';
import { cn } from '../../utils/cn.js';

export function ChatContainer() {
  const {
    messages,
    sendMessage,
    cancel,
    isStreaming,
    error,
    clear,
    sessionId,
  } = useChatStream({
    responseMode: 'full',
  });
  const { clearError } = useChatStore();

  const handleSend = (message: string) => {
    sendMessage(message);
  };

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 bg-white dark:bg-gray-900 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Qwen Code Web
            </h1>
            {sessionId && (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                Session: {sessionId.slice(0, 8)}...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isStreaming && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    生成中...
                  </span>
                </div>
                <button
                  onClick={cancel}
                  className={cn(
                    'px-3 py-1 text-sm rounded',
                    'bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/30',
                    'text-red-700 dark:text-red-300',
                    'transition-colors',
                  )}
                >
                  取消
                </button>
              </>
            )}
            <button
              onClick={clear}
              disabled={isStreaming}
              className={cn(
                'px-3 py-1 text-sm rounded',
                'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700',
                'text-gray-700 dark:text-gray-300',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors',
              )}
            >
              清空
            </button>
          </div>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div
          className={cn(
            'mx-4 mt-4 p-4 rounded-lg max-w-4xl mx-auto',
            'bg-red-50 dark:bg-red-900/20',
            'border border-red-200 dark:border-red-800',
            'text-red-700 dark:text-red-300 text-sm',
            'shadow-sm',
          )}
        >
          <div className="flex items-start gap-2">
            <div className="font-medium">⚠️ 错误</div>
            <div className="flex-1">{error}</div>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
              aria-label="关闭错误提示"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <MessageList messages={messages} enableTypingEffect={true} />
      </div>

      {/* Input Area */}
      <InputArea onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
