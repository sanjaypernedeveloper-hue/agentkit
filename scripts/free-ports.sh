#!/bin/bash
# agentkit: frees the ports your test commands' servers listen on when a killed or interrupted run left those
# servers behind (a dev server, `vite preview`, a test API...). A leftover server makes the next test run fail at
# start-up when the suite insists on its own fresh server, and the run then stops for no reason in the story.
#
# Stops ONLY processes listening on those ports whose working directory or command line is inside this
# repository, so nothing else on the machine is touched. Prints "ports free" when there was nothing to do.
# Never run it while a test run is still going: it would stop that run's servers.
#
# usage (from the project root):  bash <plugin>/scripts/free-ports.sh [port ...]
#   with no ports, reads commands.test_ports from agentkit.yaml, e.g.  test_ports: [4173, 3900]
# needs lsof (macOS and most Linux distributions); without it, prints a note and does nothing.
set -u

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "free-ports: not inside a git repo"; exit 0; }
cd "$ROOT" || exit 0

if [ "$#" -gt 0 ]; then
  PORTS="$*"
else
  [ -f agentkit.yaml ] || exit 0
  PORTS=$(awk '
    /^commands:/ { inside = 1; next }
    /^[^ #]/     { inside = 0 }
    inside && $1 == "test_ports:" { sub(/^[^:]*:[ \t]*/, ""); sub(/[ \t]+#.*$/, ""); gsub(/[][,"'\'']/, " "); print; exit }
  ' agentkit.yaml)
fi
PORTS=$(echo "$PORTS" | tr -s ' ' ' ' | sed 's/^ //; s/ $//')
[ -n "$PORTS" ] || exit 0   # no ports configured: nothing to do
command -v lsof >/dev/null || { echo "free-ports: lsof not found, skipping"; exit 0; }

# True when the process runs from inside this repository (its working directory or its command line).
ours() {
  local cwd cmd
  cwd=$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)
  cmd=$(ps -o command= -p "$1" 2>/dev/null)
  case "$cwd/" in "$ROOT"/*) return 0 ;; esac
  case "$cmd" in *"$ROOT"/*) return 0 ;; esac
  return 1
}

stopped=""
for port in $PORTS; do
  case "$port" in *[!0-9]*) echo "free-ports: ignoring '$port' (not a port number)"; continue ;; esac
  for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
    cmd=$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-90)
    if ours "$pid"; then
      echo "free-ports: port $port: stopping leftover pid $pid ($cmd)"
      kill "$pid" 2>/dev/null
      stopped="$stopped $pid"
    else
      echo "free-ports: port $port: pid $pid is not from this repo, left alone ($cmd)"
    fi
  done
done

if [ -n "$stopped" ]; then
  sleep 2
  for pid in $stopped; do kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null; done
else
  echo "free-ports: ports free ($PORTS)"
fi
exit 0
