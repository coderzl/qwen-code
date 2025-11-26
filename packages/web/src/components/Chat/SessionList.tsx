/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import {
  sessionService,
  type SessionInfo,
} from '../../services/sessionService.js';
import { cn } from '../../utils/cn.js';

interface SessionListProps {
  currentSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onNewChat?: () => void;
}

export function SessionList({
  currentSessionId,
  onSessionSelect,
  onNewChat,
}: SessionListProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await sessionService.listSessions();
      setSessions(response.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载会话列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
    // 定期刷新会话列表
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (timeString: string) => {
    try {
      const date = new Date(timeString);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 7) return `${days}天前`;
      return date.toLocaleDateString('zh-CN');
    } catch {
      return timeString;
    }
  };

  return (
    <div className="w-64 flex flex-col h-full bg-transparent">
      <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Session列表
          </h2>
          <button
            onClick={loadSessions}
            disabled={loading}
            className={cn(
              'text-xs px-2 py-1 rounded',
              'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600',
              'text-gray-700 dark:text-gray-300',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors',
            )}
            title="刷新"
          >
            {loading ? '...' : '🔄'}
          </button>
        </div>
        {/* 新开对话按钮 */}
        {onNewChat && (
          <button
            onClick={onNewChat}
            className={cn(
              'w-full mt-2 px-3 py-2 rounded-lg text-sm font-medium',
              'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700',
              'text-white',
              'transition-colors',
              'flex items-center justify-center gap-2',
            )}
          >
            <span>+</span>
            <span>新开对话</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {error && (
          <div className="p-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded">
            {error}
          </div>
        )}

        {sessions.length === 0 && !loading && (
          <div className="p-4 text-center text-sm text-gray-400 dark:text-gray-500">
            暂无会话
          </div>
        )}

        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSessionSelect(session.id)}
            className={cn(
              'w-full text-left p-3 rounded-lg transition-colors',
              'hover:bg-gray-100 dark:hover:bg-gray-700',
              currentSessionId === session.id
                ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate">
                  {session.id.slice(0, 8)}...
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {formatTime(session.lastActivity)}
                </div>
              </div>
              {currentSessionId === session.id && (
                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
