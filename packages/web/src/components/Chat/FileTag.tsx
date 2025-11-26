/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { cn } from '../../utils/cn.js';

export interface FileTagProps {
  file: string;
  onRemove: () => void;
}

export function FileTag({ file, onRemove }: FileTagProps) {
  const fileName = file.split('/').pop() || file;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium',
        'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
        'border border-blue-100 dark:border-blue-800',
        'select-none transition-all',
        'hover:bg-blue-100 dark:hover:bg-blue-900/50',
      )}
      title={file}
    >
      <svg
        className="w-3 h-3 opacity-70"
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
      <span className="max-w-[150px] truncate">{fileName}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 opacity-60 hover:opacity-100 transition-all"
      >
        <svg
          className="w-3 h-3"
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
  );
}
