/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * 日志中间件
 */
export async function loggingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const startTime = Date.now();

  // 在响应发送后记录
  reply.raw.on('finish', () => {
    const duration = Date.now() - startTime;
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
      userId: request.user?.userId,
    });
  });
}
