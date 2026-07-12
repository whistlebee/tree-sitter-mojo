#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
git -C "$repo_root" check-ignore -q .worktree/probe
git -C "$repo_root" check-ignore -q docs/superpowers/example.md

if git -C "$repo_root" ls-files --error-unmatch -- \
  'docs/superpowers/**' >/dev/null 2>&1; then
  echo 'docs/superpowers must not be tracked' >&2
  exit 1
fi
