/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SessionService } from '../services/SessionService.js';
import type { CreateSessionOptions } from '../types/index.js';

export async function sessionRoutes(fastify: FastifyInstance) {
  const sessionService = fastify.sessionService as SessionService;

  /**
   * 创建会话
   * POST /api/session
   */
  fastify.post<{
    Body: CreateSessionOptions;
  }>(
    '/api/session',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            workspaceRoot: { type: 'string' },
            model: { type: 'string' },
            metadata: { type: 'object' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: CreateSessionOptions }>,
      _reply: FastifyReply,
    ) => {
      // 使用固定的本地用户ID
      const userId = 'local-user';
      const options = request.body;

      const sessionId = await sessionService.createSession(userId, options);

      return {
        sessionId,
        createdAt: new Date().toISOString(),
      };
    },
  );

  /**
   * 获取会话信息
   * GET /api/session/:sessionId
   */
  fastify.get<{
    Params: { sessionId: string };
  }>(
    '/api/session/:sessionId',
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = request.params;

      const stats = sessionService.getSessionStats(sessionId);
      if (!stats) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      return stats;
    },
  );

  /**
   * 删除会话
   * DELETE /api/session/:sessionId
   */
  fastify.delete<{
    Params: { sessionId: string };
  }>(
    '/api/session/:sessionId',
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = request.params;

      const deleted = await sessionService.deleteSession(sessionId);
      if (!deleted) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      return { success: true };
    },
  );

  /**
   * 获取所有会话
   * GET /api/sessions
   */
  fastify.get(
    '/api/sessions',
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      // 获取所有会话（单用户模式）
      const userId = 'local-user';
      const sessions = sessionService.getUserSessions(userId);

      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          createdAt: s.createdAt,
          lastActivity: s.lastActivity,
          metadata: s.metadata,
        })),
        total: sessions.length,
      };
    },
  );
}
