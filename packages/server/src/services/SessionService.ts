/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  Config,
  AuthType,
  ApprovalMode,
  type ContentGeneratorConfig,
} from '@qwen-code/qwen-code-core';
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

    // 使用config中已经初始化好的geminiClient
    // 不要创建新的GeminiClient，因为config.geminiClient已经在createConfig中初始化完成
    const geminiClient = config.getGeminiClient();

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
   * 更新会话的workspaceRoot
   * 注意：这会重新创建Config和GeminiClient，但保留会话历史
   */
  async updateWorkspaceRoot(
    sessionId: string,
    workspaceRoot: string,
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    console.log(
      `[SessionService] Updating workspaceRoot for session ${sessionId} to ${workspaceRoot}`,
    );

    try {
      // 保存当前会话的元数据
      const currentMetadata = session.metadata;
      const currentHistory = session.history;

      // 重新创建Config（使用新的workspaceRoot）
      const newConfig = await this.createConfig(session.userId, sessionId, {
        workspaceRoot,
        model: session.config.getModel(),
        metadata: currentMetadata,
      });

      // 更新会话的Config和GeminiClient
      session.config = newConfig;
      session.geminiClient = newConfig.getGeminiClient();
      session.lastActivity = new Date();

      // 保留历史记录
      session.history = currentHistory;

      this.emit('session_updated', {
        sessionId,
        userId: session.userId,
        timestamp: new Date(),
        updateType: 'workspaceRoot',
      });

      console.log(
        `[SessionService] Successfully updated workspaceRoot for session ${sessionId}`,
      );
      return true;
    } catch (error) {
      console.error(
        `[SessionService] Failed to update workspaceRoot for session ${sessionId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * 添加额外目录到工作空间（不改变主目录）
   * 与CLI的 /directory add 命令功能一致
   */
  async addWorkspaceDirectory(
    sessionId: string,
    directories: string[],
  ): Promise<{
    success: boolean;
    added: string[];
    errors: string[];
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        added: [],
        errors: ['Session not found'],
      };
    }

    console.log(
      `[SessionService] Adding directories to session ${sessionId}: ${directories.join(', ')}`,
    );

    const workspaceContext = session.config.getWorkspaceContext();
    const added: string[] = [];
    const errors: string[] = [];

    // 展开路径（支持 ~ 和 %userprofile%）
    const expandHomeDir = (p: string): string => {
      if (!p) {
        return '';
      }
      let expandedPath = p;
      if (p.toLowerCase().startsWith('%userprofile%')) {
        expandedPath = os.homedir() + p.substring('%userprofile%'.length);
      } else if (p === '~' || p.startsWith('~/')) {
        expandedPath = os.homedir() + p.substring(1);
      }
      return path.normalize(expandedPath);
    };

    // 添加每个目录
    for (const directory of directories) {
      try {
        const expandedPath = expandHomeDir(directory.trim());
        workspaceContext.addDirectory(
          expandedPath,
          session.config.getTargetDir(),
        );
        added.push(directory.trim());
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        errors.push(`Error adding '${directory.trim()}': ${error.message}`);
      }
    }

    // 如果有成功添加的目录，更新GeminiClient的上下文
    if (added.length > 0) {
      try {
        await session.geminiClient.addDirectoryContext();
        console.log(
          `[SessionService] Successfully added ${added.length} directory(ies) and updated context`,
        );
      } catch (error) {
        console.error(
          `[SessionService] Failed to update directory context:`,
          error,
        );
        errors.push(
          `Failed to update directory context: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    session.lastActivity = new Date();

    this.emit('session_updated', {
      sessionId,
      userId: session.userId,
      timestamp: new Date(),
      updateType: 'addDirectory',
    });

    return {
      success: added.length > 0,
      added,
      errors,
    };
  }

  /**
   * 获取工作空间的所有目录列表
   */
  getWorkspaceDirectories(sessionId: string): string[] | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const workspaceContext = session.config.getWorkspaceContext();
    return [...workspaceContext.getDirectories()];
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
    // 从环境变量读取认证信息
    const authTypeEnv = process.env['AUTH_TYPE'];
    const openaiApiKey =
      process.env['OPENAI_API_KEY'] || process.env['QWEN_API_KEY'];
    const openaiModel =
      process.env['OPENAI_MODEL'] || process.env['QWEN_MODEL'];
    const openaiBaseUrl = process.env['OPENAI_BASE_URL'];

    // 解析authType
    let authType: AuthType | undefined;
    if (authTypeEnv === 'openai' || authTypeEnv === 'api_key') {
      authType = AuthType.USE_OPENAI;
    } else if (authTypeEnv === 'qwen-oauth') {
      authType = AuthType.QWEN_OAUTH;
    } else if (authTypeEnv === 'gemini-api-key') {
      authType = AuthType.USE_GEMINI;
    } else if (authTypeEnv === 'vertex-ai') {
      authType = AuthType.USE_VERTEX_AI;
    } else if (authTypeEnv === 'oauth-personal') {
      authType = AuthType.LOGIN_WITH_GOOGLE;
    } else if (openaiApiKey) {
      // 如果设置了API key但没有指定authType，默认使用OPENAI
      authType = AuthType.USE_OPENAI;
    }

    // 构建generationConfig
    const generationConfig: Partial<ContentGeneratorConfig> = {};
    if (openaiModel) {
      generationConfig.model = openaiModel;
    }
    if (openaiApiKey) {
      generationConfig.apiKey = openaiApiKey;
    }
    if (openaiBaseUrl) {
      generationConfig.baseUrl = openaiBaseUrl;
    }

    const targetDir = options.workspaceRoot || process.cwd();
    const model = options.model || openaiModel || 'qwen-code';

    const config = new Config({
      sessionId,
      targetDir,
      cwd: targetDir,
      debugMode: false,
      model,
      usageStatisticsEnabled: false,
      authType,
      generationConfig,
      approvalMode: ApprovalMode.YOLO, // 自动批准所有工具调用，无需确认
    });

    // 先初始化Config（这会初始化toolRegistry等，但不初始化ContentGenerator）
    console.log('[SessionService] Initializing Config...');
    await config.initialize();
    console.log('[SessionService] Config initialized');

    // 如果指定了authType，需要调用refreshAuth来初始化ContentGenerator
    // 必须在initialize()之后调用，因为refreshAuth需要toolRegistry
    if (authType || openaiApiKey) {
      const finalAuthType = authType || AuthType.USE_OPENAI;
      console.log(`[SessionService] Auth type: ${finalAuthType}`);
      console.log(`[SessionService] API key exists: ${!!openaiApiKey}`);

      // 验证API key是否存在
      if (finalAuthType === AuthType.USE_OPENAI && !openaiApiKey) {
        throw new Error(
          'OPENAI_API_KEY or QWEN_API_KEY is required when AUTH_TYPE is openai',
        );
      }

      console.log('[SessionService] Calling refreshAuth...');
      await config.refreshAuth(finalAuthType);
      console.log('[SessionService] refreshAuth completed');

      // 验证ContentGenerator是否已创建
      const contentGenerator = config.getContentGenerator();
      console.log(
        `[SessionService] ContentGenerator exists: ${!!contentGenerator}`,
      );
      if (!contentGenerator) {
        throw new Error('Failed to create ContentGenerator after refreshAuth');
      }
    }

    // refreshAuth后需要重新初始化geminiClient的chat
    // 因为geminiClient.initialize()在ContentGenerator创建之前就被调用了
    // 使用resetChat()来重新初始化chat，这样chat就可以使用新的ContentGenerator
    const geminiClient = config.getGeminiClient();
    console.log(
      `[SessionService] Chat initialized before resetChat: ${geminiClient.isInitialized()}`,
    );

    console.log('[SessionService] Calling resetChat...');
    await geminiClient.resetChat();
    console.log('[SessionService] resetChat completed');

    // 验证chat是否已正确初始化
    const isInitialized = geminiClient.isInitialized();
    console.log(
      `[SessionService] Chat initialized after resetChat: ${isInitialized}`,
    );

    if (!isInitialized) {
      throw new Error('Failed to initialize chat after refreshAuth');
    }

    console.log('[SessionService] Session configuration complete');
    return config;
  }
}
