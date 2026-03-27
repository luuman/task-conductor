#!/bin/bash
# auto_pull.sh - 持续监听远程仓库，自动 stash 本地更改并拉取新代码

BRANCH="master"
REMOTE="origin"
INTERVAL=30  # 检查间隔（秒）

cd "$(dirname "$0")" || exit 1

if ! git status &> /dev/null; then
    echo "当前目录不是 git 仓库"
    exit 1
fi

echo "开始监听远程更新 (分支: $BRANCH, 间隔: ${INTERVAL}s)"
echo "按 Ctrl+C 停止"

while true; do
    git fetch "$REMOTE" "$BRANCH" --quiet 2>/dev/null

    LOCAL=$(git rev-parse HEAD)
    REMOTE_COMMIT=$(git rev-parse "$REMOTE/$BRANCH" 2>/dev/null)

    if [ -z "$REMOTE_COMMIT" ]; then
        echo "[$(date '+%H:%M:%S')] 无法获取远程分支信息，跳过"
        sleep "$INTERVAL"
        continue
    fi

    if [ "$LOCAL" != "$REMOTE_COMMIT" ]; then
        echo "[$(date '+%H:%M:%S')] 检测到远程更新"

        # stash 本地未提交的更改
        HAS_STASH=false
        if [ -n "$(git status --porcelain)" ]; then
            STASH_MSG="auto-stash-$(date +%Y%m%d-%H%M%S)"
            git stash push -m "$STASH_MSG" --include-untracked
            echo "  已暂存本地更改: $STASH_MSG"
            HAS_STASH=true
        fi

        # 拉取远程代码
        if git pull "$REMOTE" "$BRANCH" --rebase --quiet; then
            echo "  拉取成功: $(git log --oneline -1)"

            # 恢复 stash
            if [ "$HAS_STASH" = true ]; then
                if git stash pop --quiet 2>/dev/null; then
                    echo "  本地更改已恢复"
                else
                    echo "  stash pop 冲突，请手动处理: git stash show -p"
                fi
            fi
        else
            echo "  拉取失败，中止 rebase"
            git rebase --abort 2>/dev/null
            # 恢复 stash
            if [ "$HAS_STASH" = true ]; then
                git stash pop --quiet 2>/dev/null
            fi
        fi
    fi

    sleep "$INTERVAL"
done
