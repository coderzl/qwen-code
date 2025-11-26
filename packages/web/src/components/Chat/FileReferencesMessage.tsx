/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { cn } from '../../utils/cn.js';
import type { FrontendMessage } from '../../utils/protocolAdapter.js';

interface FileReferencesMessageProps {
  message: FrontendMessage;
}

export function FileReferencesMessage({ message }: FileReferencesMessageProps) {
  const files = message.fileReferences || [];

  if (files.length === 0) return null;

  return (
    <div className="mb-2">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 ml-1">
        引用文件 ({files.length})
      </div>
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {files.map((file, index) => (
          <div
            key={index}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm',
              index !== files.length - 1 &&
                'border-b border-gray-200 dark:border-gray-700',
            )}
          >
            <svg
              className="w-4 h-4 text-blue-500 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <span className="font-mono text-gray-700 dark:text-gray-300 truncate">
              {file.path}
            </span>
            {file.size > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                {formatSize(file.size)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
