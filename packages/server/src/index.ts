/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import { config as dotenvConfig } from 'dotenv';
import { setupRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { loggingMiddleware } from './middleware/logging.js';
import { SessionService } from './services/SessionService.js';

// 加载环境变量
dotenvConfig();

async function start() {
  // 配置logger
  const loggerConfig: {
    level: string;
    transport?: {
      target: string;
      options: Record<string, unknown>;
    };
  } = {
    level: process.env['LOG_LEVEL'] || 'info',
  };

  // 开发环境尝试使用pino-pretty，如果不可用则降级
  if (process.env['NODE_ENV'] === 'development') {
    try {
      loggerConfig.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      };
    } catch (_error) {
      // pino-pretty不可用，使用默认logger
      console.log('pino-pretty not available, using default logger');
    }
  }

  const fastify = Fastify({
    logger: loggerConfig,
    bodyLimit: 10 * 1024 * 1024, // 10MB
    trustProxy: true,
  });

  // 注册CORS
  await fastify.register(fastifyCors, {
    origin: process.env['CORS_ORIGIN']?.split(',') || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // 注册全局中间件
  fastify.addHook('onRequest', loggingMiddleware);

  // 注册错误处理
  fastify.setErrorHandler(errorHandler);

  // 初始化服务
  const sessionService = new SessionService();

  // 将服务注入到Fastify装饰器
  fastify.decorate('sessionService', sessionService);

  // 注册路由
  await setupRoutes(fastify);

  // 优雅关闭处理
  const closeGracefully = async (signal: string) => {
    fastify.log.info(`Received ${signal}, closing gracefully...`);
    await sessionService.cleanup();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => closeGracefully('SIGTERM'));
  process.on('SIGINT', () => closeGracefully('SIGINT'));

  // 启动服务器
  const port = parseInt(process.env['PORT'] || '3000', 10);
  const host = process.env['HOST'] || '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    fastify.log.info(`🚀 Qwen Code Server listening on http://${host}:${port}`);
    fastify.log.info(`📚 Health check: http://${host}:${port}/health`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
