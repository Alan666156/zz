#!/usr/bin/env bash
# 一键创建多 agent 开发隔离 worktree
# 用法: bash scripts/setup-worktrees.sh [项目名]
set -euo pipefail

# 自动探测项目名（当前目录名），也可通过参数指定
PROJECT="${1:-$(basename "$(pwd)")}"
FE_DIR="../${PROJECT}-fe"
BE_DIR="../${PROJECT}-be"

if [ ! -d .git ]; then
  echo "错误: 请在 git 仓库根目录运行此脚本" >&2
  exit 1
fi

create_worktree() {
  local dir="$1" branch="$2"
  if [ -d "$dir" ]; then
    echo "跳过: $dir 已存在"
  elif git show-ref --verify --quiet "refs/heads/$branch"; then
    git worktree add "$dir" "$branch"
  else
    git worktree add "$dir" -b "$branch"
  fi
}

create_worktree "$FE_DIR" "feat/frontend"
create_worktree "$BE_DIR" "feat/backend"

echo ""
echo "完成。worktree 布局："
echo "  主工作区        $(pwd)        (Lead / 测试 / 集成)"
echo "  前端 worktree   $FE_DIR   (feat/frontend)"
echo "  后端 worktree   $BE_DIR   (feat/backend)"
echo ""
echo "清理时运行: git worktree remove $FE_DIR && git worktree remove $BE_DIR"
