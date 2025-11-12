/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { cn } from '../../utils/cn.js';

export interface InputAreaProps {
  onSend?: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  input?: string;
  onInputChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
}

export function InputArea({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
  input: externalInput,
  onInputChange: externalOnInputChange,
  onSubmit: externalOnSubmit,
}: InputAreaProps) {
  const [internalInput, setInternalInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 使用外部 input 或内部 state
  const input = externalInput !== undefined ? externalInput : internalInput;
  const setInput = externalOnInputChange
    ? (e: ChangeEvent<HTMLTextAreaElement>) => {
        externalOnInputChange(e);
        if (!externalInput) {
          setInternalInput(e.target.value);
        }
      }
    : (e: ChangeEvent<HTMLTextAreaElement>) => setInternalInput(e.target.value);

  useEffect(() => {
    // 自动调整高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (externalOnSubmit) {
      // 使用外部提交处理
      externalOnSubmit(e);
    } else if (input.trim() && !disabled && onSend) {
      // 使用内部提交处理
      onSend(input.trim());
      if (!externalInput) {
        setInternalInput('');
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // 创建一个模拟的 form 事件
      const form = e.currentTarget.form;
      if (form) {
        const formEvent = new Event('submit', {
          bubbles: true,
          cancelable: true,
        }) as unknown as FormEvent<HTMLFormElement>;
        Object.defineProperty(formEvent, 'target', { value: form });
        Object.defineProperty(formEvent, 'currentTarget', { value: form });
        handleSubmit(formEvent);
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
    >
      <div className="p-4 max-w-4xl mx-auto">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600',
              'px-4 py-3',
              'bg-white dark:bg-gray-800',
              'text-gray-900 dark:text-gray-100',
              'placeholder:text-gray-400 dark:placeholder:text-gray-500',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'max-h-32 overflow-y-auto scrollbar-thin',
              'transition-all',
            )}
          />
          <button
            type="submit"
            disabled={!input.trim() || disabled}
            className={cn(
              'px-6 py-3 rounded-lg font-medium',
              'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700',
              'text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors',
              'shadow-sm hover:shadow-md',
            )}
          >
            发送
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-400 dark:text-gray-500 text-center">
          按 Enter 发送，Shift + Enter 换行
        </div>
      </div>
    </form>
  );
}
