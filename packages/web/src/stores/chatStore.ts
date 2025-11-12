/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import type { FrontendMessage } from '../utils/protocolAdapter.js';
import { mergeMessages } from '../utils/messageUtils.js';

interface ChatState {
  messages: FrontendMessage[];
  currentSessionId: string | null;
  isStreaming: boolean;
  error: string | null;
  addMessage: (message: FrontendMessage) => void;
  addMessages: (messages: FrontendMessage[]) => void;
  updateMessage: (id: string, updates: Partial<FrontendMessage>) => void;
  clearMessages: () => void;
  setSessionId: (sessionId: string | null) => void;
  setStreaming: (isStreaming: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  currentSessionId: null,
  isStreaming: false,
  error: null,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  addMessages: (newMessages) =>
    set((state) => ({
      messages: mergeMessages(state.messages, newMessages),
    })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg,
      ),
    })),

  clearMessages: () =>
    set({
      messages: [],
      error: null,
    }),

  setSessionId: (sessionId) =>
    set({
      currentSessionId: sessionId,
    }),

  setStreaming: (isStreaming) =>
    set({
      isStreaming,
    }),

  setError: (error) =>
    set({
      error,
    }),

  clearError: () =>
    set({
      error: null,
    }),
}));
