# Governance

Who decides what, how work is reviewed, and where Claude Code must stop. These rules apply to people and AI agents alike; where they differ, it says so.

## Roles

| Role | Who | Responsibilities |
| --- | --- | --- |
| Maintainer | Simon Vestergaard Laursen | Accepts ADRs, signs off gates, merges PRs, cuts releases, owns the roadmap |
| Reviewer | Maintainer or a delegated CAP developer | Reviews every PR before merge |
| Implementer | Claude Code (or any contributor) | Works tasks from `docs/PLAN.md`, opens PRs, proposes ADRs |

## Decision rights

| Decision | Implementer may decide alone | Needs maintainer |
| --- | --- | --- |
| Internal naming, function structure, refactoring inside a module | Yes | |
| Test design and fixtures (no real data) | Yes | |
| Order of tasks inside a phase, respecting dependencies | Yes | |
| Error message wording within the message pattern | Yes | |
| New or changed public API, config key, annotation or CLI flag | | Yes, via ADR |
| New runtime or dev dependency | | Yes, via ADR (runtime) or PR note (dev) |
| Anything contradicting an Accepted ADR | | Yes, via a superseding ADR |
| Changing a golden file | | Yes, called out in the PR |
| Starting the next phase | | Yes, gate sign-off |
| Merging, releasing, publishing, filing upstream issues | | Yes, always |

## Architecture Decision Records

- Location: `docs/adr/NNNN-title.md`, from `0000-template.md`. Use `/adr <title>`.
- Status flow: **Proposed** → **Accepted** or **Rejected**; later **Superseded by NNNN**.
- Only the maintainer changes status to Accepted. An implementer may write and propose.
- Code that depends on a Proposed ADR may be written on a branch but not merged.

## Phase gates

1. At the end of a phase, the implementer runs `/gate-check G<n>` and writes `docs/gates/G<n>.md` with evidence: commands run, results, links to PRs, open issues.
2. The maintainer reviews it and adds `Signed off: <name>, <date>` at the bottom.
3. Only then may tasks of the next phase start.

## Pull requests

- One task (or one coherent part of a task) per PR, ideally under ~400 changed lines excluding golden files.
- The PR template is mandatory: task id, test-first evidence, checks run, golden-file changes, ADRs touched.
- CI must be green. At least one human approval. Squash merge with a Conventional Commit title.
- Implementers never merge their own PRs. Claude Code never merges any PR.

## When Claude Code must stop and ask

- A task is ambiguous, or its acceptance criteria can't be tested as written.
- The work would contradict an Accepted ADR or need a new runtime dependency.
- A test would require network access, real credentials, or real customer data.
- A golden file would change in a task that does not say it should.
- CI fails for a reason outside the task's scope.
- A gate is reached.
- Anything would push to `main`, rewrite history, publish or release.

When stopping: state what was done, what is blocked, the options, and a recommendation. Record it in `docs/progress.md` under **Blocked**.

## Security and data

- No secrets, credentials, personal data or customer data in the repo, fixtures, bundles or test output.
- Authorization detail is only ever emitted inside the marked section (ADR-0003) and only served to authenticated requesters.
- Dependencies: prefer none; justify each; keep the lockfile committed; CI runs `npm audit --audit-level=high`.

## Releases

- SemVer, staying on 0.x while OKF is below 1.0. The README states the supported OKF spec version.
- Releases are cut by the maintainer through Release Please from Conventional Commits. Implementers do not tag or publish.
