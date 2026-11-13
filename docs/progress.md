# Progress log

Newest first. One line per finished task or event: `YYYY-MM-DD · <task id> · <what happened> · <PR link>`.

## In flight

_None._

## Blocked

- 2026-11-13 · CI `reuse` job · `LICENSES/Apache-2.0.txt` is missing (REUSE needs it for the declared licence); it would fail once a remote and CI exist. Add it with the root `LICENSE` (HANDOVER step 6) · —

## Done

- 2026-11-13 · 0.6 · ADR-0007 (Proposed): curated `okf/`; build writes `gen/okf` and the same files to `gen/srv/okf-bundle/`; production serves the built bundle, development generates in memory; path, encoding and collision rules under `model/`; plan changes for 2.9, 3.4, 4.x listed for the maintainer · branch `docs/0.6-adr-0007-bundle-location`
- 2026-11-13 · 0.5 · ADR-0006 completed (Proposed): `@cap-js/mcp` 1.5.0 has no resource hook (no Contract C; upstream request drafted, not filed); Contract A checked against cap-mcp-v2 `590033c` (subscribe at plugin load, fallback check at `listening`); detection via `cds.env.plugins`; `@gavdi/cap-mcp` 1.x unsupported; OkfService READ handler must answer CQN · branch `docs/0.5-adr-0006-mcp-contracts`
- 2026-11-13 · demo · `demo/` workspace app (like cap-mcp-v2) that loads cap-okf through `file:..`; feature table maps each part to plan tasks; `npm run demo` / `demo:build`; integration test boots it with `cds.test` · branch `chore/demo-app`
- 2026-11-13 · 0.4 · ADR-0005 (Proposed): all five CAP extension points proven in a scratch app; caveats: conditional model is re-applied in build `hasTask()` and constructor, apps with their own `build.tasks` must list `okf`, index link uses internal `app._app_links`, own `cds-plugin.js` needs `CDS_PLUGINS` for CLI use in this repo · branch `docs/0.4-adr-0005-cap-extension-points`
- 2026-11-13 · 0.3 · OKF v0.2 `SPEC.md`, licence and 4 sample bundles copied from `knowledge-catalog@7806b14` (viz.html left out); presence test added · branch `test/0.3-okf-spec-fixtures`
- 2026-11-13 · 0.2 · Original bookshop fixture (Books, Authors, Genres; CatalogService with bound action and event; AdminService with `@requires`/`@restrict`; en and de i18n) and integration test via `cds.load` · branch `test/0.2-bookshop-fixture`
- 2026-11-13 · 0.1 · Maintainer decision: cds 9 dropped (`@cap-js/sqlite` 3 needs cds 10); peer `@sap/cds >=10`, Node `>=22.12`, CI matrix cds 10 only · branch `chore/0.1-tooling`
- 2026-11-13 · 0.1 · Dev tooling, `yaml` and empty `cds-plugin.js` with smoke test; `npm run check` green locally (CI not run: no remote yet) · branch `chore/0.1-tooling`
- 2026-11-13 · plan · Support for both `@gavdi/cap-mcp` and `@cap-js/mcp` added: ADR-0004 (Accepted), ADR-0006 (Proposed), Phase 4 tasks 4.4–4.8 · —
- 2026-11-09 · setup · Repository scaffold, plan, governance and Claude Code tooling handed over · —
