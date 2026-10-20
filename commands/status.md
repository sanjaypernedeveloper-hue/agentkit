---
description: Summarise scrum/BOARD.md, showing counts by status, what's in flight, what's next, and open questions.
---

# /agentkit:status

Read-only. Do not modify any file.

1. Read `agentkit.yaml`, `<scrum>/BOARD.md` and `<scrum>/QUESTIONS.md`. If BOARD.md is missing, say that
   no plan exists yet and suggest `/agentkit:plan`.
2. Print:
   - **Counts** by status: TODO, IN_PROGRESS, IN_VISUAL_QA, IN_REVIEW, COMPLETED, BACKLOGGED, BLOCKED. Count fix stories
     separately.
   - Whether the plan is approved (`plan_approved`).
   - **In flight:** any IN_PROGRESS, IN_VISUAL_QA or IN_REVIEW story, with its attempt and last review verdict.
   - **Next up:** the story `/agentkit:run next` would pick, using its selection rules: pending fix stories
     first, then the lowest-id TODO story whose depends_on are all COMPLETED, never a BLOCKED one.
   - **Backlogged and blocked** stories, with one-line reasons and links to `backlog/BL-*.md`.
   - **Open questions:** ids, one-liners, and the stories each blocks.
   - **Coverage:** the number of design sections covered vs. uncovered.
   - The last 5 Run log lines.
3. Keep it to one screen. Link files with relative paths.
