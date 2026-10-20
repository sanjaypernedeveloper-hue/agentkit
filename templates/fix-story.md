---
id: STR-000.1
title: "Fix: <parent title>"
status: TODO
type: fix
parent: STR-000
attempt: 1
depends_on: []
design_ref: ""          # copied from the parent
ui: false               # copied from the parent
questions: []
base_commit: null
review_report: scrum/reviews/STR-000-review-1.md
---

# STR-000.1: Fix for STR-000 <parent title>

Parent story: [STR-000](./STR-000-<slug>.md)
Triggering review: [STR-000-review-1](./reviews/STR-000-review-1.md)

## Goal
Close ONLY the gaps below so that every acceptance criterion of STR-000 passes.

## Gaps
Each gap names the parent acceptance criterion it blocks. Nothing here is new scope.

| # | Parent AC | What is wrong (with evidence) | What "fixed" looks like |
|---|---|---|---|
| 1 | AC 2 | `src/x.ts:41` returns 200 on invalid input; test `x.spec > rejects bad input` missing | Invalid input returns the documented error; a test asserts it |

## Failing commands (if any)
```
<command>: <short failing output>
```

## Out of scope
Everything not listed in Gaps. Review suggestions (nits) are NOT part of this story.

## Definition of Done
- [ ] Every gap above is closed and covered by a test
- [ ] All parent acceptance criteria still pass
- [ ] install, build, lint, typecheck and test all pass (full suite)
- [ ] Knowledge log entry appended
- [ ] Committed as "STR-000.1: <title>" (if git_commit_per_story is on)
