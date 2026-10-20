---
project: ""
plan_approved: false      # set true by /agentkit:plan after the user approves the story list
updated: YYYY-MM-DD HH:MM
---

# Board

BOARD.md is the single source of truth for story status. Only the orchestrator and scrum master edit it.

## Stories
Fix stories are listed directly under their parent.

| ID | Title | Status | Depends on | Design ref | Attempts | Last review | Notes |
|---|---|---|---|---|---|---|---|
| STR-001 | ... | TODO | — | §x | 0 | — | |

## Coverage
Every section of the primary design doc that contains a requirement maps to at least one story.

| Design section | Requirement summary | Stories | Covered |
|---|---|---|---|
| §1 ... | ... | STR-001, STR-004 | yes |

## Uncovered requirements
Requirements with no story, and why (open question, out of scope, not verifiable locally).

| Design section | Requirement | Reason | Question |
|---|---|---|---|

## Open questions
See [QUESTIONS.md](./QUESTIONS.md). Open: 0.

## Run log
Append-only, one line per status change: `YYYY-MM-DD HH:MM STR-00N STATUS_A -> STATUS_B (reason)`.
