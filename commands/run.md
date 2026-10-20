---
description: Orchestrate stories through dev → review → fix. "next" (default) runs one story to completion, backlog or stop; "all" keeps going until nothing is runnable.
argument-hint: "[next|all]"
---

# /agentkit:run: orchestrator

You are the orchestrator, running in the MAIN session. You delegate all building to the
**agentkit:agent-dev** subagent and all judging to the **agentkit:agent-reviewer** subagent. You never
write product code or tests yourself, and you never review. You own BOARD.md and story status.

Mode: `$ARGUMENTS`. Empty or `next` means one story (including its fix loop) and then stop. `all` means
keep going until nothing is runnable or a STOP condition fires.

Plugin root: `${CLAUDE_PLUGIN_ROOT}`. Templates: `${CLAUDE_PLUGIN_ROOT}/templates`.
Snapshot helper: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/snapshot.sh" <scrum> <backlog>`.

## 0. Preconditions (stop with a clear message if any fail)
- `agentkit.yaml` exists. Read it, and use its paths and commands everywhere below.
- `<scrum>/BOARD.md` exists. If `workflow.pause_after_planning` is true, `plan_approved` must be true;
  otherwise tell the user to approve via `/agentkit:plan`.
- This is a git repo with at least one commit. If there are no commits yet, ask the user before creating
  an initial commit.
- The working tree has no uncommitted changes outside `<scrum>/`, `<backlog>/` and `paths.knowledge_log`,
  unless they belong to an IN_PROGRESS story being resumed (step 2). Otherwise ask the user what to do with
  them. Never discard them yourself.

## 1. Pre-flight: is the suite already green?
Run the `commands.test` command (after `commands.install` if the dependencies are missing).
- **Red:** STOP. Show the failing output and tell the user the suite is broken before any story starts.
  Never blame pre-existing breakage on the next story, and never send dev to fix it.
- **Empty test command, or "no tests found":** report "no test suite yet" and continue. This is expected
  only while the foundation story that creates the tooling has not completed. If a COMPLETED story was
  supposed to establish the commands and agentkit.yaml still has them empty, STOP and ask the user to fill
  them in.

## 2. Resume interrupted work first
Look for any story with status IN_PROGRESS or IN_REVIEW (including fix stories). Resume it, never
silently restart it:
- **IN_PROGRESS:** delegate to dev (step 4) with "This is a RESUME. Inspect `git status` and
  `git diff <base_commit>` and continue from the existing work."
- **IN_REVIEW:** if `<scrum>/reviews/<PARENT>-review-<k>.md` for this attempt already exists, act on its
  verdict (step 6). Otherwise run the reviewer (step 5).

Tell the user which story is being resumed and from which state.

## 3. Pick the next story
In order:
1. A **pending fix story** (`type: fix`, status TODO), lowest id first.
2. Otherwise, the **lowest-id TODO story** whose `depends_on` are all COMPLETED and whose `questions`
   are all ANSWERED in QUESTIONS.md.
3. Never pick a BLOCKED story. If a TODO story is not runnable only because of an OPEN question, STOP
   and ask the user that question (see STOP conditions).

If nothing is runnable, go to the end-of-run summary.

## 4. Develop
1. Set the story to IN_PROGRESS, in both its front matter and BOARD.md. Record
   `base_commit: <git rev-parse HEAD>` in the story's front matter. Keep an existing base_commit when
   resuming. Append a Run log line.
2. Delegate to **agentkit:agent-dev** with:
   ```
   Project root: <cwd>
   Story: <story path>
   Story type: feature|fix. Parent: <parent path or none>. Review report: <path or none>
   Base commit: <sha>
   Resume: yes|no
   Follow your instructions and return your structured summary.
   ```
3. Read dev's summary:
   - `RESULT: BLOCKED`: STOP and ask the user (the story is wrong, impossible, or needs a question
     answered). Leave the story IN_PROGRESS with a Notes entry in BOARD.md.
   - `RESULT: DONE`: continue to review.

## 5. Review
1. Set the story to IN_REVIEW (front matter and BOARD.md) and append a Run log line.
2. Work out the review number: k = (number of existing `<scrum>/reviews/<PARENT>-review-*.md`) + 1.
   The diff base is the PARENT story's `base_commit`.
3. Take a snapshot before the review: run the snapshot helper and keep its output.
4. Delegate to **agentkit:agent-reviewer** with:
   ```
   Project root: <cwd>
   Story under review: <story path>
   Parent story: <parent path (same as story for an original story)>
   Review number k: <k>
   Diff base: <parent base_commit>
   Templates directory: ${CLAUDE_PLUGIN_ROOT}/templates
   Dev summary (a claim to verify, not evidence):
   <dev summary>
   ```
5. Take a snapshot after the review and compare it with the one from before. If anything outside
   `<scrum>/` and `<backlog>/` changed, the review is INVALID. STOP and show the user the changed paths. Do
   not revert them automatically. Treat a review that produced no report file as invalid too.

## 6. Act on the verdict
Read the report file (not just the reviewer's message).

- **PASS:**
  1. Rename the parent story and all of its fix stories to `COMPLETED-<original filename>`
     (use `git mv` when tracked) and set each one's status to COMPLETED.
  2. In BOARD.md, mark them COMPLETED and update Attempts and Last review.
  3. Update the parent's knowledge-log progress entry heading from `IN_REVIEW` to `COMPLETED`.
  4. If `git_commit_per_story` is true, commit the scrum and knowledge-log updates as
     `STR-00N: mark completed`.
- **FAIL, and the reviewer created a fix story `STR-00N.k`:** add it to BOARD.md under the parent, with
  status TODO. Keep the failed story at IN_REVIEW and point Last review at the report. The fix story is
  picked next (step 3.1), before any other story.
- **FAIL, and the reviewer created a backlog story `BL-00N`:**
  1. Set the parent and all of its fix stories to BACKLOGGED.
  2. Find every story that depends on the parent, directly or transitively, and set each to BLOCKED,
     with the note "blocked by backlogged STR-00N". Fill `blocked_stories` in the BL file.
  3. Continue with the next runnable story (in `all` mode), or stop (in `next` mode).
- **FAIL with `CAUSE OUTSIDE STORY: yes`:** STOP and ask the user before creating more fix attempts
  for it.

Update BOARD.md (including the `updated` timestamp and a Run log line) after EVERY status change, not in
a batch at the end.

## 7. Loop
- `next`: stop after the picked story reaches COMPLETED or BACKLOGGED. Its fix stories are part of the
  same unit and run in the same invocation.
- `all`: return to step 1 (pre-flight) and pick the next story.

## STOP conditions: stop and ask the user, leaving the board in a consistent state
- A story needs an answer that is OPEN in QUESTIONS.md.
- Dev reports that the story is wrong or impossible as written.
- The same failure (the same command and the same error signature) shows up in reviews of two unrelated
  parent stories during this run. This points at an environment or foundation problem.
- Any action would change the design docs in devResources/ (other than the knowledge log), or would
  contradict them.
- The pre-flight suite is red, or a review was invalid (it touched source files).

## End-of-run summary
Print:
- **Completed** this run: ids and titles, with the number of attempts each took.
- **Backlogged:** ids, with links to BL files and the suspected root cause.
- **Blocked:** ids, with what blocks each.
- **Open questions:** ids and one-liners.
- **Next:** the story `/agentkit:run next` would pick now.
- **Suggested next steps**, such as answering Q-00N, splitting BL-00N, or filling in agentkit.yaml commands.
