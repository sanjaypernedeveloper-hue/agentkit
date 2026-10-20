#!/usr/bin/env bash
# Prints a fingerprint of every file that differs from HEAD (modified, staged or untracked),
# excluding the given agentkit-owned folders. Comparing two snapshots shows whether any source
# file changed in between, e.g. during a read-only review.
# Usage: snapshot.sh <scrum_dir> <backlog_dir>   (run from the project root)
set -euo pipefail

scrum="${1:?scrum dir}"; backlog="${2:?backlog dir}"
scrum="${scrum%/}/"; backlog="${backlog%/}/"

echo "HEAD $(git rev-parse HEAD 2>/dev/null || echo none)"
git status --porcelain=v1 --untracked-files=all -z |
  tr '\0' '\n' |
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    path="${line:3}"
    case "$path" in "$scrum"*|"$backlog"*) continue ;; esac
    if [ -f "$path" ]; then
      echo "${line:0:2} $(git hash-object -- "$path") $path"
    else
      echo "${line:0:2} deleted $path"
    fi
  done | LC_ALL=C sort
