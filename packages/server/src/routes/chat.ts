/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import type { SessionService } from '../services/SessionService.js';
import { GeminiEventType } from '@qwen-code/qwen-code-core';

export async function chatRoutes(fastify: FastifyInstance) {
  const sessionService = fastify.sessionService as SessionService;

  /**
   * SSE流式聊天
   * GET /api/chat/stream
   *
   * 使用Server-Sent Events进行流式响应
   */
  fastify.get<{
    Querystring: {
      sessionId: string;
      message: string;
    };
  }>(
    '/api/chat/stream',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['sessionId', 'message'],
          properties: {
            sessionId: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { sessionId: string; message: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId, message } = request.query;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      // 生成请求ID用于取消控制
      const requestId = `req_${Date.now()}_${randomUUID()}`;
      const abortController = sessionService.createAbortController(requestId);

      // 设置SSE响应头
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no'); // 禁用nginx缓冲

      // 处理客户端断开连接
      request.raw.on('close', () => {
        abortController.abort();
        sessionService.cleanupAbortController(requestId);
      });

      try {
        // 发送初始事件，包含requestId用于客户端取消
        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'connected',
            requestId,
            timestamp: Date.now(),
          })}\n\n`,
        );

        // 直接使用core的流式API
        const stream = session.geminiClient.sendMessageStream(
          [{ text: message }],
          abortController.signal,
          `prompt_${Date.now()}`,
        );

        for await (const event of stream) {
          if (abortController.signal.aborted) {
            reply.raw.write(
              `data: ${JSON.stringify({
                type: 'cancelled',
                timestamp: Date.now(),
              })}\n\n`,
            );
            break;
          }

          // 转换事件类型为字符串
          let eventType: string;
          if (typeof event.type === 'number') {
            eventType =
              GeminiEventType[event.type as keyof typeof GeminiEventType] ||
              'unknown';
          } else {
            eventType = event.type as string;
          }

          // 序列化并发送事件
          const eventValue = 'value' in event ? event.value : undefined;
          reply.raw.write(
            `data: ${JSON.stringify({
              type: eventType,
              value: eventValue,
              timestamp: Date.now(),
            })}\n\n`,
          );

          // 立即刷新缓冲区
          if (reply.raw.flush) {
            reply.raw.flush();
          }
        }

        // 发送结束事件
        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'stream_end',
            timestamp: Date.now(),
          })}\n\n`,
        );
      } catch (error) {
        // 发送错误事件
        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          })}\n\n`,
        );
      } finally {
        sessionService.cleanupAbortController(requestId);
        reply.raw.end();
      }
    },
  );

  /**
   * 取消流式请求
   * POST /api/chat/cancel
   */
  fastify.post<{
    Body: {
      requestId: string;
    };
  }>(
    '/api/chat/cancel',
    {
      schema: {
        body: {
          type: 'object',
          required: ['requestId'],
          properties: {
            requestId: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { requestId: string } }>,
      _reply: FastifyReply,
    ) => {
      const { requestId } = request.body;

      // 取消对应的请求
      sessionService.abortRequest(requestId);

      return { success: true, requestId };
    },
  );

  /**
   * 获取历史记录
   * GET /api/chat/history/:sessionId
   */
  fastify.get<{
    Params: { sessionId: string };
    Querystring: { limit?: number; offset?: number };
  }>(
    '/api/chat/history/:sessionId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { sessionId: string };
        Querystring: { limit?: number; offset?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = request.params;
      const { limit = 50, offset = 0 } = request.query;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const fullHistory = session.history;
      const paginatedHistory = fullHistory.slice(offset, offset + limit);

      return {
        history: paginatedHistory,
        total: fullHistory.length,
        limit,
        offset,
      };
    },
  );
}
