/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

export interface UseTypingEffectOptions {
  speed?: number; // 打字速度（毫秒/字符）
  enabled?: boolean; // 是否启用打字机效果
}

/**
 * 打字机效果Hook
 * 支持增量更新（增量模式下）
 */
export function useTypingEffect(
  content: string,
  options: UseTypingEffectOptions = {},
): string {
  const { speed = 30, enabled = true } = options;
  const [displayedContent, setDisplayedContent] = useState('');
  const contentRef = useRef(content);
  const displayedContentRef = useRef('');
  const timeoutRef = useRef<number | null>(null);
  const indexRef = useRef(0);
  const lastContentLengthRef = useRef(0);

  // 同步 ref 和 state
  useEffect(() => {
    displayedContentRef.current = displayedContent;
  }, [displayedContent]);

  useEffect(() => {
    // 更新内容引用
    contentRef.current = content;

    if (!enabled) {
      // 如果禁用，直接显示完整内容
      setDisplayedContent(content);
      lastContentLengthRef.current = content.length;
      return;
    }

    // 检测是否是新的消息（内容长度减少或内容完全不同）
    // 使用 ref 来避免依赖 displayedContent
    const currentDisplayed = displayedContentRef.current;
    const isNewMessage =
      content.length < lastContentLengthRef.current ||
      !content.startsWith(currentDisplayed);

    if (isNewMessage) {
      // 新消息，重置状态
      indexRef.current = 0;
      setDisplayedContent('');
      lastContentLengthRef.current = 0;
    }

    // 清除之前的定时器
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // 如果内容已经完整显示，不需要继续
    if (indexRef.current >= content.length) {
      lastContentLengthRef.current = content.length;
      return;
    }

    // 打字机效果函数
    const typeNextChar = () => {
      const currentContent = contentRef.current;
      if (indexRef.current < currentContent.length) {
        const newDisplayed = currentContent.slice(0, indexRef.current + 1);
        setDisplayedContent(newDisplayed);
        indexRef.current += 1;
        timeoutRef.current = window.setTimeout(typeNextChar, speed);
      } else {
        lastContentLengthRef.current = currentContent.length;
      }
    };

    // 如果当前显示的内容少于新内容，继续打字机效果
    if (indexRef.current < content.length) {
      typeNextChar();
    }

    // 清理函数
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [content, speed, enabled]);

  // 如果内容变化但当前显示的内容已经完整，立即更新
  useEffect(() => {
    if (!enabled && displayedContent !== content) {
      setDisplayedContent(content);
      lastContentLengthRef.current = content.length;
    }
    // displayedContent 不应该在依赖数组中，因为它是状态值，会导致无限循环
    // 我们只在 enabled 或 content 变化时检查并更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, enabled]);

  return displayedContent;
}
