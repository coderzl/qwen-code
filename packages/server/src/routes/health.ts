/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SessionService } from '../services/SessionService.js';

export async function healthRoutes(fastify: FastifyInstance) {
  /**
   * 健康检查
   */
  fastify.get(
    '/health',
    async (_request: FastifyRequest, _reply: FastifyReply) => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }),
  );

  /**
   * 就绪检查
   */
  fastify.get(
    '/ready',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // 检查关键服务是否就绪
      try {
        const sessionService = fastify.sessionService as SessionService;
        const stats = sessionService.getServiceStats();

        return {
          status: 'ready',
          timestamp: new Date().toISOString(),
          sessions: stats.totalSessions,
        };
      } catch (error) {
        return reply.code(503).send({
          status: 'not ready',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );
}
