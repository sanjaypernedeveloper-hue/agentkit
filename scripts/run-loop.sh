#!/bin/bash
# agentkit run loop: runs `/agentkit:run next unattended` in a FRESH headless Claude session per story, so the
# orchestrator's context never piles up between stories. Stops when a run makes no progress (a STOP condition,
# an open question, or nothing left to run), waits out usage limits, and keeps a Mac awake while it runs.
#
# usage (from the project root):  bash <plugin>/scripts/run-loop.sh [max_stories]     (default 50)
#   /agentkit:loop prints the exact path for your install.
# env:   PERMISSION_MODE   (default auto)   permission mode for each headless session
#        LIMIT_WAIT_SECONDS (default 1800)  sleep after a usage-limit message, then resume
#        PRIORITY           e.g. "STR-012 STR-009": once nothing is in flight, these TODO stories go first, in
#                           this order, before the lowest-id rule
# reads: agentkit.yaml models.orchestrator (default sonnet), paths.scrum (default scrum/) and commands.test_ports
#        (freed of leftover servers from this repo before every session, see free-ports.sh)
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

PROMPT="/agentkit:run next unattended"
if [ -n "${PRIORITY:-}" ]; then
  PROMPT="$PROMPT
Product owner's priority: first finish any story already in progress (IN_PROGRESS, IN_VISUAL_QA, IN_REVIEW) and its
fix stories. Then, when picking a new story, pick the first of these that is TODO and runnable before any other TODO
story: $PRIORITY. When none of them is TODO, use the normal lowest-id rule."
fi
HERE=$(cd "$(dirname "$0")" && pwd)

echo "run-loop: orchestrator model $MODEL, permission mode $PERMISSION_MODE, up to $MAX run(s)${PRIORITY:+, priority $PRIORITY}"
n=0
while [ "$n" -lt "$MAX" ]; do
  n=$((n + 1))
  before=$(state)
  log="$LOG_DIR/$(date +%Y%m%d-%H%M%S)-$n.log"
  echo "[$(date '+%H:%M')] run $n (fresh session) -> $log"
  # A session killed mid-test leaves its servers holding their ports; free them before the next one starts.
  bash "$HERE/free-ports.sh" | sed "s/^/[$(date '+%H:%M')] /"
  # No ceiling on how long -p waits for background work, so a long subagent is never cut off mid-story.
  CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 claude -p "$PROMPT" --model "$MODEL" --permission-mode "$PERMISSION_MODE" > "$log" 2>&1
  code=$?

  [ "$(state)" != "$before" ] && continue   # progress: on to the next story

  # No progress. A usage limit (matched only on Claude's own limit messages, so a story that mentions
  # rate limits cannot trigger it) means wait and resume; anything else means stop.
  if grep -qiE "(usage|session|weekly|5-hour) limit (reached|hit)|hit your ([a-z0-9-]+ )?limit|limit (reached )?[^a-z]{0,6}resets" "$log"; then
    echo "[$(date '+%H:%M')] usage limit hit; sleeping ${LIMIT_WAIT_SECONDS}s, then resuming"
    sleep "$LIMIT_WAIT_SECONDS"
    continue                      # the next run resumes the interrupted story
  fi

  echo "[$(date '+%H:%M')] no progress (exit $code), stopping. See $log and $SCRUM/RUN-NOTES-*.md"
  break
done
echo "run-loop: done after $n run(s). Board: $SCRUM/BOARD.md"
