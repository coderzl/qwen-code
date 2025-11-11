#!/bin/bash
# At命令示例脚本
# 演示如何使用@命令引用文件

set -e

BASE_URL="http://localhost:3000"

echo "=== Qwen Code Server - At命令示例 ==="
echo ""

# 1. 创建会话
echo "1. 创建会话..."
SESSION_RESPONSE=$(curl -s -X POST "$BASE_URL/api/session" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceRoot": "'$(pwd)'"
  }')

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.sessionId')
echo "✓ 会话已创建: $SESSION_ID"
echo ""

# 2. 单文件引用
echo "2. 示例: 单文件引用 (@README.md)"
curl -N --no-buffer -X POST "$BASE_URL/api/chat/stream" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"请总结 @README.md 的主要内容\"
  }" 2>/dev/null | head -n 20
echo ""
echo ""

# 3. 多文件引用
echo "3. 示例: 多文件引用"
curl -N --no-buffer -X POST "$BASE_URL/api/chat/stream" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"对比 @package.json 和 @tsconfig.json 的配置\"
  }" 2>/dev/null | head -n 20
echo ""
echo ""

# 4. 通配符引用
echo "4. 示例: 通配符引用 (@src/*.ts)"
curl -N --no-buffer -X POST "$BASE_URL/api/chat/stream" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"分析 @src/**/*.ts 中的代码结构\"
  }" 2>/dev/null | head -n 20
echo ""
echo ""

# 5. 清理
echo "5. 清理会话..."
curl -s -X POST "$BASE_URL/api/session/delete" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\"}" > /dev/null
echo "✓ 会话已删除"
echo ""

echo "=== 示例完成 ==="

