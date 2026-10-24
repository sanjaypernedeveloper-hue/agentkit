#!/bin/bash
# agentkit run loop: runs `/agentkit:run next unattended` in a FRESH headless Claude session per story, so the
# orchestrator's context never piles up between stories. Stops when a run makes no progress (a STOP condition,
# an open question, or nothing left to run), waits out usage limits, and keeps a Mac awake while it runs.
#
# usage (from the project root):  bash <plugin>/scripts/run-loop.sh [max_stories]     (default 50)
#   /agentkit:loop prints the exact path for your install.
# env:   PERMISSION_MODE   (default auto)   permission mode for each headless session
#        LIMIT_WAIT_SECONDS (default 1800)  sleep after a usage-limit message, then resume
# reads: agentkit.yaml models.orchestrator (default sonnet) and paths.scrum (default scrum/)
# logs:  <scrum>/run-logs/<timestamp>-<n>.log  (add it to .gitignore)
set -u

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "run-loop: not inside a git repo"; exit 1; }
cd "$ROOT" || exit 1
[ -f agentkit.yaml ] || { echo "run-loop: no agentkit.yaml in $ROOT (run /agentkit:init)"; exit 1; }
command -v claude >/dev/null || { echo "run-loop: the claude CLI is not on PATH"; exit 1; }

# yaml_get <section> <key>: the value of a key nested one level under a top-level section (quotes and comments
# stripped). Enough for agentkit.yaml; not a general YAML parser.
yaml_get() {
  awk -v sec="$1:" -v key="$2:" '
    $0 ~ "^" sec { inside = 1; next }
    /^[^ #]/      { inside = 0 }
    inside && $1 == key { sub(/^[^:]*:[ \t]*/, ""); sub(/[ \t]+#.*$/, ""); gsub(/["'\'']/, ""); print; exit }
  ' agentkit.yaml
}

MAX=${1:-50}
MODEL=$(yaml_get models orchestrator); MODEL=${MODEL:-sonnet}
SCRUM=$(yaml_get paths scrum); SCRUM=${SCRUM:-scrum/}; SCRUM=${SCRUM%/}
PERMISSION_MODE=${PERMISSION_MODE:-auto}
LIMIT_WAIT_SECONDS=${LIMIT_WAIT_SECONDS:-1800}
LOG_DIR="$SCRUM/run-logs"
mkdir -p "$LOG_DIR"

[ -f "$SCRUM/BOARD.md" ] || { echo "run-loop: no $SCRUM/BOARD.md (run /agentkit:plan)"; exit 1; }

if command -v caffeinate >/dev/null; then caffeinate -i -s -w $$ & fi   # keep a Mac awake while this runs

checksum() { if command -v md5 >/dev/null; then md5 -q "$1"; else md5sum "$1" | cut -d' ' -f1; fi; }
state() { echo "$(git rev-parse HEAD) $(checksum "$SCRUM/BOARD.md")"; }

echo "run-loop: orchestrator model $MODEL, permission mode $PERMISSION_MODE, up to $MAX run(s)"
n=0
while [ "$n" -lt "$MAX" ]; do
  n=$((n + 1))
  before=$(state)
  log="$LOG_DIR/$(date +%Y%m%d-%H%M%S)-$n.log"
  echo "[$(date '+%H:%M')] run $n (fresh session) -> $log"
  claude -p "/agentkit:run next unattended" --model "$MODEL" --permission-mode "$PERMISSION_MODE" > "$log" 2>&1
  code=$?

  if grep -qiE "session limit|usage limit|rate.?limit|429" "$log"; then
    echo "[$(date '+%H:%M')] usage limit hit; sleeping ${LIMIT_WAIT_SECONDS}s, then resuming"
    sleep "$LIMIT_WAIT_SECONDS"
    continue                      # the next run resumes the interrupted story
  fi

  if [ "$(state)" = "$before" ]; then
    echo "[$(date '+%H:%M')] no progress (exit $code), stopping. See $log and $SCRUM/RUN-NOTES-*.md"
    break
  fi
done
echo "run-loop: done after $n run(s). Board: $SCRUM/BOARD.md"
