/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Vercel AI SDK 适配层
 * 将后端 SSE 协议转换为 Vercel AI SDK 期望的格式
 */

export interface AISdkRequest {
  sessionId?: string;
  messageId?: string;
  message: string;
  workspaceRoot?: string;
  model?: string;
  responseMode?: 'incremental' | 'full';
}

/**
 * 自定义 fetch 函数，适配后端协议到 Vercel AI SDK 格式
 */
export function createAISdkFetch(
  baseUrl: string = '',
): (url: string, options?: RequestInit) => Promise<Response> {
  return async (url: string, options?: RequestInit): Promise<Response> => {
    console.log('[AISdkAdapter] ========== 收到请求 ==========');
    console.log('[AISdkAdapter] URL:', url);
    console.log('[AISdkAdapter] baseUrl:', baseUrl);
    console.log('[AISdkAdapter] Method:', options?.method || 'GET');
    console.log('[AISdkAdapter] Headers:', options?.headers);
    console.log('[AISdkAdapter] Body:', options?.body);
    console.log('[AISdkAdapter] ============================');

    // 如果 URL 已经是绝对 URL 且指向后端，直接处理
    if (
      url.startsWith('http://localhost:3000') ||
      url.startsWith('https://localhost:3000')
    ) {
      console.log('[AISdkAdapter] 检测到后端 URL，直接处理');
    }

    // 只处理 /api/chat 相关的请求
    // 将 /api/chat 转换为 /api/chat/stream
    let targetUrl = url;

    // 提取 URL 路径部分（去除协议和域名）
    let urlPath: string;
    let isAbsoluteUrl = false;

    try {
      if (url.includes('://')) {
        const urlObj = new URL(url);
        urlPath = urlObj.pathname;
        isAbsoluteUrl = true;
      } else {
        urlPath = url.split('?')[0]; // 去除查询参数
      }
    } catch {
      // 如果 URL 解析失败，使用原始路径
      urlPath = url.split('?')[0];
    }

    // 检查是否是 /api/chat 请求（但不包含 /stream, /cancel, /history）
    const isChatEndpoint =
      urlPath === '/api/chat' || urlPath.endsWith('/api/chat');
    const isNotStream = !url.includes('/api/chat/stream');
    const isNotCancel = !url.includes('/api/chat/cancel');
    const isNotHistory = !url.includes('/api/chat/history');

    if (isChatEndpoint && isNotStream && isNotCancel && isNotHistory) {
      // 将 /api/chat 转换为 /api/chat/stream
      // 保留查询参数
      const queryString = url.includes('?') ? url.split('?')[1] : '';
      const basePath = urlPath.replace('/api/chat', '/api/chat/stream');
      targetUrl = queryString ? `${basePath}?${queryString}` : basePath;

      // 如果是绝对 URL，需要保留协议和域名
      if (isAbsoluteUrl) {
        try {
          const urlObj = new URL(url);
          urlObj.pathname = basePath;
          targetUrl = urlObj.toString();
        } catch {
          // 如果解析失败，使用相对路径
        }
      }

      console.log('[AISdkAdapter] URL转换:', url, '->', targetUrl);
    } else if (!url.includes('/api/chat')) {
      // 对于其他请求，使用原生 fetch
      console.log('[AISdkAdapter] 非 /api/chat 请求，使用原生 fetch');
      return fetch(url, options);
    }

    const requestBody = options?.body
      ? typeof options.body === 'string'
        ? JSON.parse(options.body)
        : options.body
      : {};

    // 构建后端请求
    const backendRequest: AISdkRequest = {
      sessionId: requestBody.sessionId,
      messageId: requestBody.messageId,
      message:
        requestBody.messages?.[requestBody.messages.length - 1]?.content ||
        requestBody.message ||
        '',
      workspaceRoot: requestBody.workspaceRoot,
      model: requestBody.model,
      responseMode: requestBody.responseMode || 'full',
    };

    // 调用后端 SSE 端点（使用转换后的 URL）
    // 如果 targetUrl 已经是绝对路径，直接使用；否则拼接 baseUrl
    let finalUrl = targetUrl;
    if (!targetUrl.startsWith('http')) {
      // 相对路径，需要拼接 baseUrl
      if (!baseUrl) {
        // 如果 baseUrl 为空，在开发环境中使用默认后端地址
        const isDev =
          typeof window !== 'undefined' &&
          window.location.hostname === 'localhost';
        const defaultBaseUrl = isDev ? 'http://localhost:3000' : '';
        if (defaultBaseUrl) {
          const base = defaultBaseUrl.endsWith('/')
            ? defaultBaseUrl.slice(0, -1)
            : defaultBaseUrl;
          const path = targetUrl.startsWith('/') ? targetUrl : `/${targetUrl}`;
          finalUrl = `${base}${path}`;
        } else {
          // 生产环境，使用相对路径（依赖代理或同域部署）
          finalUrl = targetUrl;
        }
      } else {
        // 确保 baseUrl 和 targetUrl 之间只有一个斜杠
        const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const path = targetUrl.startsWith('/') ? targetUrl : `/${targetUrl}`;
        finalUrl = `${base}${path}`;
      }
    }

    console.log('[AISdkAdapter] URL转换:', url, '->', targetUrl);
    console.log('[AISdkAdapter] 最终URL:', finalUrl);
    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string>),
      },
      body: JSON.stringify(backendRequest),
      signal: options?.signal,
    });

    if (!response.ok) {
      return response;
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // 创建一个新的 ReadableStream，将后端 SSE 转换为 Vercel AI SDK 格式
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';
    let sessionId: string | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // 发送结束标记
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() === '') {
                continue;
              }

              if (line.startsWith('data: ')) {
                try {
                  const jsonStr = line.slice(6).trim();
                  if (!jsonStr) {
                    continue;
                  }

                  const data = JSON.parse(jsonStr);

                  // 处理连接事件，保存 sessionId
                  if (data.type === 'connected' && data.sessionId) {
                    sessionId = data.sessionId;
                    // 发送一个初始消息，包含 sessionId
                    const aiSdkChunk = {
                      id: `chatcmpl-${Date.now()}`,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model: 'qwen-code',
                      choices: [
                        {
                          index: 0,
                          delta: {
                            role: 'assistant',
                            content: '',
                          },
                          finish_reason: null,
                        },
                      ],
                      sessionId: data.sessionId,
                    };
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify(aiSdkChunk)}\n\n`),
                    );
                    continue;
                  }

                  // 处理 StreamResponse 格式
                  if (data.msgStatus && data.messages) {
                    // 累积所有 content 消息
                    let accumulatedContent = '';
                    const toolCalls: Array<{
                      id: string;
                      type: 'function';
                      function: {
                        name: string;
                        arguments: string;
                      };
                    }> = [];

                    // 处理消息，按 id 分组以支持增量模式
                    const contentMap = new Map<string, string>();
                    const responseMode = backendRequest.responseMode || 'full';

                    for (const msg of data.messages) {
                      if (msg.type === 'content') {
                        const content =
                          typeof msg.value === 'string' ? msg.value : '';
                        const msgId = msg.id || 'default';

                        if (responseMode === 'full') {
                          // 全量模式：直接使用最新内容
                          contentMap.set(msgId, content);
                        } else {
                          // 增量模式：累积内容
                          const existing = contentMap.get(msgId) || '';
                          contentMap.set(msgId, existing + content);
                        }
                      } else if (msg.type === 'tool_call_request') {
                        const toolCall = msg.value as {
                          callId: string;
                          name: string;
                          args: Record<string, unknown>;
                        };
                        toolCalls.push({
                          id: toolCall.callId,
                          type: 'function',
                          function: {
                            name: toolCall.name,
                            arguments: JSON.stringify(toolCall.args),
                          },
                        });
                      }
                    }

                    // 合并所有内容
                    accumulatedContent = Array.from(contentMap.values()).join(
                      '',
                    );

                    // 发送内容更新
                    if (accumulatedContent) {
                      const aiSdkChunk = {
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: 'qwen-code',
                        choices: [
                          {
                            index: 0,
                            delta: {
                              role: 'assistant',
                              content: accumulatedContent,
                            },
                            finish_reason:
                              data.msgStatus === 'finished' ? 'stop' : null,
                          },
                        ],
                        ...(sessionId && { sessionId }),
                      };
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify(aiSdkChunk)}\n\n`,
                        ),
                      );
                    }

                    // 发送工具调用
                    if (toolCalls.length > 0) {
                      const aiSdkChunk = {
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: 'qwen-code',
                        choices: [
                          {
                            index: 0,
                            delta: {
                              role: 'assistant',
                              tool_calls: toolCalls,
                            },
                            finish_reason: null,
                          },
                        ],
                        ...(sessionId && { sessionId }),
                      };
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify(aiSdkChunk)}\n\n`,
                        ),
                      );
                    }

                    // 如果完成，发送结束标记
                    if (data.msgStatus === 'finished') {
                      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    }
                  }

                  // 处理错误事件
                  if (data.type === 'error') {
                    const errorChunk = {
                      error: {
                        message: data.error || data.message || 'Unknown error',
                        type: 'server_error',
                      },
                    };
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`),
                    );
                    controller.close();
                    break;
                  }
                } catch (error) {
                  console.error(
                    'Failed to parse SSE data:',
                    error,
                    'Line:',
                    line,
                  );
                  // 继续处理其他消息
                }
              }
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    // 返回一个新的 Response，使用转换后的流
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  };
}
