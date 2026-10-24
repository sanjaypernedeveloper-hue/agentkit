---
description: Run stories one by one, each in a FRESH headless Claude session (scripts/run-loop.sh), until nothing is runnable or a STOP condition fires.
argument-hint: "[max_stories]"
---

# /agentkit:loop

`/agentkit:run all` keeps one orchestrator session for every story, so its context grows. The loop script
starts a new headless session (`claude -p "/agentkit:run next unattended"`) for each story instead.

1. Check that `agentkit.yaml` and `<scrum>/BOARD.md` exist. If they don't, say which command to run first
   (`/agentkit:init` or `/agentkit:plan`) and stop.
2. Tell the user:
   - The command to run in their own terminal, from the project root, so they can watch it:
     `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-loop.sh" $ARGUMENTS`
   - The orchestrator model it will use (`models.orchestrator`, default `sonnet`) and that subagents use
     `models.*` from agentkit.yaml.
   - Where to watch: `<scrum>/run-logs/` (one log per story run), `<scrum>/BOARD.md`,
     `<scrum>/RUN-NOTES-<date>.md` (recaps and STOP reasons), and `claude --resume` for each session's
     full transcript.
   - To add `<scrum>/run-logs/` to `.gitignore` if it isn't there.
3. Offer to start it from this session instead (Bash with `run_in_background`). Do this only if the user
   says yes.
