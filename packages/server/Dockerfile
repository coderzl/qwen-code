# Qwen Code Server Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/server/package*.json ./packages/server/

# 安装依赖
RUN npm ci --workspace=@qwen-code/qwen-code-core --workspace=@qwen-code/qwen-code-server

# 复制源码
COPY packages/core ./packages/core
COPY packages/server ./packages/server
COPY tsconfig.json ./
COPY scripts ./scripts

# 构建
RUN npm run build --workspace=@qwen-code/qwen-code-core
RUN npm run build --workspace=@qwen-code/qwen-code-server

# 生产镜像
FROM node:20-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/server/package*.json ./packages/server/

# 安装生产依赖
RUN npm ci --workspace=@qwen-code/qwen-code-core --workspace=@qwen-code/qwen-code-server --omit=dev

# 复制构建产物
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动服务
CMD ["node", "packages/server/dist/index.js"]

