/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Qwen Code HTTP Client 示例
 *
 * 展示如何使用Qwen Code HTTP服务API
 */

const API_BASE_URL = 'http://localhost:3000';
// 当前为单用户模式，无需JWT认证

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
      model: 'qwen-code',
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
  const response = await fetch(`${API_BASE_URL}/api/session/${sessionId}`);

  if (!response.ok) {
    throw new Error(`Failed to get session: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 删除会话
 */
async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/session/${sessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete session: ${response.statusText}`);
  }
}

// ============================================================================
// 2. SSE流式聊天示例
// ============================================================================

/**
 * SSE流式聊天
 */
function streamChat(
  sessionId: string,
  message: string,
  callbacks: {
    onConnected?: (requestId: string) => void;
    onContent?: (content: string) => void;
    onToolCall?: (toolCall: Record<string, unknown>) => void;
    onThought?: (thought: string) => void;
    onError?: (error: string) => void;
    onEnd?: () => void;
  },
): { cancel: () => Promise<void> } {
  let currentRequestId: string | null = null;

  const url = new URL(`${API_BASE_URL}/api/chat/stream`);
  url.searchParams.append('sessionId', sessionId);
  url.searchParams.append('message', message);

  // 注意：浏览器EventSource不支持自定义headers
  // 当前为单用户模式，无需认证
  const eventSource = new EventSource(url.toString());

  eventSource.addEventListener('message', (e) => {
    const data = JSON.parse(e.data);

    switch (data.type) {
      case 'connected':
        currentRequestId = data.requestId;
        callbacks.onConnected?.(data.requestId);
        break;

      case 'Content':
        callbacks.onContent?.(data.value);
        break;

      case 'ToolCallRequest':
        callbacks.onToolCall?.(data.value);
        break;

      case 'Thought':
        callbacks.onThought?.(data.value);
        break;

      case 'stream_end':
        callbacks.onEnd?.();
        eventSource.close();
        break;

      case 'error':
        callbacks.onError?.(data.error);
        eventSource.close();
        break;

      case 'cancelled':
        console.log('Stream cancelled');
        eventSource.close();
        break;
    }
  });

  eventSource.onerror = (error) => {
    console.error('EventSource error:', error);
    callbacks.onError?.('Connection error');
    eventSource.close();
  };

  // 返回取消函数
  return {
    cancel: async () => {
      if (currentRequestId) {
        await fetch(`${API_BASE_URL}/api/chat/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requestId: currentRequestId }),
        });
      }
      eventSource.close();
    },
  };
}

/**
 * 使用fetch实现的SSE客户端（支持自定义headers）
 */
async function streamChatWithFetch(
  sessionId: string,
  message: string,
  callbacks: {
    onConnected?: (requestId: string) => void;
    onContent?: (content: string) => void;
    onToolCall?: (toolCall: Record<string, unknown>) => void;
    onThought?: (thought: string) => void;
    onError?: (error: string) => void;
    onEnd?: () => void;
  },
): Promise<{ cancel: () => void }> {
  const url = new URL(`${API_BASE_URL}/api/chat/stream`);
  url.searchParams.append('sessionId', sessionId);
  url.searchParams.append('message', message);

  const abortController = new AbortController();

  const response = await fetch(url.toString(), {
    signal: abortController.signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to start stream: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('Response body is not readable');
  }

  // 在后台处理流
  (async () => {
    try {
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          callbacks.onEnd?.();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'connected':
                callbacks.onConnected?.(data.requestId);
                break;
              case 'Content':
                callbacks.onContent?.(data.value);
                break;
              case 'ToolCallRequest':
                callbacks.onToolCall?.(data.value);
                break;
              case 'Thought':
                callbacks.onThought?.(data.value);
                break;
              case 'error':
                callbacks.onError?.(data.error);
                break;
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        callbacks.onError?.(error.message);
      }
    }
  })();

  return {
    cancel: () => abortController.abort(),
  };
}

// ============================================================================
// 3. 文件操作示例
// ============================================================================

/**
 * 读取文件
 */
async function readFile(sessionId: string, path: string) {
  const response = await fetch(`${API_BASE_URL}/api/files/read`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId, path }),
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
    body: JSON.stringify({ sessionId, path, content }),
  });

  if (!response.ok) {
    throw new Error(`Failed to write file: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 搜索文件
 */
async function searchFiles(sessionId: string, pattern: string, path?: string) {
  const response = await fetch(`${API_BASE_URL}/api/files/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId, pattern, path }),
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
    body: JSON.stringify({ sessionId, path }),
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
  console.log('Qwen Code HTTP Client Example\n');

  try {
    // 1. 创建会话
    console.log('1. Creating session...');
    const sessionId = await createSession('/path/to/workspace');
    console.log(`✓ Session created: ${sessionId}\n`);

    // 2. 获取会话信息
    console.log('2. Getting session info...');
    const sessionInfo = await getSession(sessionId);
    console.log('✓ Session info:', sessionInfo, '\n');

    // 3. 流式聊天
    console.log('3. Starting chat stream...');
    await streamChatWithFetch(
      sessionId,
      'Hello! Can you help me understand this codebase?',
      {
        onConnected: (requestId) => {
          console.log(`✓ Connected, requestId: ${requestId}`);
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
    );

    // 如果需要取消流，可以这样：
    // const stream = await streamChatWithFetch(...);
    // setTimeout(() => stream.cancel(), 5000);

    // 4. 文件操作
    console.log('4. Reading file...');
    const fileContent = await readFile(sessionId, 'README.md');
    console.log(`✓ File read: ${fileContent.path}\n`);

    // 5. 搜索文件
    console.log('5. Searching files...');
    const searchResults = await searchFiles(sessionId, 'TODO');
    console.log('✓ Search results:', searchResults, '\n');

    // 6. 删除会话
    console.log('6. Deleting session...');
    await deleteSession(sessionId);
    console.log('✓ Session deleted\n');

    console.log('All operations completed successfully!');
  } catch (error) {
    console.error('Error:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

// 导出供其他模块使用
export {
  createSession,
  getSession,
  deleteSession,
  streamChat,
  streamChatWithFetch,
  readFile,
  writeFile,
  searchFiles,
  listDirectory,
};
