/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useChatStream } from '../../hooks/useChatStream.js';
import { useChatStore } from '../../stores/chatStore.js';
import { MessageList } from './MessageList.js';
import { InputArea } from './InputArea.js';
import { SessionList } from './SessionList.js';
import { cn } from '../../utils/cn.js';

export function ChatContainer() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );

  const {
    messages,
    sendMessage,
    cancel,
    isStreaming,
    error,
    clear,
    sessionId,
    switchSession,
  } = useChatStream({
    responseMode: 'full',
    sessionId: selectedSessionId || undefined,
  });
  const { clearError } = useChatStore();

  const handleSend = (message: string) => {
    sendMessage(message);
  };

  const handleSessionSelect = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    switchSession(sessionId);
  };

  const handleNewChat = () => {
    setSelectedSessionId(null);
    clear();
    const { setSessionId } = useChatStore.getState();
    setSessionId(null);
  };

  const handleWorkspaceUpdated = () => {
    // workspace更新后，可以刷新相关数据
  };

  const handleDirectoriesUpdated = () => {
    // 目录更新后，可以刷新相关数据
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Session List Sidebar */}
      <div className="flex flex-col bg-white/50 dark:bg-gray-900/50 border-r border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm">
        {/* Session List */}
        <div className="flex-1 overflow-hidden">
          <SessionList
            currentSessionId={sessionId}
            onSessionSelect={handleSessionSelect}
            onNewChat={handleNewChat}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 shadow-sm"></div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
              Qwen Code
            </h1>
          </div>

          {/* Status / Actions */}
          <div className="flex items-center gap-3">
            {isStreaming && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-gray-800/80 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  Generating...
                </span>
                <button
                  onClick={cancel}
                  className="ml-2 text-xs text-red-500 hover:text-red-600 font-medium hover:underline"
                >
                  Cancel
                </button>
              </div>
            )}
            <button
              onClick={clear}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-lg',
                'text-gray-600 dark:text-gray-300',
                'hover:bg-white/50 dark:hover:bg-gray-800/50',
                'transition-colors',
              )}
            >
              Clear
            </button>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mb-4 p-4 rounded-xl bg-red-50/80 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-300 text-sm flex items-start gap-3 shadow-sm backdrop-blur-sm">
            <div className="font-medium">⚠️ Error</div>
            <div className="flex-1">{error}</div>
            <button
              onClick={clearError}
              className="hover:text-red-800 dark:hover:text-red-200"
            >
              ✕
            </button>
          </div>
        )}

        {/* Messages - Centered and cleaner */}
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
            <div className="max-w-4xl mx-auto px-4 py-6">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[40vh] text-center">
                  <h2 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    What are we coding next?
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 max-w-md text-lg">
                    I can help you write, debug, and explain code. Type @ to
                    reference files.
                  </p>
                </div>
              ) : (
                <MessageList messages={messages} enableTypingEffect={true} />
              )}

              {/* Spacer for bottom input */}
              <div className="h-4" />
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="relative z-20">
          <InputArea
            onSend={handleSend}
            disabled={isStreaming}
            sessionId={sessionId || undefined}
            onWorkspaceUpdated={handleWorkspaceUpdated}
            onDirectoriesUpdated={handleDirectoriesUpdated}
          />
        </div>
      </div>
    </div>
  );
}
