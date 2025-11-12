# Qwen Code Web

Qwen Code 的前端 Web 界面，提供基于浏览器的 AI 代码助手交互体验。

## 功能特性

- ✅ **流式聊天**：支持 Server-Sent Events (SSE) 流式响应
- ✅ **打字机效果**：实时显示 AI 响应内容，支持增量模式
- ✅ **工具调用展示**：可视化展示工具调用的生命周期（请求、执行、完成、错误）
- ✅ **Markdown 渲染**：支持 Markdown 格式的消息内容
- ✅ **响应式设计**：适配桌面和移动设备
- ✅ **暗色模式**：支持明暗主题切换
- ✅ **会话管理**：自动管理会话状态和历史记录

## 技术栈

- **React 18+**：前端框架
- **TypeScript**：类型安全
- **Vite**：构建工具
- **Tailwind CSS**：样式框架
- **Zustand**：状态管理
- **react-markdown**：Markdown 渲染

## 快速开始

### 安装依赖

```bash
cd packages/web
npm install
```

### 开发模式

```bash
npm run dev
```

前端开发服务器将在 `http://localhost:5173` 启动。

### 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist/` 目录。

### 预览生产构建

```bash
npm run preview
```

## 项目结构

```
packages/web/
├── src/
│   ├── components/          # React 组件
│   │   └── Chat/           # 聊天相关组件
│   ├── hooks/              # React Hooks
│   │   ├── useChatStream.ts      # SSE 流式处理
│   │   └── useTypingEffect.ts    # 打字机效果
│   ├── services/           # API 服务
│   │   └── chatService.ts        # Chat API 客户端
│   ├── stores/             # 状态管理
│   │   └── chatStore.ts          # 聊天状态
│   ├── utils/              # 工具函数
│   │   ├── protocolAdapter.ts    # 协议适配层
│   │   └── messageUtils.ts       # 消息工具
│   ├── App.tsx             # 根组件
│   └── main.tsx            # 入口文件
├── index.html              # HTML 模板
├── vite.config.ts          # Vite 配置
├── tailwind.config.js      # Tailwind 配置
└── package.json
```

## 核心功能

### 1. 流式聊天

使用 `useChatStream` Hook 处理流式聊天：

```typescript
const { messages, sendMessage, isStreaming, error } = useChatStream({
  responseMode: 'incremental', // 或 'full'
});

// 发送消息
sendMessage('Hello, Qwen Code!');
```

### 2. 协议适配

`ProtocolAdapter` 负责将后端协议转换为前端友好的格式：

- 处理增量模式的 content 累积
- 转换工具调用消息格式
- 管理消息状态

### 3. 打字机效果

`useTypingEffect` Hook 实现打字机效果：

```typescript
const displayedContent = useTypingEffect(content, {
  speed: 20, // 毫秒/字符
  enabled: true,
});
```

### 4. 工具调用展示

支持展示工具调用的完整生命周期：

- `tool_call_request`：工具调用请求
- `tool_execution_start`：工具执行开始
- `tool_execution_complete`：工具执行完成
- `tool_execution_error`：工具执行错误

## 配置

### 后端 API 地址

默认情况下，前端通过 Vite 代理连接到后端：

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
}
```

如需修改后端地址，可以：

1. 修改 `vite.config.ts` 中的代理配置
2. 或设置环境变量（需要相应配置）

### 响应模式

支持两种响应模式：

- **incremental**（默认）：增量模式，每次只发送新增的内容片段
- **full**：全量模式，每次发送完整的内容

## 开发指南

### 添加新组件

1. 在 `src/components/` 下创建组件文件
2. 使用 TypeScript 和 Tailwind CSS
3. 遵循现有的代码风格

### 添加新功能

1. 在相应的目录下添加文件
2. 更新类型定义（如需要）
3. 添加必要的测试

## 与后端集成

### API 端点

前端主要使用以下后端 API：

- `POST /api/chat/stream`：流式聊天
- `POST /api/chat/history`：获取历史记录
- `POST /api/session`：会话管理

### 协议格式

前端期望的 SSE 响应格式：

```json
{
  "sessionId": "string",
  "messageId": "string",
  "msgStatus": "generating" | "finished",
  "messages": [
    {
      "type": "content" | "tool_call_request" | ...,
      "value": "unknown",
      "timestamp": 1234567890,
      "id": "string",
      "status": "generating" | "generated"
    }
  ]
}
```

## 故障排除

### 连接问题

如果无法连接到后端：

1. 确认后端服务器正在运行（默认 `http://localhost:3000`）
2. 检查 Vite 代理配置
3. 查看浏览器控制台的错误信息

### 消息显示问题

如果消息无法正常显示：

1. 检查协议适配层是否正确处理消息
2. 查看浏览器控制台的错误日志
3. 确认消息格式是否符合预期

### 打字机效果问题

如果打字机效果异常：

1. 检查 `useTypingEffect` Hook 的配置
2. 确认内容更新逻辑是否正确
3. 查看是否有性能问题

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

Copyright 2025 Google LLC
SPDX-License-Identifier: Apache-2.0
