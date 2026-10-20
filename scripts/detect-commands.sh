#!/usr/bin/env bash
# Suggests install/build/lint/typecheck/test commands for the project in $1 (default: cwd).
# Prints YAML lines under "commands:" plus "# evidence:" comments. Suggestions only; the user confirms.
set -euo pipefail

root="${1:-.}"
cd "$root"

install="" build="" lint="" typecheck="" test=""
evidence=()

has_script() { # $1 = script name; true if package.json has it in "scripts"
  [ -f package.json ] || return 1
  if command -v node >/dev/null 2>&1; then
    node -e 'const s=(require("./package.json").scripts||{});process.exit(s[process.argv[1]]?0:1)' "$1"
  else
    grep -Eq "\"$1\"[[:space:]]*:" package.json
  fi
}

if [ -f package.json ]; then
  pm="npm"
  if [ -f pnpm-lock.yaml ] || grep -q '"packageManager"[[:space:]]*:[[:space:]]*"pnpm' package.json; then pm="pnpm"
  elif [ -f yarn.lock ]; then pm="yarn"
  elif [ -f bun.lockb ] || [ -f bun.lock ]; then pm="bun"
  fi
  evidence+=("package.json found; package manager: $pm")
  case "$pm" in
    npm)  install="npm ci"; [ -f package-lock.json ] || install="npm install"; run="npm run" ;;
    pnpm) install="pnpm install --frozen-lockfile"; run="pnpm run" ;;
    yarn) install="yarn install --frozen-lockfile"; run="yarn" ;;
    bun)  install="bun install"; run="bun run" ;;
  esac
  has_script build && build="$run build"
  has_script lint && lint="$run lint"
  for s in typecheck type-check tsc check-types; do
    has_script "$s" && { typecheck="$run $s"; break; }
  done
  if [ -z "$typecheck" ] && [ -f tsconfig.json ]; then
    typecheck="$( [ "$pm" = npm ] && echo npx || echo "$pm exec" ) tsc --noEmit"
    evidence+=("no typecheck script; tsconfig.json present")
  fi
  has_script test && test="$run test"
fi

if [ -z "$test" ] && { [ -f pyproject.toml ] || [ -f setup.py ] || [ -f requirements.txt ]; }; then
  evidence+=("Python project files found")
  if [ -f uv.lock ]; then install="uv sync"; px="uv run"
  elif [ -f poetry.lock ]; then install="poetry install"; px="poetry run"
  elif [ -f requirements.txt ]; then install="pip install -r requirements.txt"; px=""
  else install="pip install -e ."; px=""
  fi
  grep -qs '\[tool.ruff' pyproject.toml && lint="${px:+$px }ruff check ."
  grep -qs '\[tool.mypy' pyproject.toml && typecheck="${px:+$px }mypy ."
  test="${px:+$px }pytest"
fi

if [ -z "$test" ] && [ -f Cargo.toml ]; then
  evidence+=("Cargo.toml found")
  install="cargo fetch"; build="cargo build"; lint="cargo clippy -- -D warnings"; typecheck="cargo check"; test="cargo test"
fi

if [ -z "$test" ] && [ -f go.mod ]; then
  evidence+=("go.mod found")
  install="go mod download"; build="go build ./..."; lint="go vet ./..."; test="go test ./..."
fi

if [ -f Makefile ]; then
  for t in install build lint typecheck test; do
    if grep -Eq "^$t:" Makefile; then
      evidence+=("Makefile target: $t")
      eval "[ -n \"\$$t\" ] || $t=\"make $t\""
    fi
  done
fi

[ ${#evidence[@]} -eq 0 ] && evidence+=("no recognised project files; commands left empty")

echo "commands:"
printf '  install: "%s"\n' "$install"
printf '  build: "%s"\n' "$build"
printf '  lint: "%s"\n' "$lint"
printf '  typecheck: "%s"\n' "$typecheck"
printf '  test: "%s"\n' "$test"
for e in "${evidence[@]}"; do echo "# evidence: $e"; done
