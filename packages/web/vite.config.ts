import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0', // 绑定到所有网络接口，允许局域网访问
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // 不代理 /api/chat 请求，让自定义 fetch 处理
        bypass: (req) => {
          if (
            req.url?.includes('/api/chat') &&
            !req.url?.includes('/api/chat/stream')
          ) {
            return req.url;
          }
          return null;
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
