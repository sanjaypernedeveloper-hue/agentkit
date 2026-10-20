---
story: STR-000            # the story checked (parent or fix story)
parent: STR-000
visual_run: 1             # run number v (file name STR-000-visual-<v>.md)
verdict: FAIL             # PASS | FAIL | SKIPPED
checked_on: YYYY-MM-DD
diff_base: <commit sha>
app_url: http://localhost:5173
design_refs: [devResources/prototype.html]
---

# Visual QA <v> of STR-000: <title>

## Verdict: PASS | FAIL | SKIPPED
One-paragraph reason.

## Viewports
| Viewport | Size | Verdict | Major | Minor |
|---|---|---|---|---|
| iphone | 390×844 @3x | PASS | 0 | 1 |
| laptop | 1280×800 @1x | FAIL | 1 | 0 |

## Scope checked
Screens and states, and the acceptance criteria they cover.
- Join screen: default, long nickname, `NAME_TAKEN` error (AC 5, 7, 13)

## Major findings
Only on FAIL. Each one becomes rework for dev, and the reviewer treats any that are still open as blocking gaps.
### 1. <title>
- **Viewport / state:** laptop 1280×800, default
- **Expected:** (design ref or AC) …
- **Actual (measured):** …
- **Evidence:** `STR-000-visual-1/laptop-default-app.png`, `…-ref.png`
- **Where to look:** `apps/web/src/…`

## Minor findings
Never cause a FAIL.
- …

## Console and network
- Console errors: none
- Failed requests: none

## Checked and fine
- …
