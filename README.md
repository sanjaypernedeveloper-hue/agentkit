# agentkit

A Claude Code plugin that plans, builds and reviews a project from a design doc, one story at a time.

- **agent-scrum-master** (subagent) turns your design docs into small stories ordered by dependency,
  with a board, a coverage table and a list of open questions. It never guesses.
- **/agentkit:run** (the orchestrator, which runs in your main session) moves each story through
  dev, then review, then fix, and keeps the board up to date.
- **agent-dev** (subagent) implements exactly one story, writes its tests, runs every command, and commits.
- **agent-reviewer** (subagent) is read-only on source. It re-runs everything, judges every acceptance
  criterion with evidence, and writes fix stories or backlog stories.

The plugin is project-agnostic. Everything specific to a project lives in that project's `agentkit.yaml`
and `devResources/`.

## Install

```text
/plugin marketplace add <git-url-or-path-of-this-repo>
/plugin install agentkit@agentkit-marketplace
```

For example, `/plugin marketplace add github.com/<you>/agentkit` or `/plugin marketplace add ~/code/agentkit`.

## Quick start

```text
/agentkit:init  path/to/design.md   # scaffold, detect commands, move docs into devResources/
/agentkit:plan                      # scrum master writes stories; you review and approve
/agentkit:run next                  # one story: dev → review → (fix → review)* → completed or backlog
/agentkit:run all                   # keep going until nothing is runnable or something needs you
/agentkit:status                    # board summary
```

## Story lifecycle

```
STR-001 → review-1 FAIL → STR-001.1 → review-2 FAIL → STR-001.2 → review-3 FAIL
        → STR-001.3 → review-4 FAIL → backlog/BL-001   (with max_fix_attempts: 3)

A PASS at any point → COMPLETED-STR-001 (and its fix stories), then on to STR-002.
Backlogging STR-001 marks every story that depends on it BLOCKED.
```

Story selection: pending fix stories come first, then the lowest-id TODO story whose `depends_on` are
all COMPLETED. BLOCKED stories are never picked. A story left IN_PROGRESS or IN_REVIEW by an interrupted
run is resumed, not restarted.

The orchestrator stops and asks you when:
- a story needs an open question answered;
- dev says a story is wrong or impossible;
- the same failure repeats across unrelated stories;
- an action would change the design;
- the test suite is red before a story starts;
- the reviewer touched source files.

## Folder conventions (per project)

```
agentkit.yaml                  # project config
devResources/                  # everything dev and reviewer must load
  <design docs>.md
  agent-knowledge.md           # curated conventions + append-only progress log
scrum/
  BOARD.md                     # single source of truth for story status + coverage table
  QUESTIONS.md                 # open design questions (never guessed)
  STR-001-<slug>.md
  STR-001.1-<slug>.md          # fix story created by the reviewer
  COMPLETED-STR-002-<slug>.md
  reviews/STR-001-review-1.md
backlog/
  BL-001-<slug>.md
```

To answer a question, write the answer in `scrum/QUESTIONS.md`, set its status to `ANSWERED`, and re-run
`/agentkit:plan`. Decisions you want to be binding can also go in a file in `devResources/`
(for example `decisions.md`).

## Config reference (`agentkit.yaml`)

| Key | Default | Meaning |
|---|---|---|
| `project_name` | folder name | Shown on the board |
| `paths.dev_resources` | `devResources/` | Every file here is loaded by the scrum master, dev and reviewer |
| `paths.primary_design_doc` | none | The doc stories are planned from and coverage is measured against |
| `paths.knowledge_log` | `devResources/agent-knowledge.md` | Conventions and progress log |
| `paths.scrum` | `scrum/` | Stories, board, questions and reviews |
| `paths.backlog` | `backlog/` | Backlog stories |
| `commands.install/build/lint/typecheck/test` | detected | Run in this order by dev and reviewer. Empty means skipped. `test` must be the full suite |
| `workflow.max_fix_attempts` | `3` | Fix stories allowed before a story is backlogged |
| `workflow.pause_after_planning` | `true` | `/agentkit:run` refuses to start until you approve the plan |
| `workflow.git_commit_per_story` | `true` | Dev commits `STR-001: <title>` |
| `workflow.max_files_per_story` | `8` | The scrum master splits stories that touch more files than this |

git is required, because the reviewer diffs each story against the base commit recorded when the story starts.

## Customising agents

- **Per project, without forking:** add rules to `devResources/`. A conventions file, a decisions
  file, or edits to the "Conventions & Decisions" section of `agent-knowledge.md` are binding for dev and
  reviewer.
- **Override an agent in one project:** copy `agents/agent-dev.md` into the project's `.claude/agents/`
  and edit it. Project agents with the same name take precedence. Keep the return format, because the
  orchestrator parses it.
- **Fork the plugin:** edit `agents/*.md` (prompts, `tools`, `model`), `commands/*.md` (workflow) or
  `templates/*` (story, report and board formats). Bump `version` in `.claude-plugin/plugin.json`.
- **Model per agent:** set `model:` in an agent's front matter (for example `sonnet` for dev and `opus` for
  the reviewer). The default `inherit` uses your session model.

## Test locally

```bash
claude --plugin-dir /path/to/agentkit
```

Then run `/help` and check that `/agentkit:init`, `/agentkit:plan`, `/agentkit:run` and `/agentkit:status`
are listed, and that `/agents` shows the three agentkit agents. For an end-to-end smoke test:

```bash
mkdir /tmp/tconv && cd /tmp/tconv && git init
cp /path/to/agentkit/examples/tiny-design.md .
claude --plugin-dir /path/to/agentkit
# /agentkit:init tiny-design.md → /agentkit:plan → /agentkit:run next
```

Validate the manifests with `claude plugin validate /path/to/agentkit`.

## Plugin layout

```
.claude-plugin/plugin.json       manifest
.claude-plugin/marketplace.json  single-plugin marketplace
agents/                          scrum master, dev, reviewer
commands/                        init, plan, run (orchestrator), status
templates/                       agentkit.yaml, story, fix-story, backlog-story, review-report, board, questions, agent-knowledge
scripts/detect-commands.sh       suggests commands from package.json, pyproject, Cargo, go.mod, Makefile
scripts/snapshot.sh              working-tree fingerprint, used to prove the review was read-only
examples/tiny-design.md          small design doc for smoke tests
```
