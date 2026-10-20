---
description: Run agent-scrum-master to (re)plan stories from devResources/, then show the story list and coverage table for approval.
argument-hint: "[extra instructions for the scrum master]"
---

# /agentkit:plan

The agentkit plugin root is `${CLAUDE_PLUGIN_ROOT}`. Templates are in `${CLAUDE_PLUGIN_ROOT}/templates/`.

1. Read `agentkit.yaml`. If it is missing, tell the user to run `/agentkit:init` and stop.

2. Check that `paths.primary_design_doc` exists. If it does not, stop and say so.

3. Delegate to the **agent-scrum-master** subagent (the plugin agent `agentkit:agent-scrum-master`)
   with this prompt, filling in the placeholders:
   ```
   Project root: <absolute cwd>
   Config: agentkit.yaml
   Templates directory: ${CLAUDE_PLUGIN_ROOT}/templates
   Mode: <"initial plan" if scrum/BOARD.md does not exist, otherwise "re-plan after design or question changes">
   Extra instructions from the user: $ARGUMENTS
   Plan or update the stories following your instructions, then return your report.
   ```

4. When it returns, read `scrum/BOARD.md` yourself; do not rely only on the report. Show the user:
   - the **story list** as a table (id, title, status, depends_on, design_ref);
   - the **coverage table**, and the uncovered requirements with their reasons;
   - the **new open questions** from `scrum/QUESTIONS.md` (id plus one line each);
   - any BLOCKED stories and what blocks them.

5. **Approval.** If `workflow.pause_after_planning` is true, stop and ask the user to approve the plan,
   or say what to change. Do not start any dev work in this command.
   - On approval: set `plan_approved: true` in BOARD.md's front matter and append a Run log line.
     Tell the user the next step is `/agentkit:run next`.
   - On requested changes: delegate to the scrum master again with the user's feedback as extra
     instructions, then repeat from step 4.

   If `pause_after_planning` is false, set `plan_approved: true` straight away and say so.
