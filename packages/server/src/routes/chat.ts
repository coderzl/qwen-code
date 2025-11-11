/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import type { SessionService } from '../services/SessionService.js';
import {
  GeminiEventType,
  executeToolCall,
  type ToolCallRequestInfo,
} from '@qwen-code/qwen-code-core';
import type { Part } from '@google/genai';
import { CommandProcessorAdapter } from '../adapters/CommandProcessorAdapter.js';

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

      let session;
      let actualSessionId: string;

      // 如果提供了 sessionId，验证是否存在
      if (providedSessionId) {
        session = sessionService.getSession(providedSessionId);
        if (!session) {
          console.log(`[Chat] Session not found: ${providedSessionId}`);
          return reply.code(404).send({
            error: 'Session not found',
            sessionId: providedSessionId,
          });
        }
        actualSessionId = providedSessionId;
        console.log(`[Chat] Using existing session: ${actualSessionId}`);
      } else {
        // 如果没有提供 sessionId，创建新会话
        console.log('[Chat] No sessionId provided, creating new session...');
        actualSessionId = await sessionService.createSession('local-user', {
          workspaceRoot: workspaceRoot || process.cwd(),
          model,
        });
        session = sessionService.getSession(actualSessionId);
        if (!session) {
          console.error('[Chat] Failed to create session');
          return reply.code(500).send({ error: 'Failed to create session' });
        }
        console.log(`[Chat] Created new session: ${actualSessionId}`);
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

        // 处理At命令（@文件引用）
        let processedMessage = message;
        let referencedFiles: Array<{ path: string; size: number }> = [];

        if (message.includes('@')) {
          console.log(
            '[Chat] Detecting @ command, processing file references...',
          );
          try {
            const commandProcessor = new CommandProcessorAdapter(
              session.config,
            );
            const atResult = await commandProcessor.handleAtCommand(message);

            if (atResult.files.length > 0) {
              processedMessage = atResult.processedQuery;
              referencedFiles = atResult.files.map((f) => ({
                path: f.path,
                size: f.size,
              }));

              // 发送文件引用信息
              reply.raw.write(
                `data: ${JSON.stringify({
                  type: 'file_references',
                  files: referencedFiles,
                  timestamp: Date.now(),
                })}\n\n`,
              );

              if (reply.raw.flush) {
                reply.raw.flush();
              }

              console.log(
                `[Chat] Processed ${atResult.files.length} file references`,
              );
            }
          } catch (error) {
            console.error('[Chat] Failed to process @ command:', error);
            // 发送错误事件但继续处理原消息
            reply.raw.write(
              `data: ${JSON.stringify({
                type: 'warning',
                message: `Failed to process file references: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: Date.now(),
              })}\n\n`,
            );

            if (reply.raw.flush) {
              reply.raw.flush();
            }
          }
        }

        // 处理工具调用循环
        let currentMessage: Part[] = [{ text: processedMessage }];
        let turnCount = 0;
        const maxTurns = 10; // 防止无限循环
        let accumulatedResponse = ''; // 累积所有轮次的响应

        while (turnCount < maxTurns) {
          turnCount++;
          console.log(`[Chat] Turn ${turnCount}, sending message to model...`);

          // 直接使用core的流式API
          const stream = session.geminiClient.sendMessageStream(
            currentMessage,
            abortController.signal,
            `prompt_${Date.now()}`,
          );

          console.log('[Chat] Stream created, starting iteration...');

          let eventCount = 0;
          const toolCallRequests: ToolCallRequestInfo[] = [];

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

            // 转换事件类型为字符串（用于发送给客户端）
            let eventType: string;
            const rawEventType = (event as { type: number | string }).type;
            if (typeof rawEventType === 'number') {
              eventType =
                GeminiEventType[rawEventType as keyof typeof GeminiEventType] ||
                'unknown';
            } else {
              eventType = String(rawEventType);
            }

            // 收集响应内容用于历史记录
            const eventValue = 'value' in event ? event.value : undefined;
            if (
              event.type === GeminiEventType.Content &&
              eventValue &&
              typeof eventValue === 'string'
            ) {
              accumulatedResponse += eventValue;
            }

            // 收集工具调用请求（使用枚举值直接比较）
            // 调试：检查事件类型
            if (
              (event.type === GeminiEventType.ToolCallRequest ||
                eventType === 'tool_call_request' ||
                eventType === 'ToolCallRequest') &&
              eventValue
            ) {
              const toolCallRequest = eventValue as ToolCallRequestInfo;
              toolCallRequests.push(toolCallRequest);
              console.log(
                `[Chat] Tool call requested: ${toolCallRequest.name} (${toolCallRequest.callId})`,
                `Event type: ${event.type}, EventType string: ${eventType}`,
              );
            }

            // 序列化并发送事件
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

          console.log(
            `[Chat] Stream completed with ${eventCount} events, tool calls: ${toolCallRequests.length}`,
          );

          // 如果有工具调用请求，执行它们并将结果反馈给模型
          if (toolCallRequests.length > 0) {
            console.log(
              `[Chat] Executing ${toolCallRequests.length} tool call(s)...`,
            );

            const toolResponseParts: Part[] = [];

            for (const requestInfo of toolCallRequests) {
              try {
                // 发送工具执行开始事件
                reply.raw.write(
                  `data: ${JSON.stringify({
                    type: 'tool_execution_start',
                    toolCall: requestInfo,
                    timestamp: Date.now(),
                  })}\n\n`,
                );

                if (reply.raw.flush) {
                  reply.raw.flush();
                }

                // 执行工具调用
                const toolResponse = await executeToolCall(
                  session.config,
                  requestInfo,
                  abortController.signal,
                );

                // 发送工具执行完成事件
                reply.raw.write(
                  `data: ${JSON.stringify({
                    type: 'tool_execution_complete',
                    toolCall: requestInfo,
                    result: toolResponse,
                    timestamp: Date.now(),
                  })}\n\n`,
                );

                if (reply.raw.flush) {
                  reply.raw.flush();
                }

                // 收集工具响应内容（直接使用responseParts，与CLI保持一致）
                if (toolResponse.responseParts) {
                  toolResponseParts.push(...toolResponse.responseParts);
                }

                if (toolResponse.error) {
                  console.error(
                    `[Chat] Tool execution error: ${toolResponse.error}`,
                  );
                  toolResponseParts.push({
                    text: `Tool execution error: ${toolResponse.error}`,
                  });
                }
              } catch (error) {
                console.error(
                  `[Chat] Failed to execute tool ${requestInfo.name}:`,
                  error,
                );
                toolResponseParts.push({
                  text: `Failed to execute tool ${requestInfo.name}: ${
                    error instanceof Error ? error.message : 'Unknown error'
                  }`,
                });
              }
            }

            // 将工具执行结果作为新的用户消息发送给模型
            if (toolResponseParts.length > 0) {
              // 直接使用Part[]格式（与CLI保持一致）
              currentMessage = toolResponseParts;
              console.log(
                `[Chat] Tool execution complete, sending ${toolResponseParts.length} part(s) back to model...`,
              );
              // 继续循环，发送工具结果给模型
              continue;
            }
          }

          // 没有更多工具调用，退出循环
          break;
        }

        // 使用累积的响应
        const finalResponse = accumulatedResponse;

        // 更新会话历史记录
        if (!abortController.signal.aborted && session) {
          const timestamp = Date.now();

          // 添加用户消息到历史
          session.history.push({
            id: session.history.length + 1,
            type: 'user',
            content: message,
            timestamp,
          });

          // 添加助手响应到历史
          if (finalResponse) {
            session.history.push({
              id: session.history.length + 1,
              type: 'assistant',
              content: finalResponse,
              timestamp,
            });
          }

          console.log(
            `[Chat] Updated history, total messages: ${session.history.length}`,
          );
        }

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
