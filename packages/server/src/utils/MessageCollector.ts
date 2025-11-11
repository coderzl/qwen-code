/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 流式消息结构
 */
export interface StreamMessage {
  type: string;
  value: unknown;
  timestamp: number;
  id: string;
  status: 'generating' | 'generated';
}

/**
 * 流式响应结构
 */
export interface StreamResponse {
  sessionId: string;
  messageId: string;
  msgStatus: 'generating' | 'finished';
  messages: StreamMessage[];
}

/**
 * 消息收集器
 * 用于管理流式响应中的消息，支持增量/全量两种模式
 */
export class MessageCollector {
  private messages: StreamMessage[] = [];
  private messageIdPrefix: string;
  private responseMode: 'incremental' | 'full';
  private lastSentIndex: number = -1; // 用于增量模式，记录上次发送的最后一条消息索引
  private currentContentMessage: StreamMessage | null = null; // 当前正在累积的content消息
  private currentContentValue: string = ''; // 累积的content内容（仅用于全量模式）

  constructor(
    messageId: string,
    responseMode: 'incremental' | 'full' = 'incremental',
  ) {
    this.messageIdPrefix = messageId;
    this.responseMode = responseMode;
  }

  /**
   * 添加或更新content消息（流式内容）
   * 增量模式：每次只发送新增的内容片段
   * 全量模式：累积内容，每次发送完整内容
   */
  appendContent(
    incrementalValue: string,
    isComplete: boolean = false,
  ): StreamMessage {
    if (this.currentContentMessage === null) {
      // 创建新的content消息
      const id = `${this.messageIdPrefix}-${this.messages.length}`;
      this.currentContentMessage = {
        type: 'content',
        value: this.responseMode === 'incremental' ? incrementalValue : '',
        timestamp: Date.now(),
        id,
        status: isComplete ? 'generated' : 'generating',
      };
      this.messages.push(this.currentContentMessage);
      this.currentContentValue = incrementalValue;

      if (this.responseMode === 'full') {
        // 全量模式：value包含累积的完整内容
        this.currentContentMessage.value = this.currentContentValue;
      }

      return this.currentContentMessage;
    } else {
      // 更新现有的content消息
      this.currentContentValue += incrementalValue;

      if (this.responseMode === 'incremental') {
        // 增量模式：只更新value为新增的内容片段
        this.currentContentMessage.value = incrementalValue;
      } else {
        // 全量模式：更新value为累积的完整内容
        this.currentContentMessage.value = this.currentContentValue;
      }

      this.currentContentMessage.status = isComplete
        ? 'generated'
        : 'generating';
      this.currentContentMessage.timestamp = Date.now();

      return this.currentContentMessage;
    }
  }

  /**
   * 完成当前content消息（收到Finished事件时调用）
   */
  completeContentMessage(): void {
    if (this.currentContentMessage) {
      this.currentContentMessage.status = 'generated';
      this.currentContentMessage.timestamp = Date.now();
      this.currentContentMessage = null;
      this.currentContentValue = '';
    }
  }

  /**
   * 添加新消息（非content类型）
   */
  addMessage(
    type: string,
    value: unknown,
    status: 'generating' | 'generated' = 'generating',
  ): StreamMessage {
    // 如果当前有未完成的content消息，先完成它
    if (
      this.currentContentMessage &&
      this.currentContentMessage.status === 'generating'
    ) {
      this.completeContentMessage();
    }

    const id = `${this.messageIdPrefix}-${this.messages.length}`;
    const message: StreamMessage = {
      type,
      value,
      timestamp: Date.now(),
      id,
      status,
    };
    this.messages.push(message);
    return message;
  }

  /**
   * 更新最后一条消息的状态
   */
  updateLastMessageStatus(status: 'generating' | 'generated'): void {
    if (this.messages.length > 0) {
      this.messages[this.messages.length - 1].status = status;
      this.messages[this.messages.length - 1].timestamp = Date.now();
    }
  }

  /**
   * 获取要发送的消息列表
   * 增量模式：只返回新增或更新的消息
   * 全量模式：返回所有消息
   */
  getMessagesToSend(): StreamMessage[] {
    if (this.responseMode === 'full') {
      return this.messages;
    } else {
      // 增量模式：返回自上次发送后新增或更新的消息
      const newMessages = this.messages.slice(this.lastSentIndex + 1);
      this.lastSentIndex = this.messages.length - 1;
      return newMessages;
    }
  }

  /**
   * 获取所有消息（用于调试或历史记录）
   */
  getAllMessages(): StreamMessage[] {
    return this.messages;
  }

  /**
   * 检查是否所有消息都已完成
   */
  isAllComplete(): boolean {
    return this.messages.every((msg) => msg.status === 'generated');
  }

  /**
   * 构建响应对象
   */
  buildResponse(sessionId: string, messageId: string): StreamResponse {
    const messages = this.getMessagesToSend();
    const msgStatus = this.isAllComplete() ? 'finished' : 'generating';

    return {
      sessionId,
      messageId,
      msgStatus,
      messages,
    };
  }
}
