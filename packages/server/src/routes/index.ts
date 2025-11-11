/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { sessionRoutes } from './session.js';
import { chatRoutes } from './chat.js';
import { fileRoutes } from './files.js';

/**
 * 注册所有路由
 */
export async function setupRoutes(fastify: FastifyInstance): Promise<void> {
  // 健康检查路由
  await fastify.register(healthRoutes);

  // 会话管理路由
  await fastify.register(sessionRoutes);

  // 聊天路由
  await fastify.register(chatRoutes);

  // 文件操作路由
  await fastify.register(fileRoutes);
}
