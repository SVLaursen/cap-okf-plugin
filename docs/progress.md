# Progress log

Newest first. One line per finished task or event: `YYYY-MM-DD · <task id> · <what happened> · <PR link>`.

## In flight

_None._

## Blocked

_None._

## Done

- 2026-11-16 · 1.3 · `validateBundle(files)` in `src/core/validate.ts` (maintainer decisions: takes raw `{ path, text }` files, not parsed concepts, so findings have exact lines and parse failures become R1; W1 covers `title` and `description` only; R3 checks index.md frontmatter (root `okf_version` only) and entries, and log.md `##` dates (valid YYYY-MM-DD, newest first, once each), log.md frontmatter allowed as in acme_retail; W2 also covers the §5 REQUIRED shapes `generated.by`, `verified[].by/at`, `sources[].resource`); `parseConceptLocated` adds line lookup; 18 broken fixtures, one finding each; all four official samples and the demo bundle give zero findings; 100% coverage of `src/core` · branch `feat/1.3-validate-bundle`
- 2026-11-16 · 1.2 · `serializeConcept(concept)` in `src/core/concept.ts`: known keys in OKF order then unknown keys in original order, block-style YAML with no line folding (`lineWidth: 0`), empty frontmatter as `---`/`---`, exactly one trailing newline, `__proto__` keys kept; all 78 sample files round-trip by value; 25 of 78 are byte-identical, the rest differ in key order and flow style (`tags: [a, b]`), left for task 1.7 to document · branch `feat/1.2-serialize-concept`
- 2026-11-16 · 1.1 · `parseConcept(path, text)` in `src/core/concept.ts` (pure, `yaml` only), ported from the JS branch: `Concept`/`Frontmatter` types, frontmatter `null` when absent, CRLF/BOM normalised, dates kept as strings, `ConceptParseError` with exact file line and rule R1; 100% coverage; all 82 sample and demo files parse (one-off script; task 1.7 turns this into a test) · branch `feat/1.1-parse-concept-ts`
- 2026-11-16 · style · Prettier added like cap-mcp-v2 (`printWidth: 100`); code and config only (Markdown, fixtures, `.claude/` excluded); `npm run check` and CI run `npm run format` · branch `chore/prettier`
- 2026-11-16 · 1.0 · TypeScript migration per ADR-0009: `src/` → `tsc` → CommonJS `lib/` (gitignored, built by `prepack`), `cds-plugin.js` hands `cds` to `lib/index.js`, tests in TS via ts-jest (unit and integration projects; integration loads `src/`, child processes use `lib/`), typescript-eslint, `npm run check` = typecheck + lint + test; plan layout and CI updated; `CLAUDE.md` left for the maintainer (read-only) · branch `chore/typescript-migration`
- 2026-11-13 · adr · ADR-0009 (Proposed): write cap-okf in TypeScript, mirroring cap-mcp-v2 (src/ → tsc → lib/, ts-jest, typescript-eslint); task 1.1 (JS, branch `feat/1.1-parse-concept`) to be redone in TS after the migration · branch `docs/adr-0009-typescript`
- 2026-11-13 · G1 · Maintainer decisions: ADR-0005 accepted (no index-page link), ADR-0007 accepted (plan updated), ADR-0006 open points settled and Contract A agreed (handoff in `docs/upstream/gavdi-cap-mcp/`); `LICENSE` and `LICENSES/Apache-2.0.txt` added (unblocks the REUSE job); CI waived until a remote exists · branch `docs/gate-G1`
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
