/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionService } from './SessionService.js';

// Mock Config和GeminiClient
vi.mock('@qwen-code/qwen-code-core', () => ({
  Config: vi.fn().mockImplementation(() => ({
    getProjectRoot: () => '/test/workspace',
  })),
  GeminiClient: vi.fn().mockImplementation(() => ({
    sendMessageStream: vi.fn(),
  })),
}));

describe('SessionService', () => {
  let sessionService: SessionService;

  beforeEach(() => {
    sessionService = new SessionService();
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const userId = 'user123';
      const sessionId = await sessionService.createSession(userId, {
        workspaceRoot: '/test/workspace',
      });

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
    });

    it('should store session in map', async () => {
      const userId = 'user123';
      const sessionId = await sessionService.createSession(userId);

      const session = sessionService.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.userId).toBe(userId);
    });
  });

  describe('getSession', () => {
    it('should return undefined for non-existent session', () => {
      const session = sessionService.getSession('non-existent');
      expect(session).toBeUndefined();
    });

    it('should update lastActivity when getting session', async () => {
      const userId = 'user123';
      const sessionId = await sessionService.createSession(userId);

      const session1 = sessionService.getSession(sessionId);
      const time1 = session1?.lastActivity.getTime();

      // 等待一小会儿
      await new Promise((resolve) => setTimeout(resolve, 10));

      const session2 = sessionService.getSession(sessionId);
      const time2 = session2?.lastActivity.getTime();

      expect(time2).toBeGreaterThan(time1!);
    });
  });

  describe('validateSessionOwnership', () => {
    it('should return true for correct owner', async () => {
      const userId = 'user123';
      const sessionId = await sessionService.createSession(userId);

      const isValid = sessionService.validateSessionOwnership(
        sessionId,
        userId,
      );
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect owner', async () => {
      const userId = 'user123';
      const sessionId = await sessionService.createSession(userId);

      const isValid = sessionService.validateSessionOwnership(
        sessionId,
        'user456',
      );
      expect(isValid).toBe(false);
    });

    it('should return false for non-existent session', () => {
      const isValid = sessionService.validateSessionOwnership(
        'non-existent',
        'user123',
      );
      expect(isValid).toBe(false);
    });
  });

  describe('deleteSession', () => {
    it('should delete existing session', async () => {
      const userId = 'user123';
      const sessionId = await sessionService.createSession(userId);

      const deleted = await sessionService.deleteSession(sessionId);
      expect(deleted).toBe(true);

      const session = sessionService.getSession(sessionId);
      expect(session).toBeUndefined();
    });

    it('should return false for non-existent session', async () => {
      const deleted = await sessionService.deleteSession('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('getUserSessions', () => {
    it('should return all sessions for a user', async () => {
      const userId = 'user123';
      await sessionService.createSession(userId);
      await sessionService.createSession(userId);
      await sessionService.createSession('user456');

      const sessions = sessionService.getUserSessions(userId);
      expect(sessions).toHaveLength(2);
      expect(sessions.every((s) => s.userId === userId)).toBe(true);
    });

    it('should return empty array for user with no sessions', () => {
      const sessions = sessionService.getUserSessions('user123');
      expect(sessions).toEqual([]);
    });
  });

  describe('abortController management', () => {
    it('should create abort controller', () => {
      const requestId = 'req123';
      const controller = sessionService.createAbortController(requestId);

      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);
    });

    it('should abort request', () => {
      const requestId = 'req123';
      const controller = sessionService.createAbortController(requestId);

      sessionService.abortRequest(requestId);
      expect(controller.signal.aborted).toBe(true);
    });

    it('should cleanup abort controller', () => {
      const requestId = 'req123';
      sessionService.createAbortController(requestId);
      sessionService.cleanupAbortController(requestId);

      // 验证已清理（不会抛错）
      sessionService.abortRequest(requestId);
    });
  });
});
