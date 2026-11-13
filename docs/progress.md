# Progress log

Newest first. One line per finished task or event: `YYYY-MM-DD · <task id> · <what happened> · <PR link>`.

## In flight

_None._

## Blocked

- 2026-11-13 · CI `reuse` job · `LICENSES/Apache-2.0.txt` is missing (REUSE needs it for the declared licence); it would fail once a remote and CI exist. Add it with the root `LICENSE` (HANDOVER step 6) · —

## Done

- 2026-11-13 · 0.3 · OKF v0.2 `SPEC.md`, licence and 4 sample bundles copied from `knowledge-catalog@7806b14` (viz.html left out); presence test added · branch `test/0.3-okf-spec-fixtures`
- 2026-11-13 · 0.2 · Original bookshop fixture (Books, Authors, Genres; CatalogService with bound action and event; AdminService with `@requires`/`@restrict`; en and de i18n) and integration test via `cds.load` · branch `test/0.2-bookshop-fixture`
- 2026-11-13 · 0.1 · Maintainer decision: cds 9 dropped (`@cap-js/sqlite` 3 needs cds 10); peer `@sap/cds >=10`, Node `>=22.12`, CI matrix cds 10 only · branch `chore/0.1-tooling`
- 2026-11-13 · 0.1 · Dev tooling, `yaml` and empty `cds-plugin.js` with smoke test; `npm run check` green locally (CI not run: no remote yet) · branch `chore/0.1-tooling`
- 2026-11-13 · plan · Support for both `@gavdi/cap-mcp` and `@cap-js/mcp` added: ADR-0004 (Accepted), ADR-0006 (Proposed), Phase 4 tasks 4.4–4.8 · —
- 2026-11-09 · setup · Repository scaffold, plan, governance and Claude Code tooling handed over · —
