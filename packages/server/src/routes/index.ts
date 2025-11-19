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
import { commandRoutes } from './commands.js';

/**
 * 注册所有路由
 */
export async function setupRoutes(fastify: FastifyInstance): Promise<void> {
  // 注意：OPTIONS请求已经在index.ts的hook中处理，不需要在这里注册
  // @fastify/cors插件也会处理OPTIONS请求，但我们的hook会优先处理

  // 健康检查路由
  await fastify.register(healthRoutes);

  // 会话管理路由
  await fastify.register(sessionRoutes);

  // 聊天路由
  await fastify.register(chatRoutes);

  // 文件操作路由
  await fastify.register(fileRoutes);

  // 命令路由
  await fastify.register(commandRoutes);
}
