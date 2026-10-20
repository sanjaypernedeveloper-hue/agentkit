---
id: BL-000
title: ""
source_story: STR-000
attempts: 0               # number of reviews that failed
backlogged_on: YYYY-MM-DD
suspected_root_cause: ""  # design-ambiguity | story-too-large | external-dependency | environment | other
blocked_stories: []       # stories that depend on the source story and are now BLOCKED
---

# BL-000: <title>

## Original story
<Full text of the original story's Goal, Scope and Acceptance Criteria, copied verbatim.>

## Review history
| Review | Story | Verdict | Failed criteria | Key finding |
|---|---|---|---|---|
| [review-1](../scrum/reviews/STR-000-review-1.md) | STR-000 | FAIL | AC 2, AC 4 | ... |

## Done vs. still missing
| Acceptance criterion | State | Evidence |
|---|---|---|
| AC 1 | Done | `path/file:line`, test `...` |
| AC 2 | Missing | ... |

## Suspected root cause
Explain why repeated fixes did not converge. Is the design ambiguous, is the story too large,
does it depend on something outside the repo, or is the environment broken?

## Recommendation
Concrete next step: answer question Q-00N, split into stories X and Y, provide credential Z, etc.
