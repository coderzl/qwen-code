#!/bin/bash
# 自定义命令示例脚本
# 演示如何创建和使用自定义命令

set -e

BASE_URL="http://localhost:3000"
WORKSPACE="/tmp/qwen-code-test"

echo "=== Qwen Code Server - 自定义命令示例 ==="
echo ""

# 准备工作区
echo "0. 准备工作区..."
mkdir -p "$WORKSPACE/.qwen/commands"
cd "$WORKSPACE"

# 创建示例文件
cat > "$WORKSPACE/example.ts" << 'EOF'
function add(a: number, b: number): number {
  return a + b;
}

function multiply(x: number, y: number): number {
  return x * y;
}

export { add, multiply };
EOF

echo "✓ 工作区已准备: $WORKSPACE"
echo ""

# 1. 创建自定义命令
echo "1. 创建自定义命令..."
cat > "$WORKSPACE/.qwen/commands/review.toml" << 'EOF'
description = "Code review helper"
prompt = """
Please review the following code file and provide feedback on:
1. Code quality
2. Potential bugs
3. Best practices
4. Performance considerations

File path: {{args}}

Content:
@{{{args}}}
"""
EOF

cat > "$WORKSPACE/.qwen/commands/explain.toml" << 'EOF'
description = "Explain code functionality"
prompt = """
Please explain what the following code does in simple terms:

@{{{args}}}

Focus on:
- Main functionality
- Input/output
- Use cases
"""
EOF

echo "✓ 已创建命令: review, explain"
echo ""

# 2. 创建会话
echo "2. 创建会话..."
SESSION_RESPONSE=$(curl -s -X POST "$BASE_URL/api/session" \
  -H "Content-Type: application/json" \
  -d "{
    \"workspaceRoot\": \"$WORKSPACE\"
  }")

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.sessionId')
echo "✓ 会话已创建: $SESSION_ID"
echo ""

# 3. 列出可用命令
echo "3. 列出所有可用命令..."
COMMANDS=$(curl -s -X POST "$BASE_URL/api/commands/list" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\"
  }")
echo "$COMMANDS" | jq '.commands[] | "\(.name): \(.description)"'
echo ""

# 4. 执行review命令
echo "4. 执行 'review' 命令..."
curl -s -X POST "$BASE_URL/api/commands/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"command\": \"review\",
    \"args\": \"example.ts\"
  }" | jq '.'
echo ""

# 5. 执行explain命令
echo "5. 执行 'explain' 命令..."
curl -s -X POST "$BASE_URL/api/commands/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"command\": \"explain\",
    \"args\": \"example.ts\"
  }" | jq '.'
echo ""

# 6. 获取命令帮助
echo "6. 获取 'review' 命令的帮助..."
curl -s -X POST "$BASE_URL/api/commands/help" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"command\": \"review\"
  }" | jq '.'
echo ""

# 7. 清理
echo "7. 清理..."
curl -s -X POST "$BASE_URL/api/session/delete" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\"}" > /dev/null
echo "✓ 会话已删除"

# 询问是否删除工作区
read -p "是否删除测试工作区? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  rm -rf "$WORKSPACE"
  echo "✓ 工作区已删除"
fi

echo ""
echo "=== 示例完成 ==="

