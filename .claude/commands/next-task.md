---
description: Pick the next open task from docs/PLAN.md and work it test-first on its own branch
---

Work exactly one task from the plan.

1. Read `docs/PLAN.md`, `docs/progress.md` and the ADRs in `docs/adr/`.
2. Find the current phase: the first phase whose gate report in `docs/gates/` is missing a `Signed off:` line. Never start a task from a later phase.
3. If every task of the current phase is ticked, do not start anything new: tell me to run `/gate-check` for that phase's gate and stop.
4. Otherwise pick the first unticked task in the current phase whose dependencies are done. If `$ARGUMENTS` names a task id, use that one instead (still within the current phase).
5. If the task depends on a Proposed (not Accepted) ADR, stop and tell me which ADR needs a decision.
6. Restate the task's acceptance criteria in a few bullets. If any are ambiguous, ask before writing code.
7. `git switch main && git pull --rebase origin main`, then `git switch -c <type>/<task-id>-<slug>`.
8. Red: write the failing tests; run them and show they fail for the expected reason.
9. Green: implement the simplest code that passes. Use cds-mcp to check CAP APIs before using them.
10. Refactor with tests green. Run `npm run check`.
11. Commit (Conventional Commits), tick the task in `docs/PLAN.md`, add a line to `docs/progress.md`.
12. Ask the `reviewer` subagent to review the branch diff against `CLAUDE.md` and fix what it finds.
13. Push the branch and open a PR with `gh pr create --fill` and the PR template filled in.
14. Stop and report: task id, PR link, test evidence, and anything surprising.
