/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import type { FileInfo } from '../../hooks/useFileSearch.js';
import { useFileSearch } from '../../hooks/useFileSearch.js';
import { cn } from '../../utils/cn.js';

export interface FileSelectorProps {
  sessionId: string | undefined;
  searchText: string;
  isOpen: boolean;
  onSelect: (file: FileInfo) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

export function FileSelector({
  sessionId,
  searchText,
  isOpen,
  onSelect,
  onClose,
  position,
}: FileSelectorProps) {
  const { searchResults, isLoading, searchFiles } = useFileSearch(sessionId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (isOpen && searchText) {
      const timer = setTimeout(() => {
        searchFiles(searchText);
      }, 300); // Debounce
      return () => clearTimeout(timer);
    }
  }, [isOpen, searchText, searchFiles]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < searchResults.length - 1 ? prev + 1 : prev,
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (searchResults[selectedIndex]) {
          onSelect(searchResults[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, searchResults, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    if (listRef.current && listRef.current.children[selectedIndex]) {
      (listRef.current.children[selectedIndex] as HTMLElement).scrollIntoView({
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-50 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
      style={{
        top: position.top,
        left: position.left,
        maxHeight: '300px',
      }}
    >
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400">
        选择文件 (@{searchText})
      </div>

      {isLoading ? (
        <div className="p-4 text-center text-gray-500 text-sm">搜索中...</div>
      ) : searchResults.length === 0 ? (
        <div className="p-4 text-center text-gray-500 text-sm">
          未找到匹配文件
        </div>
      ) : (
        <ul ref={listRef} className="overflow-y-auto flex-1">
          {searchResults.map((file, index) => (
            <li
              key={file.path}
              className={cn(
                'px-4 py-2 cursor-pointer text-sm flex items-center gap-2',
                index === selectedIndex
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
              onClick={() => onSelect(file)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <svg
                className="w-4 h-4 opacity-70 flex-shrink-0"
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
              <div className="flex flex-col overflow-hidden">
                <span className="truncate font-medium">{file.name}</span>
                <span className="truncate text-xs opacity-60">{file.path}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
