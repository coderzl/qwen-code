/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Qwen Code HTTP Client 示例
 *
 * 展示如何使用Qwen Code HTTP服务API
 * 所有接口使用 POST + JSON 格式
 */

const API_BASE_URL = 'http://localhost:3000';

// ============================================================================
// 1. 会话管理示例
// ============================================================================

/**
 * 创建会话
 */
async function createSession(workspaceRoot: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workspaceRoot,
      model: 'qwen3-coder-plus-2025-09-23',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }

  const data = await response.json();
  return data.sessionId;
}

/**
 * 获取会话信息
 */
async function getSession(sessionId: string) {
  const response = await fetch(`${API_BASE_URL}/api/session/get`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get session: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 删除会话
 */
async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/session/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete session: ${response.statusText}`);
  }
}

/**
 * 获取所有会话
 */
async function listSessions() {
  const response = await fetch(`${API_BASE_URL}/api/sessions/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Failed to list sessions: ${response.statusText}`);
  }

  return await response.json();
}

// ============================================================================
// 2. SSE流式聊天示例 (使用 fetch + POST)
// ============================================================================

/**
 * 使用fetch实现的SSE客户端（支持POST请求）
 *
 * @param sessionId - 会话ID（可选，不提供则自动创建）
 * @param message - 用户消息
 * @param callbacks - 事件回调
 * @param options - 可选配置（用于创建新会话）
 */
async function streamChatWithFetch(
  sessionId: string | undefined,
  message: string,
  callbacks: {
    onConnected?: (requestId: string, sessionId: string) => void;
    onContent?: (content: string) => void;
    onToolCall?: (toolCall: Record<string, unknown>) => void;
    onThought?: (thought: string) => void;
    onError?: (error: string) => void;
    onEnd?: () => void;
  },
  options?: {
    workspaceRoot?: string;
    model?: string;
  },
): Promise<{ cancel: () => void }> {
  const abortController = new AbortController();

  // 构建请求体
  const requestBody: Record<string, unknown> = { message };
  if (sessionId) {
    requestBody.sessionId = sessionId;
  }
  if (options?.workspaceRoot) {
    requestBody.workspaceRoot = options.workspaceRoot;
  }
  if (options?.model) {
    requestBody.model = options.model;
  }

  // 使用 POST 请求
  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: abortController.signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to start chat stream: ${response.statusText}`);
  }

  // 读取SSE流
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is null');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let currentRequestId: string | null = null;

  // 异步读取流
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          callbacks.onEnd?.();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // 保留最后一个可能不完整的行
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'connected':
                  currentRequestId = data.requestId;
                  callbacks.onConnected?.(data.requestId, data.sessionId);
                  break;

                case 'Content':
                  if (data.value) {
                    callbacks.onContent?.(data.value);
                  }
                  break;

                case 'ToolCallRequest':
                  callbacks.onToolCall?.(data.value);
                  break;

                case 'Thought':
                  if (data.value) {
                    callbacks.onThought?.(data.value);
                  }
                  break;

                case 'error':
                  callbacks.onError?.(data.error);
                  break;

                case 'stream_end':
                  callbacks.onEnd?.();
                  break;

                case 'cancelled':
                  callbacks.onError?.('Stream cancelled');
                  break;
              }
            } catch (error) {
              console.error('Failed to parse SSE data:', error);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        callbacks.onError?.('Stream aborted');
      } else {
        callbacks.onError?.(
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }
  })();

  // 返回取消函数
  return {
    cancel: () => {
      abortController.abort();
      // 如果有requestId，调用cancel API
      if (currentRequestId) {
        fetch(`${API_BASE_URL}/api/chat/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requestId: currentRequestId }),
        }).catch(console.error);
      }
    },
  };
}

/**
 * 获取聊天历史
 */
async function getChatHistory(sessionId: string, limit = 50, offset = 0) {
  const response = await fetch(`${API_BASE_URL}/api/chat/history`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      limit,
      offset,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get chat history: ${response.statusText}`);
  }

  return await response.json();
}

// ============================================================================
// 3. 文件操作示例
// ============================================================================

/**
 * 读取文件
 */
async function readFile(
  sessionId: string,
  path: string,
  offset?: number,
  limit?: number,
) {
  const response = await fetch(`${API_BASE_URL}/api/files/read`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      path,
      offset,
      limit,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to read file: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 写入文件
 */
async function writeFile(sessionId: string, path: string, content: string) {
  const response = await fetch(`${API_BASE_URL}/api/files/write`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      path,
      content,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to write file: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 搜索文件
 */
async function searchFiles(
  sessionId: string,
  pattern: string,
  path?: string,
  maxResults = 100,
) {
  const response = await fetch(`${API_BASE_URL}/api/files/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      pattern,
      path,
      maxResults,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to search files: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 列出目录
 */
async function listDirectory(sessionId: string, path: string) {
  const response = await fetch(`${API_BASE_URL}/api/files/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      path,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to list directory: ${response.statusText}`);
  }

  return await response.json();
}

// ============================================================================
// 4. 完整使用示例
// ============================================================================

async function main() {
  try {
    console.log('='.repeat(60));
    console.log('Qwen Code HTTP Client 示例');
    console.log('='.repeat(60));
    console.log();

    // 示例1: 使用自动创建的 session（最简单）
    console.log('【示例1】直接聊天，自动创建 session');
    console.log('-'.repeat(60));

    await streamChatWithFetch(
      undefined, // 不提供 sessionId，自动创建
      '你好，请用一句话介绍你自己',
      {
        onConnected: (requestId, _sessionId) => {
          console.log(`✓ Connected, requestId: ${requestId}`);
          console.log(`✓ Auto-created sessionId: ${_sessionId}`);
        },
        onContent: (content) => {
          process.stdout.write(content);
        },
        onToolCall: (toolCall) => {
          console.log(`\n[Tool Call] ${JSON.stringify(toolCall)}`);
        },
        onThought: (thought) => {
          console.log(`\n[Thinking] ${thought}`);
        },
        onError: (error) => {
          console.error(`\n✗ Error: ${error}`);
        },
        onEnd: () => {
          console.log('\n✓ Stream ended\n');
        },
      },
      {
        workspaceRoot: '/tmp/test',
        model: 'qwen3-coder-plus-2025-09-23',
      },
    );

    console.log();
    console.log('【示例2】手动创建 session，然后复用');
    console.log('-'.repeat(60));

    // 1. 创建会话
    console.log('1. Creating session...');
    const sessionId = await createSession('/tmp/test');
    console.log('✓ Session created:', sessionId, '\n');

    // 2. 获取会话信息
    console.log('2. Getting session info...');
    const sessionInfo = await getSession(sessionId);
    console.log('✓ Session info:', sessionInfo, '\n');

    // 3. 流式聊天（使用已创建的 session）
    console.log('3. Starting chat stream...');
    await streamChatWithFetch(sessionId, '请解释一下你的功能', {
      onConnected: (requestId, sid) => {
        console.log(`✓ Connected, requestId: ${requestId}`);
        console.log(`✓ Using sessionId: ${sid}`);
      },
      onContent: (content) => {
        process.stdout.write(content);
      },
      onToolCall: (toolCall) => {
        console.log(`\n[Tool Call] ${JSON.stringify(toolCall)}`);
      },
      onThought: (thought) => {
        console.log(`\n[Thinking] ${thought}`);
      },
      onError: (error) => {
        console.error(`\n✗ Error: ${error}`);
      },
      onEnd: () => {
        console.log('\n✓ Stream ended\n');
      },
    });

    // 4. 获取历史
    console.log('4. Getting chat history...');
    const history = await getChatHistory(sessionId, 10);
    console.log(`✓ History (${history.total} total messages)\n`);

    // 5. 文件操作示例
    console.log('5. File operations...');

    // 写入文件
    await writeFile(sessionId, 'test.txt', 'Hello, Qwen Code!');
    console.log('✓ File written');

    // 读取文件
    const fileContent = await readFile(sessionId, 'test.txt');
    console.log(`✓ File read: ${fileContent.path}`);
    console.log(`  Content: ${fileContent.content}\n`);

    // 搜索文件
    const searchResults = await searchFiles(sessionId, 'README', '.');
    console.log(`✓ Search results: ${searchResults.results}\n`);

    // 列出目录
    const dirList = await listDirectory(sessionId, '.');
    console.log(`✓ Directory contents:\n${dirList.contents}\n`);

    // 6. 清理：删除会话
    console.log('6. Cleaning up...');
    await deleteSession(sessionId);
    console.log('✓ Session deleted');

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// 运行示例
if (require.main === module) {
  main();
}

// 导出函数供其他模块使用
export {
  createSession,
  getSession,
  deleteSession,
  listSessions,
  streamChatWithFetch,
  getChatHistory,
  readFile,
  writeFile,
  searchFiles,
  listDirectory,
};

// TypeScript 类型定义
export type StreamCallbacks = {
  onConnected?: (requestId: string, sessionId: string) => void;
  onContent?: (content: string) => void;
  onToolCall?: (toolCall: Record<string, unknown>) => void;
  onThought?: (thought: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
};

export type StreamOptions = {
  workspaceRoot?: string;
  model?: string;
};
