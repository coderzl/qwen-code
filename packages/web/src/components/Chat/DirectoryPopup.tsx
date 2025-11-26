/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { sessionService } from '../../services/sessionService.js';
import { cn } from '../../utils/cn.js';

interface DirectoryPopupProps {
  sessionId: string | undefined;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  position: { top: number; left: number };
}

export function DirectoryPopup({
  sessionId,
  isOpen,
  onClose,
  onUpdated,
  position,
}: DirectoryPopupProps) {
  const [directories, setDirectories] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newDirectory, setNewDirectory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectories = useCallback(async () => {
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
  }, [sessionId]);

  useEffect(() => {
    if (isOpen && sessionId) {
      loadDirectories();
    }
  }, [isOpen, sessionId, loadDirectories]);

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
        onUpdated?.();
      } else {
        setError('添加目录失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加目录失败');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/10 dark:bg-black/30"
        onClick={onClose}
      />

      {/* Popup */}
      <div
        className="fixed z-50 w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-[500px] flex flex-col"
        style={{
          top: position.top,
          left: position.left,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-transparent dark:from-green-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              包含目录
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Directory List */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center justify-between">
              <span>目录列表 ({directories.length})</span>
              <button
                onClick={loadDirectories}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="刷新"
              >
                <svg
                  className={cn('w-4 h-4', loading && 'animate-spin')}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>

            {directories.length === 0 ? (
              <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
                暂无包含目录
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {directories.map((dir, index) => (
                  <div
                    key={index}
                    className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 break-all hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title={dir}
                  >
                    {dir}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Directory Section */}
          {!isAdding ? (
            <button
              onClick={() => {
                setIsAdding(true);
                setError(null);
              }}
              disabled={loading}
              className={cn(
                'w-full px-4 py-2.5 text-sm font-medium rounded-lg',
                'bg-blue-500 hover:bg-blue-600 text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors flex items-center justify-center gap-2',
              )}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              添加目录
            </button>
          ) : (
            <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
              <input
                type="text"
                value={newDirectory}
                onChange={(e) => setNewDirectory(e.target.value)}
                placeholder="输入目录路径（支持 ~, ./ 等）"
                autoFocus
                className={cn(
                  'w-full text-sm px-3 py-2 rounded-lg border',
                  'bg-white dark:bg-gray-900',
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
                    'flex-1 px-3 py-2 text-sm font-medium rounded-lg',
                    'bg-green-500 hover:bg-green-600 text-white',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'transition-colors',
                  )}
                >
                  {loading ? '添加中...' : '添加'}
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewDirectory('');
                    setError(null);
                  }}
                  disabled={loading}
                  className={cn(
                    'flex-1 px-3 py-2 text-sm font-medium rounded-lg',
                    'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600',
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
      </div>
    </>
  );
}
