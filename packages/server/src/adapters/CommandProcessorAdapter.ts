/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@qwen-code/qwen-code-core';
import { executeToolCall } from '@qwen-code/qwen-code-core';
// 使用包名导入CLI的服务类
// 注意：这些类在CLI包中，需要通过包名导入
import { CommandService } from '@qwen-code/qwen-code/src/services/CommandService.js';
import { FileCommandLoader } from '@qwen-code/qwen-code/src/services/FileCommandLoader.js';
import { McpPromptLoader } from '@qwen-code/qwen-code/src/services/McpPromptLoader.js';

/**
 * At命令部分
 */
export interface AtCommandPart {
  type: 'text' | 'atPath';
  content: string;
}

export interface FileInfo {
  path: string;
  size: number;
  content?: string;
}

export interface AtCommandResult {
  processedQuery: string;
  files: FileInfo[];
  shouldProceed: boolean;
}

/**
 * Slash命令部分
 */
export interface SlashCommandResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface CommandInfo {
  name: string;
  description: string;
  kind: string;
  extensionName?: string;
}

/**
 * 命令处理适配器
 *
 * 提供CLI命令处理逻辑的HTTP服务适配，包括：
 * - At命令处理（@文件引用）
 * - Slash命令处理（/help等）
 * - 自定义命令加载
 */
export class CommandProcessorAdapter {
  private commandService: CommandService | null = null;
  private commandsLoadPromise: Promise<void> | null = null;

  constructor(private config: Config) {}

  /**
   * 初始化命令服务，加载所有命令
   */
  async initializeCommands(signal?: AbortSignal): Promise<void> {
    if (this.commandService) {
      return;
    }

    // 如果已经在加载中，等待加载完成
    if (this.commandsLoadPromise) {
      return this.commandsLoadPromise;
    }

    this.commandsLoadPromise = (async () => {
      const loaders = [
        new FileCommandLoader(this.config),
        new McpPromptLoader(this.config),
      ];

      this.commandService = await CommandService.create(
        loaders,
        signal || new AbortController().signal,
      );

      console.log(
        `[CommandProcessor] Loaded ${this.commandService.getCommands().length} commands`,
      );
    })();

    await this.commandsLoadPromise;
  }

