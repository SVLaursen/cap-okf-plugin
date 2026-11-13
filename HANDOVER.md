# Hand-over to Claude Code

How to start this project with Claude Code and keep control of it.

## One-time setup (human, ~15 minutes)

1. **Create the repository** `cap-okf` on GitHub, empty, default branch `main`.
2. **Unzip this starter** into a local folder and push it:
   ```sh
   git init -b main && git add . && git commit -m "chore: project scaffold and Claude Code hand-over"
   git remote add origin git@github.com:<you>/cap-okf.git && git push -u origin main
   ```
   (This first commit is yours; from here on `main` is protected.)
3. **Replace `@MAINTAINER`** in `.github/CODEOWNERS` with your GitHub username.
4. **Protect `main`** in GitHub settings: require PRs, one approval, CODEOWNERS review, status checks `Test`, `audit`, `commits`, `reuse`; disallow force-push; linear history.
5. **Install tools locally:** Node.js 22 or 24, `git`, GitHub CLI `gh` (run `gh auth login`), and Claude Code.
6. **Add the licence:** `curl -o LICENSE https://www.apache.org/licenses/LICENSE-2.0.txt`, commit via a PR.

## Start a session

```sh
cd cap-okf
claude
```

On first start Claude Code asks you to approve the project MCP server **cds-mcp** (CAP docs and model search) — approve it. Then say:

> Read CLAUDE.md, then run /next-task.

## What is already set up for Claude Code

| File | What it does |
| --- | --- |
| `CLAUDE.md` | Project memory: purpose, working loop, architecture rules, hard rules |
| `docs/PLAN.md` | Every task with test-first criteria and phase gates |
| `docs/GOVERNANCE.md` | Decision rights, ADR process, gates, when to stop and ask |
| `docs/adr/0001–0004` | Decisions already made: name `cap-okf`, opt-in serving, auth sections, both MCP plugins through one interface |
| `docs/adr/0006` | Proposed MCP integration contracts, pre-drafted from the `@gavdi/cap-mcp` v2 source |
| `docs/progress.md` | Running log Claude Code updates per task |
| `.mcp.json` | `cds-mcp` server for CAP docs and CDS model search |
| `.claude/settings.json` | Permissions: tests, lint, git on branches, PRs allowed; installs ask; merge, publish, tag, force-push and push to `main` denied |
| `.claude/hooks/guard-git.mjs` | Blocks commits on `main`, pushes to `main`, force-push, `--no-verify` |
| `.claude/hooks/guard-paths.mjs` | Blocks edits to governance, hooks, settings, Accepted ADRs and gate sign-offs |
| `.claude/hooks/lint-file.mjs` | Lints each edited JS file and sends problems back to Claude |
| `/next-task` | Works one plan task end to end: branch, red, green, refactor, review, PR |
| `/gate-check G<n>` | Collects evidence for a phase gate into `docs/gates/G<n>.md` |
| `/adr <title>` | Drafts a Proposed ADR |
| `reviewer` agent | Fresh-eyes review of the branch diff before each PR |
| `spec-checker` agent | Checks bundle output against the OKF spec copy |
| `.github/` | CI (Node 22/24 × cds 9/10, audit, commit lint, REUSE), PR template, CODEOWNERS |

## Your recurring job as maintainer

- **Per PR:** review, approve, squash-merge. Claude Code never merges.
- **Per Proposed ADR:** decide; change the status to Accepted or Rejected yourself.
- **Per gate:** read `docs/gates/G<n>.md`, add `Signed off: <name>, <date>`, merge.
- **Release 0.1 after G4, 0.2 after G5:** set up Release Please or Changesets when you reach G4 and cut releases yourself.

## Decisions waiting for you

Phase 0 ends with three Proposed ADRs: 0005 CAP extension points, 0006 MCP integration contracts (pre-drafted; Contract A needs a matching `mcp:resources` event and ADR in `@gavdi/cap-mcp`), 0007 bundle location. Before Phase 5, ADR-0008 must settle the Fiori source of truth. Open questions not yet scheduled: committing generated output, and multitenant bundles.
