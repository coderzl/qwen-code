# Qwen Code HTTP Client 示例

本目录包含使用Qwen Code HTTP服务的客户端示例代码。

## 文件说明

- `client.ts` - TypeScript客户端示例，展示所有API的使用方法
- `at-command-example.sh` - At命令（@文件引用）使用示例
- `custom-command-example.sh` - 自定义命令创建和使用示例
- `client.html` - 浏览器端HTML示例（见下方）
- `client.py` - Python客户端示例（见下方）

## TypeScript/JavaScript 客户端

参见 `client.ts` 文件。

### 运行示例

```bash
# 安装依赖
npm install -g tsx

# 运行示例
tsx client.ts
```

## At命令示例

演示如何使用`@`符号引用文件。参见 `at-command-example.sh`。

### 运行示例

```bash
# 确保服务已启动
cd packages/server
npm run dev

# 在另一个终端运行示例
cd examples
./at-command-example.sh
```

### 功能演示

- 单文件引用：`@README.md`
- 多文件引用：`@package.json @tsconfig.json`
- 通配符引用：`@src/**/*.ts`
- 自动文件过滤（遵守gitignore）

## 自定义命令示例

演示如何创建和使用自定义命令。参见 `custom-command-example.sh`。

### 运行示例

```bash
# 确保服务已启动
cd packages/server
npm run dev

# 在另一个终端运行示例
cd examples
./custom-command-example.sh
```

### 功能演示

- 创建`.toml`格式的自定义命令
- 列出所有可用命令
- 执行自定义命令
- 获取命令帮助信息
- 命令中使用文件引用（`@{filename}`）

### 使用

```typescript
import { createSession, streamChatWithFetch, readFile } from './client';

// 创建会话
const sessionId = await createSession('/path/to/workspace');

// 流式聊天
await streamChatWithFetch(sessionId, 'Hello!', {
  onContent: (content) => console.log(content),
  onEnd: () => console.log('Done'),
});

// 读取文件
const file = await readFile(sessionId, 'README.md');
console.log(file.content);
```

## 浏览器端示例

创建 `client.html`:

