/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { GeminiClient, Config } from '@qwen-code/qwen-code-core';
import type {
  SessionContext,
  CreateSessionOptions,
  SessionStats,
} from '../types/index.js';

export class SessionService extends EventEmitter {
  private sessions: Map<string, SessionContext> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30分钟
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    super();

    // 定期清理过期会话
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredSessions(),
      60000, // 每分钟检查一次
    );
  }

  /**
   * 创建新会话
   */
  async createSession(
    userId: string,
    options: CreateSessionOptions = {},
  ): Promise<string> {
    const sessionId = randomUUID();

    // 创建配置 - 直接使用core的Config
    const config = await this.createConfig(userId, sessionId, options);

    // 创建GeminiClient - 直接使用core组件
    const geminiClient = new GeminiClient(config);

    const session: SessionContext = {
      id: sessionId,
      userId,
      config,
      geminiClient,
      history: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      metadata: options.metadata,
    };

    this.sessions.set(sessionId, session);

    this.emit('session_created', {
      sessionId,
      userId,
      timestamp: new Date(),
    });

    return sessionId;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): SessionContext | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  /**
   * 验证会话归属（简化版：单用户模式，总是返回true）
   */
  validateSessionOwnership(sessionId: string, _userId: string): boolean {
    // 单用户模式：只要会话存在就返回true
    const session = this.getSession(sessionId);
    return session !== undefined;
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.sessions.delete(sessionId);

    this.emit('session_deleted', {
      sessionId,
      userId: session.userId,
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * 获取用户的所有会话
   */
  getUserSessions(userId: string): SessionContext[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.userId === userId,
    );
  }

  /**
   * 获取会话统计
   */
  getSessionStats(sessionId: string): SessionStats | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      id: sessionId,
      userId: session.userId,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      duration: Date.now() - session.createdAt.getTime(),
      messageCount: session.history.length,
      metadata: session.metadata,
    };
  }

  /**
   * 创建中止控制器(用于取消流式请求)
   */
  createAbortController(requestId: string): AbortController {
    const controller = new AbortController();
    this.abortControllers.set(requestId, controller);
    return controller;
  }

  /**
   * 中止请求
   */
  abortRequest(requestId: string): void {
    const controller = this.abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(requestId);
    }
  }

  /**
   * 清理中止控制器
   */
  cleanupAbortController(requestId: string): void {
    this.abortControllers.delete(requestId);
  }

  /**
   * 清理过期会话
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
        expiredSessions.push(id);
      }
    }

    for (const sessionId of expiredSessions) {
      this.deleteSession(sessionId);
    }

    if (expiredSessions.length > 0) {
      this.emit('sessions_expired', {
        count: expiredSessions.length,
        sessionIds: expiredSessions,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 清理所有会话(用于优雅关闭)
   */
  async cleanup(): Promise<void> {
    clearInterval(this.cleanupInterval);

    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((id) => this.deleteSession(id)));
  }

  /**
   * 获取服务统计
   */
  getServiceStats() {
    return {
      totalSessions: this.sessions.size,
      activeAbortControllers: this.abortControllers.size,
    };
  }

  /**
   * 创建配置 - 直接使用core的Config
   */
  private async createConfig(
    userId: string,
    sessionId: string,
    options: CreateSessionOptions,
  ): Promise<Config> {
    // 这里简化处理，实际应该从数据库加载用户配置
    // 现在直接使用默认配置
    const targetDir = options.workspaceRoot || process.cwd();
    const config = new Config({
      sessionId,
      targetDir,
      cwd: targetDir,
      debugMode: false,
      model: options.model || 'qwen-code',
      usageStatisticsEnabled: false,
    });

    await config.initialize();
    return config;
  }
}
