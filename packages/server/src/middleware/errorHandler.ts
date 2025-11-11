/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // 记录错误
  request.log.error(error);

  // 401错误（保留用于未来认证）
  if (error.statusCode === 401) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: error.message,
    });
  }

  // 验证错误
  if (error.validation) {
    return reply.code(400).send({
      error: 'Validation Error',
      message: error.message,
      details: error.validation,
    });
  }

  // 速率限制错误
  if (error.statusCode === 429) {
    return reply.code(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    });
  }

  // 默认错误
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Internal Server Error' : error.message;

  return reply.code(statusCode).send({
    error: statusCode === 500 ? 'Internal Server Error' : error.name,
    message,
  });
}
