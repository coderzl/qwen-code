/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { cn } from '../../utils/cn.js';
import { FileSelector } from './FileSelector.js';
import { FileTag } from './FileTag.js';
import { WorkspacePopup } from './WorkspacePopup.js';
import { DirectoryPopup } from './DirectoryPopup.js';
import type { FileInfo } from '../../hooks/useFileSearch.js';
import { sessionService } from '../../services/sessionService.js';

export interface InputAreaProps {
  onSend?: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  input?: string;
  onInputChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  sessionId?: string | undefined;
  onWorkspaceUpdated?: () => void;
  onDirectoriesUpdated?: () => void;
}

export function InputArea({
  onSend,
  disabled = false,
  placeholder = 'What are we coding next?',
  input: externalInput,
  onInputChange: externalOnInputChange,
  onSubmit: externalOnSubmit,
  sessionId,
  onWorkspaceUpdated,
  onDirectoriesUpdated,
}: InputAreaProps) {
  const [internalInput, setInternalInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // @ Command State
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [atPosition, setAtPosition] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [fileTags, setFileTags] = useState<string[]>([]);

  // Workspace & Directory State
  const [showWorkspacePopup, setShowWorkspacePopup] = useState(false);
  const [showDirectoryPopup, setShowDirectoryPopup] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [directoryCount, setDirectoryCount] = useState<number>(0);

  const loadWorkspaceInfo = useCallback(async () => {
    if (!sessionId) return;
    try {
      const dirResponse = await sessionService.listDirectories(sessionId);
      if (dirResponse.directories && dirResponse.directories.length > 0) {
        setWorkspaceRoot(dirResponse.directories[0]);
        setDirectoryCount(dirResponse.directories.length);
      }
    } catch (err) {
      console.error('Failed to load workspace info:', err);
    }
  }, [sessionId]);

  // Load workspace info
  useEffect(() => {
    if (sessionId) {
      loadWorkspaceInfo();
    }
  }, [sessionId, loadWorkspaceInfo]);

  // 使用外部 input 或内部 state
  const input = externalInput !== undefined ? externalInput : internalInput;

  const setInput = (newValue: string) => {
    if (externalOnInputChange && textareaRef.current) {
      // Simulate event for external handler if needed,
      // but simpler to just call the setter if managed externally.
      // This part is tricky if externalOnInputChange expects an event.
      // We'll just set internal if not external, or warn.
      // Ideally we should refactor parent to accept string updater.
      // For now, let's assume internal state usage mostly or standard event.
      const nativeInputSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      nativeInputSetter?.call(textareaRef.current, newValue);
      const event = new Event('input', { bubbles: true });
      textareaRef.current.dispatchEvent(event);
    } else {
      setInternalInput(newValue);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;

    if (externalOnInputChange) {
      externalOnInputChange(e);
    } else {
      setInternalInput(val);
    }

    // Detect @ trigger
    // Check if we are typing a file path after @
    // Valid patterns: "@", "@src", "@src/", "@src/utils"
    // We need to find the last "@" before cursor that is active
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      // Check if it's a valid trigger (start of line or preceded by space)
      const charBeforeAt =
        lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
      if (/\s/.test(charBeforeAt)) {
        const query = textBeforeCursor.slice(lastAtIndex + 1);
        // Allow paths characters
        if (/^[a-zA-Z0-9_\-./]*$/.test(query)) {
          setSearchText(query);
          setAtPosition({ start: lastAtIndex, end: cursorPos });
          setShowFileSelector(true);
          updatePopupPosition();
          return;
        }
      }
    }

    setShowFileSelector(false);
  };

  const updatePopupPosition = () => {
    if (!textareaRef.current) return;

    // Simple approximation using textarea coordinates
    // A proper implementation requires a library like 'textarea-caret'
    // For now, we'll position it near the textarea top-left + some offset
    // or just fixed above the input area.
    // Let's try to position it above the cursor roughly.
    const rect = textareaRef.current.getBoundingClientRect();
    // Fixed position above the input area for now to avoid complexity
    setPopupPosition({
      top: rect.top - 310, // 300px height + padding
      left: rect.left + 20,
    });
  };

  const handleFileSelect = (file: FileInfo) => {
    if (!atPosition) return;

    const before = input.slice(0, atPosition.start);
    const after = input.slice(atPosition.end);
    const newValue = `${before}@${file.path} ${after}`;

    setInput(newValue);
    setShowFileSelector(false);
    setAtPosition(null);

    // Add to visual tags if not present
    if (!fileTags.includes(file.path)) {
      setFileTags([...fileTags, file.path]);
    }

    // Refocus
    textareaRef.current?.focus();
  };

  const removeFileTag = (path: string) => {
    setFileTags(fileTags.filter((t) => t !== path));
    // Optionally remove from text? Maybe too aggressive.
    // Let's just remove the visual tag.
  };

  useEffect(() => {
    // 自动调整高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 60), 300)}px`;
    }
  }, [input]);

  const submitMessage = () => {
    if (input.trim() && !disabled && onSend) {
      onSend(input.trim());
      if (!externalInput) {
        setInternalInput('');
      }
      setFileTags([]); // Clear tags on send
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (externalOnSubmit) {
      externalOnSubmit(e);
    } else {
      submitMessage();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // If FileSelector is open, let it handle navigation
    if (showFileSelector) {
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
        if (e.key !== 'Escape') return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (isComposing || showFileSelector) {
        return;
      }
      e.preventDefault();
      submitMessage();
    }
  };

  const getWorkspaceLabel = () => {
    if (!workspaceRoot) return 'workspace';
    const parts = workspaceRoot.split('/');
    return parts[parts.length - 1] || 'workspace';
  };

  const getDirectoryLabel = () => {
    if (directoryCount === 0) return 'no dirs';
    if (directoryCount === 1) return '1 dir';
    return `${directoryCount} dirs`;
  };

  return (
    <div className="w-full bg-transparent px-4 pb-6">
      <div
        className={cn(
          'relative max-w-4xl mx-auto',
          'bg-white dark:bg-gray-900',
          'rounded-2xl border border-gray-200 dark:border-gray-700',
          'shadow-lg dark:shadow-2xl',
          'transition-all duration-200',
          'focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/50',
        )}
        ref={containerRef}
      >
        {/* File Selector Popup */}
        <FileSelector
          sessionId={sessionId}
          searchText={searchText}
          isOpen={showFileSelector}
          onSelect={handleFileSelect}
          onClose={() => setShowFileSelector(false)}
          position={popupPosition}
        />

        {/* Workspace Popup */}
        <WorkspacePopup
          sessionId={sessionId}
          isOpen={showWorkspacePopup}
          onClose={() => setShowWorkspacePopup(false)}
          onUpdated={() => {
            loadWorkspaceInfo();
            onWorkspaceUpdated?.();
          }}
          position={popupPosition}
        />

        {/* Directory Popup */}
        <DirectoryPopup
          sessionId={sessionId}
          isOpen={showDirectoryPopup}
          onClose={() => setShowDirectoryPopup(false)}
          onUpdated={() => {
            loadWorkspaceInfo();
            onDirectoriesUpdated?.();
          }}
          position={popupPosition}
        />

        {/* Visual File Tags Area */}
        {fileTags.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
            {fileTags.map((file) => (
              <FileTag
                key={file}
                file={file}
                onRemove={() => removeFileTag(file)}
              />
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="flex-1 min-h-[60px]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              disabled={disabled}
              placeholder={placeholder}
              rows={1}
              className={cn(
                'w-full bg-transparent',
                'px-4 py-4',
                'text-gray-900 dark:text-gray-100 text-base',
                'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                'resize-none outline-none',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700',
              )}
              style={{ maxHeight: '300px' }}
            />
          </div>

          {/* Bottom Bar */}
          <div className="flex items-center justify-between px-3 pb-3 pt-2">
            {/* Left: Context Selectors */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowWorkspacePopup(true);
                  updatePopupPosition();
                }}
                disabled={!sessionId}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
                  'text-xs font-medium text-gray-600 dark:text-gray-400',
                  'bg-gray-100 dark:bg-gray-800',
                  'hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                title="点击管理工作区根目录"
              >
                <svg
                  className="w-3.5 h-3.5"
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
                <span className="max-w-[80px] truncate">
                  {getWorkspaceLabel()}
                </span>
                <svg
                  className="w-3 h-3 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDirectoryPopup(true);
                  updatePopupPosition();
                }}
                disabled={!sessionId}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
                  'text-xs font-medium text-gray-600 dark:text-gray-400',
                  'bg-gray-100 dark:bg-gray-800',
                  'hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                title="点击管理包含目录"
              >
                <svg
                  className="w-3.5 h-3.5"
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
                <span>{getDirectoryLabel()}</span>
                <svg
                  className="w-3 h-3 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full',
                  'text-sm font-medium text-gray-700 dark:text-gray-200',
                  'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
                  'hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors',
                )}
                onClick={() => {
                  /* Handle Ask logic if different */
                }}
              >
                <span>Ask</span>
              </button>

              <button
                type="submit"
                disabled={!input.trim() || disabled}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full',
                  'text-sm font-medium text-white',
                  'bg-black dark:bg-white dark:text-black',
                  'hover:opacity-90 transition-opacity',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <span>Code</span>
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
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
