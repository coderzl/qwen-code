/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, GeminiClient } from '@qwen-code/qwen-code-core';

export interface SessionContext {
  id: string;
  userId: string;
  config: Config;
  geminiClient: GeminiClient;
  history: HistoryItem[];
  createdAt: Date;
  lastActivity: Date;
  metadata?: Record<string, unknown>;
}

export interface HistoryItem {
  id: number;
  type: 'user' | 'assistant' | 'system' | 'tool_group';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionOptions {
  workspaceRoot?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  configOverrides?: Record<string, unknown>;
}

export interface SessionStats {
  id: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  duration: number;
  messageCount: number;
  metadata?: Record<string, unknown>;
}

// JWT相关类型已移除（当前为单用户模式，无需认证）
