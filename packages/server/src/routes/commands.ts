/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SessionService } from '../services/SessionService.js';
import { CommandProcessorAdapter } from '../adapters/CommandProcessorAdapter.js';

export async function commandRoutes(fastify: FastifyInstance) {
  const sessionService = fastify.sessionService as SessionService;

  /**
   * 列出所有可用命令
   * POST /api/commands/list
   */
  fastify.post<{
    Body: {
      sessionId: string;
    };
  }>(
    '/api/commands/list',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = request.body;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      try {
        const commandProcessor = new CommandProcessorAdapter(session.config);
        await commandProcessor.initializeCommands();

        const commands = await commandProcessor.getCommands();

        return {
          success: true,
          commands,
          total: commands.length,
        };
      } catch (error) {
        console.error('[Commands] Error listing commands:', error);
        return reply.code(500).send({
          error: 'Failed to list commands',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * 执行命令
   * POST /api/commands/execute
   */
  fastify.post<{
    Body: {
      sessionId: string;
      command: string;
      args?: string;
    };
  }>(
    '/api/commands/execute',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sessionId', 'command'],
          properties: {
            sessionId: { type: 'string' },
            command: { type: 'string' },
            args: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { sessionId: string; command: string; args?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId, command, args = '' } = request.body;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      try {
        // 移除命令前的/符号（如果有）
        const commandName = command.startsWith('/')
          ? command.slice(1)
          : command;

        const commandProcessor = new CommandProcessorAdapter(session.config);
        await commandProcessor.initializeCommands();

        const result = await commandProcessor.executeSlashCommand(
          commandName,
          args,
        );

        if (!result.success) {
          return reply.code(400).send({
            success: false,
            error: result.error,
          });
        }

        return {
          success: true,
          command: commandName,
          output: result.output,
        };
      } catch (error) {
        console.error('[Commands] Error executing command:', error);
        return reply.code(500).send({
          error: 'Failed to execute command',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  /**
   * 获取命令帮助
   * POST /api/commands/help
   */
  fastify.post<{
    Body: {
      sessionId: string;
      command?: string;
    };
  }>(
    '/api/commands/help',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string' },
            command: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { sessionId: string; command?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId, command } = request.body;

      const session = sessionService.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      try {
        const commandProcessor = new CommandProcessorAdapter(session.config);
        await commandProcessor.initializeCommands();

        const commands = await commandProcessor.getCommands();

        // 如果指定了命令，返回该命令的详细信息
        if (command) {
          const commandName = command.startsWith('/')
            ? command.slice(1)
            : command;
          const cmdInfo = commands.find((c) => c.name === commandName);

          if (!cmdInfo) {
            return reply.code(404).send({
              error: `Command not found: /${commandName}`,
            });
          }

          return {
            success: true,
            command: cmdInfo,
          };
        }

        // 否则返回所有命令的摘要
        return {
          success: true,
          commands: commands.map((c) => ({
            name: c.name,
            description: c.description,
          })),
          total: commands.length,
        };
      } catch (error) {
        console.error('[Commands] Error getting help:', error);
        return reply.code(500).send({
          error: 'Failed to get command help',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );
}
