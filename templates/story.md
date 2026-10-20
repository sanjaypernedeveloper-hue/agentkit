---
id: STR-000
title: ""
status: TODO            # TODO | IN_PROGRESS | IN_VISUAL_QA | IN_REVIEW | COMPLETED | BACKLOGGED | BLOCKED
type: feature           # feature | fix
parent: null            # parent story id (fix stories only)
attempt: 0              # 0 for the original story; k for fix story STR-000.k
depends_on: []          # story ids that must be COMPLETED first
design_ref: ""          # design doc section(s) this story implements, e.g. "§9.2 One avatar per guest"
ui: false               # true when the story changes what users see (triggers visual QA when enabled)
questions: []           # QUESTIONS.md ids this story is waiting on (story is BLOCKED while any is open)
base_commit: null       # set by the orchestrator when the story moves to IN_PROGRESS
---

# STR-000: <title>

## Goal
One or two sentences: what exists after this story that did not exist before, and why it matters.

## Scope
**In scope**
- ...

**Out of scope**
- ... (name the neighbouring stories that own these)

## Acceptance Criteria
Each criterion is observable and testable. No "should be fast" or "works well".
1. ...
2. ...

## Technical Notes
Constraints, interfaces, file locations and conventions from the design doc that apply here. Cite sections.

## Test Requirements
- One or more tests per acceptance criterion (name which AC each test covers).
- Edge and error cases: ...

## Definition of Done
- [ ] Every acceptance criterion is met and covered by a test
- [ ] install, build, lint, typecheck and test commands from agentkit.yaml all pass (full suite)
- [ ] No scope beyond this story; no debug leftovers or secrets
- [ ] Knowledge log entry appended; Conventions & Decisions updated if a convention changed
- [ ] Committed as "STR-000: <title>" (if git_commit_per_story is on)
