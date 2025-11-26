/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { sessionService } from '../../services/sessionService.js';
import { cn } from '../../utils/cn.js';

interface WorkspacePopupProps {
  sessionId: string | undefined;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  position: { top: number; left: number };
}

export function WorkspacePopup({
  sessionId,
  isOpen,
  onClose,
  onUpdated,
  position,
}: WorkspacePopupProps) {
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [newWorkspaceRoot, setNewWorkspaceRoot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaceRoot = useCallback(async () => {
    if (!sessionId) return;

    setLoading(true);
    setError(null);
    try {
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
  }, [sessionId]);

  useEffect(() => {
    if (isOpen && sessionId) {
      loadWorkspaceRoot();
    }
  }, [isOpen, sessionId, loadWorkspaceRoot]);

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
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新workspace失败');
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
        className="fixed z-50 w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        style={{
          top: position.top,
          left: position.left,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-transparent dark:from-blue-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              工作区根目录
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
        <div className="p-4 space-y-3">
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
              {error}
            </div>
          )}

          {!isEditing ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                当前工作区：
              </div>
              <div className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700 break-all">
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
                  'w-full px-4 py-2 text-sm font-medium rounded-lg',
                  'bg-blue-500 hover:bg-blue-600 text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-colors',
                )}
              >
                修改工作区
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                新的工作区路径：
              </div>
              <input
                type="text"
                value={newWorkspaceRoot}
                onChange={(e) => setNewWorkspaceRoot(e.target.value)}
                placeholder="/path/to/workspace"
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
                    'flex-1 px-4 py-2 text-sm font-medium rounded-lg',
                    'bg-green-500 hover:bg-green-600 text-white',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'transition-colors',
                  )}
                >
                  {loading ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setNewWorkspaceRoot('');
                    setError(null);
                  }}
                  disabled={loading}
                  className={cn(
                    'flex-1 px-4 py-2 text-sm font-medium rounded-lg',
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
