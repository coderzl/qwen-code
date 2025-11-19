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
  // 注意：当 credentials: true 时，不能使用 origin: '*'
  // 需要明确指定允许的源
  // 开发环境默认允许 localhost:5173（前端）和 localhost:3000（后端）
  const isDevelopment =
    !process.env['NODE_ENV'] || process.env['NODE_ENV'] === 'development';

  // 开发环境：使用函数动态判断origin，允许所有来源
  // 生产环境：使用环境变量或默认列表
  const corsOrigin = process.env['CORS_ORIGIN']
    ? process.env['CORS_ORIGIN'].split(',').map((o) => o.trim())
    : isDevelopment
      ? (
          origin: string | undefined,
          callback: (err: Error | null, allow: boolean | string) => void,
        ) => {
          // 开发环境：允许所有来源
          // 包括 localhost、127.0.0.1 和所有IP地址
          fastify.log.info(
            `[CORS] Origin callback called with: ${origin || 'undefined'}`,
          );
          if (!origin) {
            // 没有origin（如Postman等工具），允许
            fastify.log.info('[CORS] No origin, allowing');
            callback(null, true);
            return;
          }
          // 允许所有HTTP来源（开发环境）
          // 返回origin字符串，这样@fastify/cors会设置正确的Access-Control-Allow-Origin头
          if (origin.startsWith('http://') || origin.startsWith('https://')) {
            fastify.log.info(`[CORS] Allowing origin: ${origin}`);
            callback(null, origin);
            return;
          }
          fastify.log.warn(`[CORS] Rejecting origin: ${origin}`);
          callback(null, false);
        }
      : [
          'http://localhost:5173',
          'http://localhost:3000',
          'http://127.0.0.1:5173',
        ];

  fastify.log.info(
    `[CORS] Configuring CORS in ${isDevelopment ? 'development' : 'production'} mode`,
  );

  // 添加全局hook处理OPTIONS预检请求（必须在@fastify/cors之前）
  // 这样可以确保OPTIONS请求在路由匹配之前就被处理
  fastify.addHook('onRequest', async (request, reply) => {
    const method = request.method;
    const origin = request.headers.origin;

    // 优先处理OPTIONS预检请求
    if (method === 'OPTIONS') {
      fastify.log.info(
        `[CORS Preflight] Received OPTIONS request, origin: ${origin || 'none'}, path: ${request.url}`,
      );

      // 开发环境：允许所有HTTP/HTTPS来源
      if (
        origin &&
        isDevelopment &&
        (origin.startsWith('http://') || origin.startsWith('https://'))
      ) {
        fastify.log.info(
          `[CORS Preflight] Allowing OPTIONS for origin: ${origin}, path: ${request.url}`,
        );
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
        reply.header(
          'Access-Control-Allow-Methods',
          'GET, POST, PUT, DELETE, OPTIONS',
        );
        reply.header(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Requested-With',
        );
        reply.header('Access-Control-Max-Age', '86400'); // 24小时
        // OPTIONS请求直接返回，不继续处理
        await reply.code(200).send();
        return;
      } else {
        fastify.log.warn(
          `[CORS Preflight] Rejecting OPTIONS for origin: ${origin || 'none'}, path: ${request.url}`,
        );
      }
    }
  });

  await fastify.register(fastifyCors, {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Type'],
    preflight: true, // 明确启用预检请求处理
    // 注意：我们在hook中已经处理了OPTIONS请求，这里作为备用
  });

  // 添加全局hook确保CORS头在所有请求上正确设置（作为备用方案）
  fastify.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    const method = request.method;
    const url = request.url;

    // 记录所有请求的CORS相关信息（开发环境）
    // 注意：OPTIONS请求已经在第一个hook中处理，这里只处理非OPTIONS请求
    if (isDevelopment && method !== 'OPTIONS') {
      fastify.log.info(
        `[CORS Hook] ${method} ${url}, origin: ${origin || 'none'}`,
      );
    }

    // 对于其他请求（非OPTIONS），确保CORS头被设置
    if (
      origin &&
      isDevelopment &&
      (origin.startsWith('http://') || origin.startsWith('https://'))
    ) {
      // 检查是否已经有CORS头（@fastify/cors可能已经设置了）
      const existingOrigin = reply.getHeader('Access-Control-Allow-Origin');

      // 如果没有CORS头，或者现有的CORS头不匹配，则设置
      if (!existingOrigin || existingOrigin !== origin) {
        fastify.log.info(
          `[CORS Hook] Setting CORS headers for origin: ${origin}, existing: ${existingOrigin || 'none'}`,
        );
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
      } else {
        fastify.log.debug(
          `[CORS Hook] CORS headers already set correctly for origin: ${origin}`,
        );
      }
    }
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
