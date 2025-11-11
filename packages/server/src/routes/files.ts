/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
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
      const { sessionId, path: filePath, offset, limit } = request.body;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const workspaceRoot = session.config.getProjectRoot();

      // 路径安全检查
      if (!validateFilePath(filePath, workspaceRoot)) {
        return reply.code(400).send({ error: 'Invalid path' });
      }

      // 转换为绝对路径
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(workspaceRoot, filePath);

      try {
        // 使用core的executeToolCall
        const result = await executeToolCall(
          session.config,
          {
            name: 'read_file',
            callId: `read_${Date.now()}`,
            args: { absolute_path: absolutePath, offset, limit },
            isClientInitiated: true,
            prompt_id: `http_read_${Date.now()}`,
          },
          new AbortController().signal,
        );

        // 从 responseParts 中提取实际内容
        // responseParts 格式：functionResponse.response.output 包含实际的文件内容
        let content = '';
        if (result.responseParts && result.responseParts.length > 0) {
          for (const part of result.responseParts) {
            // 检查 functionResponse 格式（工具返回的标准格式）
            if (part.functionResponse?.response) {
              const output = part.functionResponse.response['output'];
              if (output && typeof output === 'string') {
                content += output;
                continue; // 找到 output 后继续下一个 part
              }
            }
            // 兼容 text 格式
            if ('text' in part && part.text) {
              content += part.text;
            }
          }
        }

        return {
          success: true,
          content: content || (result.resultDisplay as string) || '',
          path: filePath,
          displaySummary: result.resultDisplay,
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
      const { sessionId, path: filePath, content } = request.body;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const workspaceRoot = session.config.getProjectRoot();

      // 路径安全检查
      if (!validateFilePath(filePath, workspaceRoot)) {
        return reply.code(400).send({ error: 'Invalid path' });
      }

      // 转换为绝对路径
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(workspaceRoot, filePath);

      try {
        await executeToolCall(
          session.config,
          {
            name: 'write_file', // 正确的工具名称
            callId: `write_${Date.now()}`,
            args: { file_path: absolutePath, content },
            isClientInitiated: true,
            prompt_id: `http_write_${Date.now()}`,
          },
          new AbortController().signal,
        );

        return {
          success: true,
          path: filePath,
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
      const {
        sessionId,
        pattern,
        path: searchPath,
        maxResults = 100,
      } = request.body;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const workspaceRoot = session.config.getProjectRoot();

      // 如果提供了路径，转换为绝对路径
      let absoluteSearchPath: string | undefined;
      if (searchPath) {
        absoluteSearchPath = path.isAbsolute(searchPath)
          ? searchPath
          : path.join(workspaceRoot, searchPath);
      } else {
        // 如果未提供路径，使用 workspaceRoot
        absoluteSearchPath = workspaceRoot;
      }

      try {
        const result = await executeToolCall(
          session.config,
          {
            name: 'search_file_content', // 正确的工具名称
            callId: `search_${Date.now()}`,
            args: { pattern, path: absoluteSearchPath, head_limit: maxResults },
            isClientInitiated: true,
            prompt_id: `http_search_${Date.now()}`,
          },
          new AbortController().signal,
        );

        // 从 responseParts 中提取实际内容
        // responseParts 格式：functionResponse.response.output 包含实际的搜索结果
        let results = '';
        if (result.responseParts && result.responseParts.length > 0) {
          for (const part of result.responseParts) {
            // 检查 functionResponse 格式（工具返回的标准格式）
            if (part.functionResponse?.response) {
              const output = part.functionResponse.response['output'];
              if (output && typeof output === 'string') {
                results += output;
                continue; // 找到 output 后继续下一个 part
              }
            }
            // 兼容 text 格式
            if ('text' in part && part.text) {
              results += part.text;
            }
          }
        }

        return {
          success: true,
          results: results || (result.resultDisplay as string) || '',
          displaySummary: result.resultDisplay,
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
      const { sessionId, path: dirPath } = request.body;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const workspaceRoot = session.config.getProjectRoot();

      // 路径安全检查
      if (!validateFilePath(dirPath, workspaceRoot)) {
        return reply.code(400).send({ error: 'Invalid path' });
      }

      // 转换为绝对路径
      const absolutePath = path.isAbsolute(dirPath)
        ? dirPath
        : path.join(workspaceRoot, dirPath);

      try {
        const result = await executeToolCall(
          session.config,
          {
            name: 'list_directory', // 正确的工具名称
            callId: `list_${Date.now()}`,
            args: { path: absolutePath },
            isClientInitiated: true,
            prompt_id: `http_list_${Date.now()}`,
          },
          new AbortController().signal,
        );

        // 从 responseParts 中提取实际内容
        // responseParts 格式：functionResponse.response.output 包含实际的目录列表
        let contents = '';
        if (result.responseParts && result.responseParts.length > 0) {
          for (const part of result.responseParts) {
            // 检查 functionResponse 格式（工具返回的标准格式）
            if (part.functionResponse?.response) {
              const output = part.functionResponse.response['output'];
              if (output && typeof output === 'string') {
                contents += output;
                continue; // 找到 output 后继续下一个 part
              }
            }
            // 兼容 text 格式
            if ('text' in part && part.text) {
              contents += part.text;
            }
          }
        }

        // 如果提取失败，使用 resultDisplay 作为回退（但这不是期望的）
        const finalContents =
          contents || (result.resultDisplay as string) || '';

        return {
          success: true,
          contents: finalContents,
          path: dirPath,
          displaySummary: result.resultDisplay,
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