  /**
   * 获取所有可用命令
   */
  async getCommands(): Promise<CommandInfo[]> {
    await this.ensureCommandsLoaded();

    if (!this.commandService) {
      return [];
    }

    return this.commandService.getCommands().map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      kind: cmd.kind,
      extensionName: cmd.extensionName,
    }));
  }

  /**
   * 执行Slash命令
   *
   * @param commandName 命令名称（不含/前缀）
   * @param args 命令参数
   * @returns 命令执行结果
   */
  async executeSlashCommand(
    commandName: string,
    args: string,
  ): Promise<SlashCommandResult> {
    await this.ensureCommandsLoaded();

    if (!this.commandService) {
      return {
        success: false,
        output: '',
        error: 'Command service not initialized',
      };
    }

    // 查找命令
    const command = this.commandService
      .getCommands()
      .find(
        (cmd) =>
          cmd.name === commandName || cmd.altNames?.includes(commandName),
      );

    if (!command) {
      return {
        success: false,
        output: '',
        error: `Command not found: /${commandName}`,
      };
    }

    if (!command.action) {
      return {
        success: false,
        output: '',
        error: `Command /${commandName} has no action defined`,
      };
    }

    try {
      // 创建简化的命令上下文（HTTP服务不需要完整的UI上下文）
      const context = this.createCommandContext(commandName, args);

      // 执行命令
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await command.action(context as any, args);

      // 处理结果
      if (!result) {
        return {
          success: true,
          output: 'Command executed successfully',
        };
      }

      // 根据结果类型处理
      if (typeof result === 'string') {
        return {
          success: true,
          output: result,
        };
      }

      if (result && typeof result === 'object' && 'type' in result) {
        // 处理SlashCommandActionReturn类型
        switch (result.type) {
          case 'message': {
            // MessageActionReturn
            const messageResult = result as {
              type: 'message';
              content: string;
              messageType?: string;
            };
            return {
              success: messageResult.messageType !== 'error',
              output: messageResult.content || '',
              error:
                messageResult.messageType === 'error'
                  ? messageResult.content
                  : undefined,
            };
          }
          case 'submit_prompt': {
            // SubmitPromptActionReturn - 转换为文本
            const submitResult = result as {
              type: 'submit_prompt';
              content: unknown;
            };
            return {
              success: true,
              output:
                typeof submitResult.content === 'string'
                  ? submitResult.content
                  : JSON.stringify(submitResult.content),
            };
          }
          default:
            // 其他类型（tool, quit等）转换为JSON
            return {
              success: true,
              output: JSON.stringify(result),
            };
        }
      }

      return {
        success: true,
        output: JSON.stringify(result),
      };
    } catch (error) {
      console.error(
        `[CommandProcessor] Error executing command /${commandName}:`,
        error,
      );
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 确保命令已加载
   */
  private async ensureCommandsLoaded(): Promise<void> {
    if (!this.commandService) {
      await this.initializeCommands();
    }
  }

  /**
   * 创建命令执行上下文（简化版，用于HTTP服务）
   */
  private createCommandContext(
    commandName: string,
    args: string,
  ): {
    invocation: { raw: string; name: string; args: string };
    services: {
      config: Config;
      settings: Record<string, unknown>;
      git: undefined;
      logger: {
        log: (message: string) => void;
        error: (message: string) => void;
      };
    };
    ui: {
      addItem: (item: unknown) => void;
      clear: () => void;
      setDebugMessage: (message: string) => void;
      pendingItem: null;
      setPendingItem: (item: unknown) => void;
      loadHistory: () => void;
      toggleCorgiMode: () => void;
      toggleVimEnabled: () => Promise<boolean>;
      setGeminiMdFileCount: (count: number) => void;
      reloadCommands: () => void;
      extensionsUpdateState: Map<string, unknown>;
      dispatchExtensionStateUpdate: () => void;
      addConfirmUpdateExtensionRequest: () => void;
    };
    session: {
      stats: {
        sessionId: string;
        sessionStartTime: Date;
        metrics: Record<string, unknown>;
      };
      sessionShellAllowlist: Set<string>;
    };
  } {
    // 创建一个简化的上下文对象
    // HTTP服务不需要完整的UI上下文，只需要基本的服务访问
    return {
      services: {
        config: this.config,
        settings: {}, // 简化版设置
        git: undefined,
        logger: {
          log: (message: string) =>
            console.log(`[Command ${commandName}]`, message),
          error: (message: string) =>
            console.error(`[Command ${commandName}]`, message),
        },
      },
      ui: {
        addItem: (item: unknown) => console.log('[Command UI]', item),
        clear: () => {},
        setDebugMessage: (message: string) =>
          console.log('[Command Debug]', message),
        pendingItem: null,
        setPendingItem: (_item: unknown) => {},
        loadHistory: () => {},
        toggleCorgiMode: () => {},
        toggleVimEnabled: async () => false,
        setGeminiMdFileCount: (_count: number) => {},
        reloadCommands: () => {},
        extensionsUpdateState: new Map<string, unknown>(),
        dispatchExtensionStateUpdate: () => {},
        addConfirmUpdateExtensionRequest: () => {},
      },
      session: {
        stats: {
          sessionId: this.config.getSessionId(),
          sessionStartTime: new Date(),
          metrics: {},
        },
        sessionShellAllowlist: new Set<string>(),
      },
      invocation: {
        raw: `/${commandName} ${args}`,
        name: commandName,
        args,
      },
    };
  }

  /**
   * 处理At命令（@文件引用）
   *
   * 示例：
   * - "@file.txt" -> 读取file.txt内容
   * - "@src/*.ts" -> 读取src目录下所有ts文件
   * - "查看 @README.md 的内容" -> 在查询中注入README.md的内容
   *
   * @param query 用户查询字符串
   * @returns 处理后的查询和文件信息
   */
  async handleAtCommand(query: string): Promise<AtCommandResult> {
    const parts = this.parseAllAtCommands(query);
    const atPathParts = parts.filter((p) => p.type === 'atPath');

    if (atPathParts.length === 0) {
      return {
        processedQuery: query,
        files: [],
        shouldProceed: true,
      };
    }

    // 收集所有路径规范（支持通配符）
    const pathSpecs: string[] = [];
    for (const part of atPathParts) {
      pathSpecs.push(part.content);
    }

    // 如果没有路径，返回原查询
    if (pathSpecs.length === 0) {
      return {
        processedQuery: query,
        files: [],
        shouldProceed: true,
      };
    }

    // 使用read_many_files工具读取文件内容
    // 该工具会自动处理通配符和文件过滤
    try {
      const result = await executeToolCall(
        this.config,
        {
          name: 'read_many_files',
          callId: `at_command_${Date.now()}`,
          args: {
            paths: pathSpecs,
            respectGitIgnore:
              this.config.getFileFilteringOptions().respectGitIgnore,
          },
          isClientInitiated: true,
          prompt_id: `at_command_${Date.now()}`,
        },
        new AbortController().signal,
      );

      // 提取文件内容
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileContents = this.extractFileContents(result as any);

      // 从result中提取文件信息
      const fileInfos: FileInfo[] = [];
      if (result.responseParts && result.responseParts.length > 0) {
        // 尝试从响应中提取文件路径信息
        // read_many_files工具返回的内容格式为 "--- path ---\n\ncontent\n\n"
        for (let i = 0; i < pathSpecs.length && i < fileContents.length; i++) {
          fileInfos.push({
            path: pathSpecs[i],
            size: 0, // 大小信息不可用
            content: fileContents[i],
          });
        }
      }

      // 构建处理后的查询
      const processedQuery = this.buildProcessedQuery(
        parts,
        fileInfos,
        fileContents,
      );

      return {
        processedQuery,
        files: fileInfos,
        shouldProceed: true,
      };
    } catch (error) {
      console.error('[At Command] Failed to read files', error);
      throw new Error('Failed to read files');
    }
  }

  /**
   * 解析所有At命令
   *
   * 将查询字符串拆分为文本部分和@路径部分
   *
   * 示例：
   * "查看 @file.txt 和 @src/*.ts 的内容"
   * -> [
   *   {type: 'text', content: '查看 '},
   *   {type: 'atPath', content: 'file.txt'},
   *   {type: 'text', content: ' 和 '},
   *   {type: 'atPath', content: 'src/*.ts'},
   *   {type: 'text', content: ' 的内容'}
   * ]
   */
  private parseAllAtCommands(query: string): AtCommandPart[] {
    const parts: AtCommandPart[] = [];
    let lastIndex = 0;

    // 匹配@后跟非空白字符的模式
    const atCommandRegex = /@([^\s]+)/g;
    let match: RegExpExecArray | null;

    while ((match = atCommandRegex.exec(query)) !== null) {
      // 添加@之前的文本
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: query.substring(lastIndex, match.index),
        });
      }

      // 添加@路径
      parts.push({
        type: 'atPath',
        content: match[1],
      });

      lastIndex = match.index + match[0].length;
    }

    // 添加最后的文本
    if (lastIndex < query.length) {
      parts.push({
        type: 'text',
        content: query.substring(lastIndex),
      });
    }

    // 如果没有匹配任何@命令，返回整个文本
    if (parts.length === 0) {
      parts.push({
        type: 'text',
        content: query,
      });
    }

    return parts;
  }

  /**
   * 从工具执行结果中提取文件内容
   */
  private extractFileContents(result: {
    responseParts?: Array<{
      text?: string;
      functionResponse?: {
        response?: { output?: string; [key: string]: unknown };
        [key: string]: unknown;
      };
      [key: string]: unknown;
    }>;
  }): string[] {
    const contents: string[] = [];

    if (result.responseParts && Array.isArray(result.responseParts)) {
      for (const part of result.responseParts) {
        if (
          part.functionResponse &&
          typeof part.functionResponse === 'object' &&
          'response' in part.functionResponse &&
          part.functionResponse.response &&
          typeof part.functionResponse.response === 'object' &&
          'output' in part.functionResponse.response
        ) {
          const output = part.functionResponse.response.output;
          if (output && typeof output === 'string') {
            contents.push(output);
          }
        } else if ('text' in part && part.text) {
          contents.push(part.text);
        }
      }
    }

    return contents;
  }

  /**
   * 构建处理后的查询字符串
   *
   * 将@路径替换为实际的文件路径，并在末尾添加文件内容块
   */
  private buildProcessedQuery(
    parts: AtCommandPart[],
    fileInfos: FileInfo[],
    fileContents: string[],
  ): string {
    let query = '';
    let fileIndex = 0;

    // 构建查询，保留文本，替换@路径为实际文件路径
    for (const part of parts) {
      if (part.type === 'text') {
        query += part.content;
      } else if (part.type === 'atPath') {
        // 替换@路径为实际文件路径
        if (fileIndex < fileInfos.length) {
          query += `@${fileInfos[fileIndex].path}`;
          fileIndex++;
        }
      }
    }

    // 在查询末尾添加文件内容块
    if (fileInfos.length > 0 && fileContents.length > 0) {
      query += '\n\n<files>\n';

      for (let i = 0; i < fileInfos.length && i < fileContents.length; i++) {
        query += `\n<file path="${fileInfos[i].path}">\n`;
        query += fileContents[i];
        query += `\n</file>\n`;
      }

      query += '</files>';
    }

    return query;
  }
}
