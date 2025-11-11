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
   * POST /api/chat/stream
   *
   * 使用Server-Sent Events进行流式响应
   *
   * 功能：
   * - 如果提供了有效的 sessionId，使用该 session
   * - 如果 sessionId 不存在或未提供，自动创建新 session
   * - 返回的第一个事件包含使用的 sessionId
   */
  fastify.post<{
    Body: {
      sessionId?: string;
      message: string;
      workspaceRoot?: string;
      model?: string;
    };
  }>(
    '/api/chat/stream',
    {
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            sessionId: { type: 'string' },
            message: { type: 'string' },
            workspaceRoot: { type: 'string' },
            model: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          sessionId?: string;
          message: string;
          workspaceRoot?: string;
          model?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const {
        sessionId: providedSessionId,
        message,
        workspaceRoot,
        model,
      } = request.body;

      // 获取或创建 session
      let session = providedSessionId
        ? sessionService.getSession(providedSessionId)
        : undefined;

      let actualSessionId = providedSessionId;

      // 如果 session 不存在，创建新的
      if (!session) {
        console.log(
          `[Chat] Session ${providedSessionId || 'not provided'}, creating new session...`,
        );
        actualSessionId = await sessionService.createSession('local-user', {
          workspaceRoot: workspaceRoot || process.cwd(),
          model,
        });
        session = sessionService.getSession(actualSessionId);
        console.log(`[Chat] Created new session: ${actualSessionId}`);
      }

      if (!session) {
        return reply.code(500).send({ error: 'Failed to create session' });
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
      // 注意：对于POST+SSE，request body已经接收完毕
      // 应该监听响应端（reply）的断开，而不是请求端（request）
      reply.raw.on('close', () => {
        console.log('[Chat] Client disconnected');
        abortController.abort();
        sessionService.cleanupAbortController(requestId);
      });

      try {
        // 发送初始事件，包含requestId和实际使用的sessionId
        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'connected',
            requestId,
            sessionId: actualSessionId,
            timestamp: Date.now(),
          })}\n\n`,
        );

        // 立即刷新，确保客户端收到连接确认
        if (reply.raw.flush) {
          reply.raw.flush();
        }

        console.log(
          `[Chat] Starting stream for session ${actualSessionId}, message: ${message}`,
        );
        console.log(
          `[Chat] GeminiClient initialized: ${session.geminiClient.isInitialized()}`,
        );

        // 检查是否已中止
        if (abortController.signal.aborted) {
          console.log('[Chat] Already aborted before stream start');
          throw new Error('Request aborted before stream start');
        }

        // 直接使用core的流式API
        const stream = session.geminiClient.sendMessageStream(
          [{ text: message }],
          abortController.signal,
          `prompt_${Date.now()}`,
        );

        console.log('[Chat] Stream created, starting iteration...');

        let eventCount = 0;
        for await (const event of stream) {
          eventCount++;

          if (abortController.signal.aborted) {
            console.log(`[Chat] Stream aborted after ${eventCount} events`);
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

        console.log(`[Chat] Stream completed with ${eventCount} events`);

        // 发送结束事件
        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'stream_end',
            timestamp: Date.now(),
          })}\n\n`,
        );
      } catch (error) {
        console.error('[Chat] Stream error:', error);

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
        console.log('[Chat] Stream connection closed');
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
   * POST /api/chat/history
   */
  fastify.post<{
    Body: { sessionId: string; limit?: number; offset?: number };
  }>(
    '/api/chat/history',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string' },
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { sessionId: string; limit?: number; offset?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId, limit = 50, offset = 0 } = request.body;

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
