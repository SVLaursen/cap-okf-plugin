---
description: Collect evidence for a phase gate (G1–G6) and write the gate report for human sign-off
argument-hint: G<n>
---

Prepare the gate report for **$ARGUMENTS**. Do not start any new task.

1. Read the gate's exit criteria at the end of its phase in `docs/PLAN.md`.
2. Check every task of that phase is ticked and merged to `main` (`git log origin/main`, `gh pr view`).
3. For each exit criterion, gather evidence by running the relevant commands (e.g. `npm run check`, coverage for `lib/core`, conformance and golden suites, contract suite). Do not fake or summarise results you did not run.
4. Ask the `spec-checker` subagent to confirm OKF conformance of the current bundle output.
5. Write `docs/gates/$ARGUMENTS.md` on a branch `docs/gate-$ARGUMENTS` with:
   - a table: criterion · status (met / not met) · evidence (command and result, or PR link)
   - open issues and risks carried into the next phase
   - an empty line at the end for the maintainer's `Signed off: <name>, <date>` (never write it yourself)
6. Open a PR for the report and stop. Tell me which criteria are not met, if any.