\`\`\`html

<!DOCTYPE html>
<html>
<head>
  <title>Qwen Code Chat</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; }
    #chat-container { border: 1px solid #ccc; padding: 20px; height: 400px; overflow-y: auto; }
    #input-container { margin-top: 20px; }
    #message-input { width: 70%; padding: 10px; }
    #send-btn { padding: 10px 20px; }
    .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
    .user { background-color: #e3f2fd; }
    .assistant { background-color: #f5f5f5; }
  </style>
</head>
<body>
  <h1>Qwen Code Chat</h1>
  
  <div id="chat-container"></div>
  
  <div id="input-container">
    <input type="text" id="message-input" placeholder="输入消息...">
    <button id="send-btn">发送</button>
    <button id="cancel-btn" disabled>取消</button>
  </div>

  <script>
    const API_BASE_URL = 'http://localhost:3000';
    // 当前为单用户模式，无需JWT token
    let sessionId = null;
    let currentStream = null;

    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    // 初始化
    async function init() {
      try {
        // 创建会话
        const response = await fetch(\`\${API_BASE_URL}/api/session\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workspaceRoot: '/path/to/workspace',
          }),
        });
        
        const data = await response.json();
        sessionId = data.sessionId;
        console.log('Session created:', sessionId);
      } catch (error) {
        console.error('Failed to create session:', error);
        alert('Failed to initialize. Check console for details.');
      }
    }

    // 添加消息到界面
    function addMessage(text, type) {
      const div = document.createElement('div');
      div.className = \`message \${type}\`;
      div.textContent = text;
      chatContainer.appendChild(div);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      return div;
    }

    // 发送消息
    async function sendMessage() {
      const message = messageInput.value.trim();
      if (!message || !sessionId) return;

      // 显示用户消息
      addMessage(message, 'user');
      messageInput.value = '';

      // 创建助手消息容器
      const assistantDiv = addMessage('', 'assistant');

      // 禁用发送按钮，启用取消按钮
      sendBtn.disabled = true;
      cancelBtn.disabled = false;

      try {
        // 开始流式聊天
        const url = new URL(\`\${API_BASE_URL}/api/chat/stream\`);
        url.searchParams.append('sessionId', sessionId);
        url.searchParams.append('message', message);

        const response = await fetch(url.toString());

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'Content') {
                assistantDiv.textContent += data.value;
                chatContainer.scrollTop = chatContainer.scrollHeight;
              } else if (data.type === 'error') {
                assistantDiv.textContent += \`\\n[Error: \${data.error}]\`;
              }
            }
          }
        }
      } catch (error) {
        console.error('Chat error:', error);
        assistantDiv.textContent += '\\n[发生错误]';
      } finally {
        sendBtn.disabled = false;
        cancelBtn.disabled = true;
      }
    }

    // 事件监听
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    // 初始化
    init();
  </script>
</body>
</html>
\`\`\`

## Python 客户端示例

创建 `client.py`:

\`\`\`python
import requests
import json
from typing import Dict, Any, Optional, Callable

API_BASE_URL = "http://localhost:3000"

# 当前为单用户模式，无需JWT token

class QwenCodeClient:
def **init**(self, base_url: str = API_BASE_URL):
self.base_url = base_url
self.headers = {
"Content-Type": "application/json"
}

    def create_session(self, workspace_root: str, model: str = "qwen-code") -> str:
        """创建会话"""
        response = requests.post(
            f"{self.base_url}/api/session",
            headers=self.headers,
            json={"workspaceRoot": workspace_root, "model": model}
        )
        response.raise_for_status()
        return response.json()["sessionId"]

    def get_session(self, session_id: str) -> Dict[str, Any]:
        """获取会话信息"""
        response = requests.get(
            f"{self.base_url}/api/session/{session_id}",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

    def delete_session(self, session_id: str) -> bool:
        """删除会话"""
        response = requests.delete(
            f"{self.base_url}/api/session/{session_id}",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()["success"]

    def stream_chat(
        self,
        session_id: str,
        message: str,
        on_content: Optional[Callable[[str], None]] = None,
        on_end: Optional[Callable[[], None]] = None
    ):
        """流式聊天"""
        params = {"sessionId": session_id, "message": message}

        with requests.get(
            f"{self.base_url}/api/chat/stream",
            params=params,
            stream=True
        ) as response:
            response.raise_for_status()

            for line in response.iter_lines():
                if line.startswith(b"data: "):
                    data = json.loads(line[6:])

                    if data["type"] == "Content" and on_content:
                        on_content(data["value"])
                    elif data["type"] == "stream_end" and on_end:
                        on_end()

    def read_file(self, session_id: str, path: str) -> Dict[str, Any]:
        """读取文件"""
        response = requests.post(
            f"{self.base_url}/api/files/read",
            headers=self.headers,
            json={"sessionId": session_id, "path": path}
        )
        response.raise_for_status()
        return response.json()

    def write_file(self, session_id: str, path: str, content: str) -> Dict[str, Any]:
        """写入文件"""
        response = requests.post(
            f"{self.base_url}/api/files/write",
            headers=self.headers,
            json={"sessionId": session_id, "path": path, "content": content}
        )
        response.raise_for_status()
        return response.json()

def main():
"""示例使用"""
client = QwenCodeClient()

    # 创建会话
    print("Creating session...")
    session_id = client.create_session("/path/to/workspace")
    print(f"Session created: {session_id}")

    # 流式聊天
    print("\\nStarting chat...")
    client.stream_chat(
        session_id,
        "Hello! Can you help me?",
        on_content=lambda content: print(content, end="", flush=True),
        on_end=lambda: print("\\n\\nChat ended")
    )

    # 读取文件
    print("\\nReading file...")
    file_data = client.read_file(session_id, "README.md")
    print(f"File: {file_data['path']}")

    # 删除会话
    print("\\nDeleting session...")
    client.delete_session(session_id)
    print("Done!")

if **name** == "**main**":
main()
\`\`\`

## 注意事项

1. **认证模式**: 当前为单用户模式，无需JWT token
2. **CORS**: 浏览器客户端需要服务器配置CORS
3. **SSE限制**: EventSource API不支持自定义headers（当前无需认证，不受影响）
4. **错误处理**: 生产环境应添加更完善的错误处理
5. **重连机制**: SSE断开后应实现自动重连
