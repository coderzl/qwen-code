/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SessionService } from '../services/SessionService.js';
import { executeToolCall } from '@qwen-code/qwen-code-core';
import { validateFilePath } from '../utils/pathSecurity.js';

export async function fileRoutes(fastify: FastifyInstance) {
  const sessionService = fastify.sessionService as SessionService;

  /**
   * 读取文件
   * POST /api/files/read
   */
  fastify.post<{
    Body: {
      sessionId: string;
      path: string;
      offset?: number;
      limit?: number;
    };
  }>(
    '/api/files/read',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sessionId', 'path'],
          properties: {
            sessionId: { type: 'string' },
            path: { type: 'string' },
            offset: { type: 'number' },
            limit: { type: 'number' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          sessionId: string;
          path: string;
          offset?: number;
          limit?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId, path, offset, limit } = request.body;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const workspaceRoot = session.config.getProjectRoot();

      // 路径安全检查
      if (!validateFilePath(path, workspaceRoot)) {
        return reply.code(400).send({ error: 'Invalid path' });
      }

      try {
        // 使用core的executeToolCall
        const result = await executeToolCall(
          session.config,
          {
            name: 'read_file',
            callId: `read_${Date.now()}`,
            args: { target_file: path, offset, limit },
            isClientInitiated: true,
            prompt_id: `http_read_${Date.now()}`,
          },
          new AbortController().signal,
        );

        return {
          success: true,
          content: result.resultDisplay,
          path,
        };
      } catch (error) {
        return reply.code(500).send({
          error: 'Failed to read file',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * 写入文件
   * POST /api/files/write
   */
  fastify.post<{
    Body: {
      sessionId: string;
      path: string;
      content: string;
    };
  }>(
    '/api/files/write',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sessionId', 'path', 'content'],
          properties: {
            sessionId: { type: 'string' },
            path: { type: 'string' },
            content: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { sessionId: string; path: string; content: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId, path, content } = request.body;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const workspaceRoot = session.config.getProjectRoot();

      // 路径安全检查
      if (!validateFilePath(path, workspaceRoot)) {
        return reply.code(400).send({ error: 'Invalid path' });
      }

      try {
        await executeToolCall(
          session.config,
          {
            name: 'write',
            callId: `write_${Date.now()}`,
            args: { file_path: path, contents: content },
            isClientInitiated: true,
            prompt_id: `http_write_${Date.now()}`,
          },
          new AbortController().signal,
        );

        return {
          success: true,
          path,
          bytesWritten: content.length,
        };
      } catch (error) {
        return reply.code(500).send({
          error: 'Failed to write file',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * 搜索文件
   * POST /api/files/search
   */
  fastify.post<{
    Body: {
      sessionId: string;
      pattern: string;
      path?: string;
      maxResults?: number;
    };
  }>(
    '/api/files/search',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sessionId', 'pattern'],
          properties: {
            sessionId: { type: 'string' },
            pattern: { type: 'string' },
            path: { type: 'string' },
            maxResults: { type: 'number', default: 100 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          sessionId: string;
          pattern: string;
          path?: string;
          maxResults?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId, pattern, path, maxResults = 100 } = request.body;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      try {
        const result = await executeToolCall(
          session.config,
          {
            name: 'grep',
            callId: `search_${Date.now()}`,
            args: { pattern, path, head_limit: maxResults },
            isClientInitiated: true,
            prompt_id: `http_search_${Date.now()}`,
          },
          new AbortController().signal,
        );

        return {
          success: true,
          results: result.resultDisplay,
        };
      } catch (error) {
        return reply.code(500).send({
          error: 'Failed to search files',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * 列出目录
   * POST /api/files/list
   */
  fastify.post<{
    Body: {
      sessionId: string;
      path: string;
    };
  }>(
    '/api/files/list',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sessionId', 'path'],
          properties: {
            sessionId: { type: 'string' },
            path: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { sessionId: string; path: string } }>,
      reply: FastifyReply,
    ) => {
      const { sessionId, path } = request.body;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const workspaceRoot = session.config.getProjectRoot();

      // 路径安全检查
      if (!validateFilePath(path, workspaceRoot)) {
        return reply.code(400).send({ error: 'Invalid path' });
      }

      try {
        const result = await executeToolCall(
          session.config,
          {
            name: 'list_dir',
            callId: `list_${Date.now()}`,
            args: { target_directory: path },
            isClientInitiated: true,
            prompt_id: `http_list_${Date.now()}`,
          },
          new AbortController().signal,
        );

        return {
          success: true,
          contents: result.resultDisplay,
          path,
        };
      } catch (error) {
        return reply.code(500).send({
          error: 'Failed to list directory',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );
}
