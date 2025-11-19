/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { sessionService } from '../../services/sessionService.js';
import { cn } from '../../utils/cn.js';

interface DirectoryManagerProps {
  sessionId: string | null;
  onDirectoriesUpdated?: () => void;
}

export function DirectoryManager({
  sessionId,
  onDirectoriesUpdated,
}: DirectoryManagerProps) {
  const [directories, setDirectories] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newDirectory, setNewDirectory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      loadDirectories();
    } else {
      setDirectories([]);
    }
    // loadDirectories 函数在每次渲染时都会重新创建，不需要添加到依赖数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const loadDirectories = async () => {
    if (!sessionId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await sessionService.listDirectories(sessionId);
      setDirectories(response.directories);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载目录列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!sessionId || !newDirectory.trim()) {
      setError('请输入有效的目录路径');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await sessionService.addDirectory(sessionId, [
        newDirectory.trim(),
      ]);
      if (response.success) {
        if (response.errors.length > 0) {
          setError(response.errors.join(', '));
        }
        setNewDirectory('');
        setIsAdding(false);
        await loadDirectories();
        onDirectoriesUpdated?.();
      } else {
        setError('添加目录失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加目录失败');
    } finally {
      setLoading(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="p-2 text-xs text-gray-400 dark:text-gray-500">
        目录列表: 无会话
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
          目录列表
        </div>
        <button
          onClick={loadDirectories}
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

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
          {error}
        </div>
      )}

      <div className="space-y-1 max-h-32 overflow-y-auto">
        {directories.length === 0 ? (
          <div className="text-xs text-gray-400 dark:text-gray-500 p-2">
            暂无目录
          </div>
        ) : (
          directories.map((dir, index) => (
            <div
              key={index}
              className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded truncate"
              title={dir}
            >
              {dir}
            </div>
          ))
        )}
      </div>

      {!isAdding ? (
        <button
          onClick={() => {
            setIsAdding(true);
            setError(null);
          }}
          disabled={loading}
          className={cn(
            'w-full px-2 py-1 text-xs rounded',
            'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/20 dark:hover:bg-blue-900/30',
            'text-blue-700 dark:text-blue-300',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors',
          )}
        >
          添加目录
        </button>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={newDirectory}
            onChange={(e) => setNewDirectory(e.target.value)}
            placeholder="输入目录路径（支持 ~, ./ 等）"
            className={cn(
              'w-full text-xs px-2 py-1 rounded border',
              'bg-white dark:bg-gray-800',
              'border-gray-300 dark:border-gray-600',
              'text-gray-900 dark:text-gray-100',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
            )}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAdd();
              } else if (e.key === 'Escape') {
                setIsAdding(false);
                setNewDirectory('');
                setError(null);
              }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              disabled={loading || !newDirectory.trim()}
              className={cn(
                'px-2 py-1 text-xs rounded',
                'bg-green-100 hover:bg-green-200 dark:bg-green-900/20 dark:hover:bg-green-900/30',
                'text-green-700 dark:text-green-300',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors',
              )}
            >
              添加
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewDirectory('');
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
