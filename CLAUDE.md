# CLAUDE.md — cap-okf

You are building **cap-okf**, a CAP (SAP Cloud Application Programming Model) plugin that turns a CDS model plus curated Markdown into one validated **Open Knowledge Format (OKF) v0.2** bundle, and lets each app choose whether to serve it statically, over MCP through `@gavdi/cap-mcp` or `@cap-js/mcp`, both, or neither.

## Read first, in this order

1. `docs/PLAN.md` — the task list you work through, phase by phase.
2. `docs/progress.md` — what is done, what is in flight, what is blocked.
3. `docs/GOVERNANCE.md` — what you may decide alone and where you must stop.
4. `docs/adr/` — decisions already made. Never contradict an Accepted ADR; propose a new one instead.

## The working loop (one task at a time)

1. Run `/next-task`, or pick the first unchecked task in `docs/PLAN.md` whose dependencies are done.
2. Create a branch: `git switch -c <type>/<task-id>-<slug>` (e.g. `feat/2.1-entity-mapper`).
3. **Red:** write the failing test(s) from the task's acceptance criteria. Run them; confirm they fail for the right reason.
4. **Green:** write the simplest code that passes.
5. **Refactor:** clean up with tests green. Run `npm run check`.
6. Commit with Conventional Commits; the test commit may come first (`test: …`), then `feat: …`.
7. Tick the task in `docs/PLAN.md`, add a line to `docs/progress.md`, push the branch, open a PR with `gh pr create` using the template.
8. Stop. Report the PR link and anything surprising. Do not start the next task in the same branch.

At the end of a phase, run `/gate-check G<n>` and stop for human sign-off.

## Commands

| Purpose | Command |
| --- | --- |
| All checks (lint + tests) | `npm run check` |
| Unit/conformance/golden/integration tests | `npm test` |
| One test file | `npx jest test/unit/<file>.test.js` |
| Lint and fix | `npm run lint -- --fix` |
| Compile a fixture to OKF (from Phase 2) | `npx cds compile test/fixtures/bookshop --to okf` |
| Update golden files (human review required) | `npm run test:update-golden` |

## Architecture rules (see docs/PLAN.md for the module table)

- `lib/core/` is **pure**: no `@sap/cds` import, no file system, no clock. Inputs in, values out.
- Every new CSN kind gets its **own mapper** registered in `lib/export/mappers/index.js`. Never add `if (kind === …)` branches to the exporter.
- Every server reads through `BundleSource` (`list()`, `read(path)`). Servers never touch the file system directly.
- Inject time and version (`{ now, version }`) wherever output contains them. Output must be byte-identical across runs.
- One runtime dependency besides `@sap/cds` (peer): `yaml`. Adding another needs an ADR.
- MCP integrations (ADR-0004, ADR-0006): one module per MCP plugin in `lib/serve/mcp/`, each implementing `McpIntegration { name, detect(cds), attach(...) }`. Never `require` an MCP plugin; meet it through CAP events and CDS models. Detection never switches serving on. Never read or write `cds.mcp`; our settings live under `cds.okf`.
- CommonJS modules, like other cap-js plugins. Node.js ≥ 22.

## CAP conventions

- Use the **cds-mcp** MCP server: search CAP docs with it every time you touch CDS models, `cds` APIs, the `cds` CLI, plugins or build tasks. Search model definitions with it before reading `.cds` files.
- Plugin entry is `cds-plugin.js`. Config lives under `cds.okf` and must honour profiles (`[development]`, `[production]`).
- Follow CAP terminology in names and messages (service, entity, projection, action, aspect).
- Tests use `cds.test()` for anything that needs a running CAP app; everything else is plain Jest.

## OKF rules you must not break

- Only `type` is required in frontmatter. Recommended: `title`, `description`, `resource`, `tags`.
- Consumers must keep unknown keys. Our parser must round-trip them unchanged.
- `index.md` and `log.md` are reserved filenames.
- v0.2: `generated.at` replaces `timestamp`; `sources` lives in frontmatter.
- The spec copy is in `test/fixtures/okf-spec/` once Phase 0 is done. When in doubt, read it there; do not rely on memory.

## Hard rules (also enforced by hooks and permissions)

- Never commit to or push `main`. Never force-push. Never `--no-verify`.
- Never merge a PR, publish to npm, or create a release. Humans do that.
- Never change an existing golden file without saying so explicitly in the PR description.
- Never put application data, secrets or personal data into fixtures or bundles.
- Authorization rules (`@restrict`, `@requires`) go only inside the marked authorization section (ADR-0003). Servers must strip it for unauthenticated requests.
- Never change the `@gavdi/cap-mcp` or `@cap-js/mcp` repositories. Contract changes there are agreed with their maintainers (ADR-0006).
- If a task is ambiguous, conflicts with an ADR, or needs a new dependency: stop and ask (see GOVERNANCE.md).

## Style

- Small functions, clear names, no clever one-liners. Comments explain *why*, not *what*.
- Code written must be readable by a junior level developer 
- Commit messages must follow conventional commit messages style 
- Error and lint messages follow: `[okf] <file>:<line> — <what is wrong>.` then an indented `<how to fix>.`
- Keep PRs under ~400 changed lines excluding golden files.
