/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { sessionService } from '../../services/sessionService.js';
import { cn } from '../../utils/cn.js';

interface WorkspaceManagerProps {
  sessionId: string | null;
  onWorkspaceUpdated?: () => void;
}

export function WorkspaceManager({
  sessionId,
  onWorkspaceUpdated,
}: WorkspaceManagerProps) {
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [newWorkspaceRoot, setNewWorkspaceRoot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      loadWorkspaceRoot();
    } else {
      setWorkspaceRoot('');
    }
    // loadWorkspaceRoot 函数在每次渲染时都会重新创建，不需要添加到依赖数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const loadWorkspaceRoot = async () => {
    if (!sessionId) return;

    setLoading(true);
    setError(null);
    try {
      // 从目录列表获取第一个目录作为workspaceRoot（第一个通常是主目录）
      const dirResponse = await sessionService.listDirectories(sessionId);
      if (dirResponse.directories && dirResponse.directories.length > 0) {
        setWorkspaceRoot(dirResponse.directories[0]);
      } else {
        setWorkspaceRoot('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载workspace失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!sessionId || !newWorkspaceRoot.trim()) {
      setError('请输入有效的workspace路径');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await sessionService.updateWorkspace(sessionId, newWorkspaceRoot.trim());
      setWorkspaceRoot(newWorkspaceRoot.trim());
      setNewWorkspaceRoot('');
      setIsEditing(false);
      onWorkspaceUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新workspace失败');
    } finally {
      setLoading(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="p-2 text-xs text-gray-400 dark:text-gray-500">
        当前workspaceRoot: 无会话
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
        当前workspaceRoot
      </div>

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
          {error}
        </div>
      )}

      {!isEditing ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 text-xs text-gray-600 dark:text-gray-400 font-mono truncate bg-gray-100 dark:bg-gray-800 p-2 rounded">
            {loading ? '加载中...' : workspaceRoot || '未设置'}
          </div>
          <button
            onClick={() => {
              setNewWorkspaceRoot(workspaceRoot);
              setIsEditing(true);
              setError(null);
            }}
            disabled={loading}
            className={cn(
              'px-2 py-1 text-xs rounded',
              'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/20 dark:hover:bg-blue-900/30',
              'text-blue-700 dark:text-blue-300',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors',
            )}
          >
            修改
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={newWorkspaceRoot}
            onChange={(e) => setNewWorkspaceRoot(e.target.value)}
            placeholder="输入新的workspace路径"
            className={cn(
              'w-full text-xs px-2 py-1 rounded border',
              'bg-white dark:bg-gray-800',
              'border-gray-300 dark:border-gray-600',
              'text-gray-900 dark:text-gray-100',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
            )}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleUpdate();
              } else if (e.key === 'Escape') {
                setIsEditing(false);
                setNewWorkspaceRoot('');
                setError(null);
              }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleUpdate}
              disabled={loading || !newWorkspaceRoot.trim()}
              className={cn(
                'px-2 py-1 text-xs rounded',
                'bg-green-100 hover:bg-green-200 dark:bg-green-900/20 dark:hover:bg-green-900/30',
                'text-green-700 dark:text-green-300',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors',
              )}
            >
              保存
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setNewWorkspaceRoot('');
                setError(null);
              }}
              disabled={loading}
              className={cn(
                'px-2 py-1 text-xs rounded',
                'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700',
                'text-gray-700 dark:text-gray-300',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors',
              )}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
