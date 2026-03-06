#!/bin/bash

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 1

# 检查是否为 git 仓库
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  exit 0
fi

# 添加文件
git add "$FILE_PATH"

# 检查是否有待提交变更
if git diff --cached --quiet; then
  exit 0
fi

# 提交变更
RELATIVE_PATH="${FILE_PATH#$CLAUDE_PROJECT_DIR/}"
git commit -m "auto: update $RELATIVE_PATH"

# 获取当前分支名
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ -z "$BRANCH" ]; then
  exit 1
fi

# 尝试 push，如果分支不存在远程则使用 -u 标志
if git push origin "$BRANCH" 2>/dev/null; then
  # push 成功
  exit 0
else
  # push 失败，可能是新分支，尝试使用 -u 标志
  git push -u origin "$BRANCH" 2>/dev/null || {
    # 如果仍然失败，可能是无法连接远程或其他原因
    exit 1
  }
fi