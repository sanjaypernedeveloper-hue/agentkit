---
story: STR-000            # the story reviewed (parent or fix story)
parent: STR-000           # the parent story whose acceptance criteria are judged
review: 1                 # review number k (file name STR-000-review-<k>.md)
verdict: FAIL             # PASS | FAIL
reviewed_on: YYYY-MM-DD
diff_base: <commit sha>   # parent story's base_commit; the diff reviewed is base..working tree
---

# Review <k> of STR-000: <title>

## Verdict: PASS | FAIL
One-paragraph reason.

## Commands (re-run by the reviewer)
| Command | Result | Notes |
|---|---|---|
| install | PASS | |
| build | PASS | |
| lint | FAIL | 3 errors in `src/a.ts` |
| typecheck | PASS | |
| test | PASS | 142 passed, 0 failed |

## Acceptance criteria
| AC | Verdict | Evidence (file:line or test name) |
|---|---|---|
| 1 | PASS | `src/a.ts:12-30`; test `a.spec > returns 409 when taken` |
| 2 | FAIL | No test covers the expired case; `src/a.ts:44` ignores `expiresAt` |

## Checks
| Check | Verdict | Notes |
|---|---|---|
| Tests assert real behaviour (no trivial or tautological passes) | | |
| No regressions | | |
| No scope creep | | |
| Conventions followed (devResources/, Conventions & Decisions) | | |
| No secrets or debug leftovers | | |
| Knowledge log updated | | |

## Blocking gaps
Only filled on FAIL. Each gap is tied to an AC or a failing command. These become the fix story.
1. ...

## Suggestions (non-blocking)
Nits and ideas. These never trigger a fix story.
- ...
