---
description: Draft a new Architecture Decision Record with status Proposed
argument-hint: <short title>
---

Create a new ADR titled "$ARGUMENTS".

1. Find the highest number in `docs/adr/` and use the next one, zero-padded to four digits.
2. Copy `docs/adr/0000-template.md` to `docs/adr/NNNN-<kebab-title>.md`.
3. Fill in Context, at least two Options with honest pros and cons, a recommended Decision and Consequences. Link the plan task it relates to.
4. Status stays **Proposed**. Never set Accepted; only the maintainer does that.
5. If it supersedes an Accepted ADR, say so in Context; do not edit the old ADR.
6. Commit on a `docs/adr-NNNN-<slug>` branch, open a PR, and stop.
