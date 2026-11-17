# Contributing to cap-okf

Read `docs/GOVERNANCE.md` first. The short version:

## Workflow

1. Pick an open task from `docs/PLAN.md`.
2. Branch from `main`: `<type>/<task-id>-<slug>`, e.g. `feat/1.3-validator`. Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`.
3. Test first (red), make it pass (green), clean up (refactor). Run `npm run check`.
   The MCP contract tests run through `@gavdi/cap-mcp` v2 from a checkout next to this one
   (`../cap-mcp-v2`, or the path in `CAP_MCP_V2`) with its `lib/` built; without it they are
   skipped. `npm run test:integrations` runs the contract suite alone.
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/): `feat(export): map CDS actions to OKF concepts`.
5. Open a PR using the template. Keep it small. CI must be green and one maintainer must approve.
6. PRs are squash-merged by a maintainer.

## Never

- Commit to or push `main`, force-push, or bypass hooks with `--no-verify`.
- Add runtime dependencies without an accepted ADR.
- Commit secrets, personal data or customer data.

## Licence

Apache-2.0. New files need no header; licensing is declared in `REUSE.toml`.
