---
description: Scaffold agentkit in this project (agentkit.yaml, devResources/, scrum/, backlog/), detect build/test commands, and move design docs in.
argument-hint: "[design-doc paths...]"
---

# /agentkit:init

Set up agentkit in the current project. The agentkit plugin root is `${CLAUDE_PLUGIN_ROOT}`.
Templates live in `${CLAUDE_PLUGIN_ROOT}/templates/`. Never overwrite an existing file without asking.

Arguments (optional design doc paths): $ARGUMENTS

## Steps

1. **Check the current state.** If `agentkit.yaml` already exists, say so, show it, and ask whether to
   (a) only add missing folders and files, or (b) stop. Never reset an existing scrum/ or backlog/.

2. **Git.** Run `git rev-parse --is-inside-work-tree`. agentkit needs git: dev commits per story, and the
   reviewer diffs against each story's base commit. If this is not a git repo, ask the user whether to run
   `git init`. If they say no, continue, but warn that `/agentkit:run` will refuse to start until git exists.

3. **Find design docs.** Use the paths in the arguments if given. Otherwise look for Markdown design,
   spec, PRD or architecture docs in the project root and in `docs/`, ignoring README, CHANGELOG, LICENSE
   and anything in node_modules or build output. Show the candidates and ask the user:
   - which docs belong in devResources/;
   - which one is the primary design doc;
   - whether to **move** (git mv if tracked) or **copy** them.

4. **Detect commands.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/detect-commands.sh" .` and show the
   suggestions with their evidence. Ask the user to confirm or edit each one. If the repo has no tooling
   yet, explain that empty commands are fine: the first planned story will create them, and the user
   fills them in afterwards.

5. **Ask for the remaining config** in one question set: project name (default: folder name),
   `max_fix_attempts` (default 3), `pause_after_planning` (default true), `git_commit_per_story`
   (default true), and whether the project has a web UI to check with **visual QA**. If yes, also ask for
   `visual_qa.ui_paths`, `base_url`, `start_command` and `design_refs`, keep the default viewports unless the
   user changes them, and tell the user that visual QA needs the chrome-devtools-mcp plugin
   (`/plugin marketplace add ChromeDevTools/chrome-devtools-mcp`, then
   `/plugin install chrome-devtools-mcp@chrome-devtools-plugins`).

6. **Scaffold.** Create these, using the template contents exactly:
   - `agentkit.yaml` from `templates/agentkit.yaml`, filled with the answers above;
   - `devResources/` containing the design docs, plus `devResources/agent-knowledge.md` from
     `templates/agent-knowledge.md`;
   - `scrum/QUESTIONS.md` from `templates/questions.md`;
   - `scrum/reviews/` (with a `.gitkeep`);
   - `scrum/visual-qa/` (with a `.gitkeep`) when visual QA is enabled;
   - `backlog/` (with a `.gitkeep`).

   Do NOT create BOARD.md or any story. `/agentkit:plan` does that.

7. **Report.** Print the final agentkit.yaml and the created tree, then tell the user the next step:
   `/agentkit:plan`. Do not start planning yourself.
