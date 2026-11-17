# cap-okf — Implementation Plan

Work top to bottom. Each task lists **Depends on**, **Test first** (the failing tests you write before code) and **Done when**. A phase ends at a gate; after the gate check, stop and wait for human sign-off before starting the next phase.

Legend: `[ ]` open · `[x]` done (tick it in the same PR that completes the task).

## Target layout

```
cds-plugin.js                 # CAP plugin entry (stays JavaScript): hands `cds` to lib/index.js (compiled from src/)
src/                          # TypeScript (ADR-0009); tsc compiles it to CommonJS in lib/
  index.ts                    # plugin(cds): registers compile target, build task, serving
  core/
    concept.ts                # Concept model, parse/serialize frontmatter (pure)
    validate.ts               # Conformance rules + v0.2 field checks (pure)
    links.ts                  # Link extraction and resolution (pure)
    index-md.ts               # index.md generation (pure)
  export/
    mappers/index.ts          # Registry: CSN kind -> mapper
    mappers/<kind>.ts         # One file per kind
    auth-section.ts           # Authorization section rendering (ADR-0003)
    exporter.ts               # Walks CSN, uses registry, returns concepts
  bundle/
    source.ts                 # BundleSource interface + FileBundleSource
    sink.ts                   # BundleSink + FileBundleSink
    model-source.ts           # In-memory BundleSource generated from the model (ADR-0007)
    merge.ts                  # Merge generated + curated into one BundleSource
  build/
    compile.ts                # cds.compile.to.okf
    build-task.ts             # cds build task "okf"
    messages.ts               # Formatting of lint/validation messages
  serve/
    filter.ts                 # Strips authorization section for unauthenticated users
    static.ts                 # Express route
    mcp/index.ts              # McpIntegration selector: config, detection (ADR-0004)
    mcp/gavdi-cap-mcp.ts      # @gavdi/cap-mcp: okf:// resources via mcp:resources (ADR-0006 A)
    mcp/cap-js-mcp.ts         # @cap-js/mcp: tools channel; resources once a hook exists
    mcp/okf-service.ts        # OkfService READ handler over BundleSource (ADR-0006 B)
  add/okf.ts                  # cds add okf
srv/okf-service.cds           # OkfService model, added only when the tools channel is on
test/
  unit/  conformance/  golden/  integration/  contract/
  fixtures/bookshop/  fixtures/okf-spec/  fixtures/broken/
```

## Phase 0 — Spike and setup → Gate G1

- [x] **0.1 Tooling.** Install dev tooling (ask before `npm add`): `@sap/cds`, `@sap/cds-dk`, `@cap-js/sqlite`, `@cap-js/cds-test`, `jest`, `eslint`, `@eslint/js`, `globals`, `@commitlint/cli`, `@commitlint/config-conventional`. Runtime: `yaml`. Wire `npm run check`. _(CI pending: no remote yet.)_
  - Test first: `test/unit/smoke.test.js` requiring `cds-plugin.js` without throwing.
  - Done when: `npm run check` is green locally and in CI.
- [x] **0.2 Fixtures.** Write a small, original `test/fixtures/bookshop` (Books, Authors, Genres, CatalogService, AdminService with `@restrict`, one action, one event, i18n with en and de). No copied sample code.
  - Test first: integration test loads the fixture with `cds.load` and asserts the expected definitions exist.
- [x] **0.3 OKF spec fixtures.** Copy the OKF v0.2 `SPEC.md` and the official sample bundles from `GoogleCloudPlatform/knowledge-catalog` (`okf/`) into `test/fixtures/okf-spec/`, keeping its Apache-2.0 licence file and recording the commit SHA in `test/fixtures/okf-spec/SOURCE.md`. If network access is blocked, stop and ask the human to add them.
- [x] **0.4 Spike: CAP extension points.** Using cds-mcp docs search, confirm how a plugin registers (a) a `cds.compile.to` target, (b) a `cds build` task, (c) a `cds add` facet, (d) an Express route at bootstrap. Also (e) how a plugin adds a CDS model to the app only when a config flag is on (needed for `OkfService`). Write findings into ADR-0005 (Proposed).
- [x] **0.5 Spike: MCP integration contracts.** ADR-0006 is pre-drafted. Complete its open points: read the `@cap-js/mcp` source and confirm whether it has any resource hook (if so, add Contract C; if not, draft an upstream issue text but do not file it); check Contract A against the current `@gavdi/cap-mcp` v2 source (`src/index.ts`, `src/adapter/`); find how each plugin is detected from the app's resolved CAP plugin list. Do not change either MCP plugin's repository.
- [x] **0.6 Spike: bundle location.** ADR-0007 (Proposed): `gen/okf` for generated output, `okf/` for curated, generated concepts under `model/`.

**Gate G1:** ADR-0005..0007 reviewed by a human (ADR-0006 also agreed with the `@gavdi/cap-mcp` maintainer); CI green; fixtures present.

## Phase 1 — OKF core → Gate G2

- [x] **1.0 TypeScript migration (ADR-0009).** Move to TypeScript before the first core module: `src/` compiled by `tsc` to CommonJS `lib/`, tests in TypeScript via ts-jest, typescript-eslint, `npm run check` = typecheck + lint + test.
  - Done when: every test from Phase 0 runs as TypeScript and passes; `npm pack` builds and ships `lib/`; the demo builds.
- [x] **1.1 Parse.** `parseConcept(path, text)` → `{ path, id, frontmatter, body }`. Splits `---` frontmatter, parses YAML.
  - Test first: valid file; no frontmatter; invalid YAML (error has line number); unknown keys kept; CRLF line endings; UTF-8 BOM.
- [x] **1.2 Serialize.** `serializeConcept(concept)` with stable key order (`type, title, description, resource, tags, status, generated, verified, stale_after, sources`, then unknown keys in original order).
  - Test first: round-trip `parse(serialize(c))` deep-equals `c` for every sample fixture; output ends with exactly one newline.
- [x] **1.3 Validate.** `validateBundle(files)` (raw `{ path, text }`, so findings have exact lines; maintainer decision 2026-11-16) → list of `{ file, line, rule, severity, message, fix }`.
  - Rules (errors): R1 non-reserved file has valid frontmatter; R2 non-empty `type`; R3 reserved files keep their structure.
  - Checks (warnings): recommended fields missing; v0.2 field shapes (`generated.at` ISO 8601, `stale_after` absolute instant, `status` in draft/stable/deprecated, `sources[].id` unique); deprecated v0.1 `timestamp` used.
  - Test first: one fixture per rule in `test/fixtures/broken/`, each producing exactly the expected finding.
- [x] **1.4 Links.** Extract Markdown links, resolve against bundle paths, report broken ones with a "did you mean" suggestion (closest path by edit distance).
- [x] **1.5 index.md.** Generate `index.md` per folder like the official samples (maintainer decision 2026-11-16): one `# <type>` section per concept type with `* [title](path) - description` entries, then `# Subdirectories` with `* [folder](folder/index.md) - <n> concepts: <types>`. Deterministic order (types by name, entries by path).
- [x] **1.6 Bundle I/O.** `BundleSource { list(), read(path) }`, `FileBundleSource`, `BundleSink { write(path, text) }` with a `writeConcept(sink, concept)` helper, `FileBundleSink`. Async and text-only (maintainer decisions 2026-11-16).
  - Test first: in-memory fake and file implementation pass the same test suite.
- [x] **1.7 Conformance suite.** Every official sample bundle parses, validates with zero errors and round-trips byte-identically (or with only key-order differences, documented). Maintainer decision 2026-11-16: round trips keep every value and are stable, but not byte-identical; the formatting differences are documented in `docs/conformance.md`.

**Gate G2:** conformance suite green; full branch coverage on `src/core`; `src/core` imports nothing but `yaml`.

## Phase 2 — CDS exporter → Gate G3

- [x] **2.1 Mapper registry + entity mapper.** Path from fully qualified name (`model/<ns as folders>/<Name>.md`), `type: Entity`, title, description, `resource: cds:<fqn>`, tags. Body: keys, elements with types, associations/compositions as links. Maintainer decisions 2026-11-16: an elements table plus a list of association links; tags `[cds, <kind>, <namespace>]`; description from `@description`, else the doc comment's first sentence; links in the absolute `/model/…` form.
- [x] **2.2 Service and projection mappers.** Service body lists exposed entities, actions and functions as links. Projections link to their source. Maintainer decision 2026-11-16 (revised the same day): projections are written as `type: Projection` and views as `type: View`, not as `type: Entity`, because they aren't stored entities; the service still lists them under Entities.
- [x] **2.3 Action, function, type, aspect, event mappers.** Parameters and return types; bound actions listed on their entity. Maintainer decisions 2026-11-16: a bound action gets an `### name` subsection on its entity in the same layout as an unbound action's concept; a type defined in the model is a link to its concept wherever a type is shown.
- [x] **2.4 Authorization section (ADR-0003).** Render `@restrict` and `@requires` into a section wrapped in `<!-- okf:auth:start -->` / `<!-- okf:auth:end -->` under `## Authorization`. Nothing about authorization appears outside it.
  - Test first: AdminService fixture renders the section; a grep test asserts no `@restrict` content outside the markers.
  - Maintainer decisions 2026-11-16: `@readonly`, `@insertonly` and `@Capabilities` count as authorization and go inside the section; a member of a service repeats the service's rules there, as inherited.
- [x] **2.5 i18n.** Resolve `{i18n>key}` titles and descriptions in the default language; fall back to the key name.
- [x] **2.6 Include/exclude.** `include: "services"` (default) exports only definitions reachable from services; `"all"` exports everything; `@okf: false` excludes; `@okf.tags` adds tags.
  - Maintainer decisions 2026-11-16: "reachable" means the services, their members and everything their concepts refer to (sources, association targets, element, parameter and return types), transitively. A concept never mentions a definition that isn't exported, as cap-mcp v2 and CAP do: associations and other references to it are left out, not written as names. `@okf: false` works on definitions, elements, parameters and bound actions.
  - Maintainer decisions after review: `@okf: false` follows CAP's annotation copying (an aspect's reaches the entities including it, a source's its projections; `@okf: true` opts back in); an element, parameter or return value of an excluded *type* stays, shown with its built-in type; a definition under one that isn't exported (a service member, `X.texts`) is left out. One exception to "never mention": an auth-section where-condition is shown as CAP applies it, even if it names a hidden association path (ADR-0003 strips the section for unauthenticated readers).
- [x] **2.7 Exporter.** Orchestrates mappers, generates `index.md` files, injects `{ now, version }` into `generated`.
  - Note from 2.6: pass inferred CSN as `cds.load` returns it (CSN compiled for a runtime adds foreign keys and draft tables that name hidden associations), and always pass `selectExported(model, include)` as the context's `isExported`; its default lets everything through.
  - Note from 2.5: build the text lookup with `defaultLanguageTexts(cds, model)` from the model as `cds.load` returns it (it needs `$sources`). A model compiled from a string has `$sources: ['<stdin>.cds']`, so its `_i18n` folder is looked up relative to the working directory.
  - Test first: two runs with the same inputs produce byte-identical output.
- [x] **2.8 `cds compile --to okf`.** Prints the bundle tree and, with `-o <dir>`, writes it. Maintainer decisions 2026-11-17: without `-o` it prints one path per line; the clock is `SOURCE_DATE_EPOCH` when set, else the current time.
- [x] **2.9 `cds build` task.** Writes `gen/okf` and, for staging builds with a `nodejs` task, the same files to `<nodejs dest>/okf-bundle/` (ADR-0007); runs validation; fails only on errors. In-place builds (`build.target: "."`) never touch `okf/`. Decisions (defaults, open to the maintainer): the bundle always goes to `<build target>/okf` (in place: `<root>/gen/okf`), whatever `src`, `dest` or `--dest` say; the task loads the build's default model paths without the project root itself, as the base model (no feature toggles), with doc comments (`options()` adds `docs: true`); both output folders are emptied before writing; same clock, version and `cds.okf.include` as 2.8; on validation errors `gen/okf` is still written for review, but nothing goes into the deployed app; warnings are logged after the build.
  - Test first: `cds build` of a fixture app writes `gen/okf` and `gen/srv/okf-bundle/`; an in-place build leaves `okf/` untouched.
- [x] **ADR-0004 revisit (maintainer note, 2026-11-17).** The change was ADR-0006 revision 2 (plus an amendment note for ADR-0004). Done 2026-11-17: drafted as ADR-0010 (Proposed, supersedes ADR-0006, since Accepted ADRs can't be edited), merged with the task 0.5 findings; Phase 4 tasks 4.1 and 4.4–4.8 updated below. Nothing in 2.10 changes: ADR-0010 keeps the bundle hash out of `index.md` (OKF §8 allows only `okf_version` there).
- [x] **2.10 Golden tests.** Commit `test/golden/bookshop/`; diff on every run. Fixed inputs (`now` 2026-01-01T00:00:00Z, version `0.0.0-golden`), so neither the clock nor a release changes them; `npm run test:update-golden` rewrites the whole folder; the golden bundle also validates without findings.

**Gate G3:** golden bundle matches; determinism test green; `@okf: false` and the auth section tested.

## Phase 3 — Curation and developer experience → Gate G4 → release 0.1

- [ ] **3.1 Merge.** Merge curated `okf/` with generated `model/`; a curated file under `model/` is an error with a fix hint.
- [ ] **3.2 Messages.** `[okf] <file>:<line> — <what>.` + indented fix. Errors fail the build; warnings never do.
- [ ] **3.3 `cds add okf`.** Creates `okf/index.md`, one example concept, `.gitignore` entry for `gen/okf`, a commented `cds.okf` block. Idempotent.
- [ ] **3.4 `cds watch`.** Serving under `cds watch` uses the in-memory bundle, which follows model changes because the server restarts (ADR-0007). Optional: regenerate `gen/okf` for inspection on change (debounced); no file writes outside `gen/okf`.
- [ ] **3.5 README.** Quick start, config reference, annotation reference, examples. Written for a CAP developer who has never heard of OKF.
- [ ] **3.6 Pilot harness.** `test/pilot/`: a question-set format and a script that scores a CAP agent's answers with and without the bundle. The human supplies the domain and questions.

**Gate G4:** pilot shows improvement (human judges); every message has file, line, rule and fix; README reviewed. Human cuts release 0.1.

## Phase 4 — Serving → Gate G5 → release 0.2

- [ ] **4.1 Contract suite.** `test/contract/server.contract.ts` run against every channel (static route, MCP resources, MCP tools): lists concepts, reads a concept, not-found on unknown path (and on a hidden path, alike), strips the auth section when unauthenticated, keeps it when authenticated, serves nothing when disabled. Every channel reads one merged `BundleSource`, picked at startup: the built `okf-bundle/` in a deployed app, otherwise generated in memory (ADR-0007).
  - ADR-0010 (when Accepted): `BundleSource` is keyed by `(tenant, locale)`; for 0.2 every key gives the same bundle. MCP URIs carry the namespace (`okf://<namespace>/<path>`); the tools channel is checked through `Index`, `getConcept`, `searchConcepts` and `bundleInfo`.
- [ ] **4.2 Auth filter.** `filter.ts` removes marked sections; pure, unit tested.
  - Contract from 2.4: a marker counts only as a whole line (`<!-- okf:auth:start -->` / `<!-- okf:auth:end -->` alone on a line), and a generated concept has at most one section, at the end of its body. Text elsewhere can contain marker-like text (e.g. a title), which must not cut anything.
- [ ] **4.3 Static route (Node).** `cds.okf.serve.static: false | true | "/path"`, `text/markdown; charset=utf-8`, uses CAP's auth middleware to decide authentication. Not listed on the CAP index page (ADR-0005).
- [ ] **4.4 MCP selector.** `src/serve/mcp/index.ts` reads `cds.okf.serve.mcp` (`false` | `true` | `{ plugin, as, namespace, requires, templateThreshold }`, ADR-0004, ADR-0010) and picks an `McpIntegration`.
  - Test first, a table of cases: off → nothing, no warning; on + no MCP plugin → one warning; on + one plugin → that one; on + both + `auto` → error naming `plugin`; explicit plugin not installed → error; unknown `as` value → warning naming the allowed values; namespace derived from `package.json` (`@acme/orders` → `acme-orders`); an invalid namespace, or none to derive → startup error; `templateThreshold` not a whole number ≥ 0 → startup error. Detection alone never serves anything.
- [ ] **4.5 Tools channel (both plugins).** `srv/okf-service.cds` + `src/serve/mcp/okf-service.ts` (ADR-0010 Contract B): read-only, index-first `OkfService` over the merged `BundleSource` (ADR-0007): entity `Index` (no body; `links` lists only visible targets), functions `getConcept(path)`, `searchConcepts(text, type, tag, top)` and `bundleInfo()`; ADR-0003 filter per `req.user`; `@requires` from `cds.okf.serve.mcp.requires`. `Index` evaluates the query subset of ADR-0010 in memory and rejects the rest with a clear error. Model added only when `as` includes `tools` (mechanism from ADR-0005).
  - First step: check in both plugins' source whether unbound functions become tools with their doc comments. If not, use ADR-0010's fallback (`Concepts` with `body` only on single-key reads) and record it.
  - Note from 2.6: annotate `OkfService` with `@okf: false` in its own CDS; a definition under an excluded one is left out, so its members are never exported either (ADR-0007), with a test.
  - Under `@gavdi/cap-mcp`, `@protocol: 'none'` (ADR-0006/0010); prove the tools still work, else keep the OData endpoint and document it.
  - Test first: `cds.test` on the bookshop fixture without any MCP plugin (OData read proves the service; `searchConcepts` never matches the body; hidden and unknown paths both 404), then the contract suite through each plugin (4.8).
- [ ] **4.6 `@gavdi/cap-mcp` resources.** `src/serve/mcp/gavdi-cap-mcp.ts` subscribes to `mcp:resources` at plugin load (ADR-0010 Contract A) and registers `okf://<namespace>/index.md`, then one fixed `okf://<namespace>/<path>` per concept up to `templateThreshold` (default 50), or one template `okf://<namespace>/{+path}` (with `read` and `complete`) above it when `registerTemplate` exists. `read` throws a 404 for unknown and hidden paths; `_meta` carries `okf/bundleHash`. If no event has come by `listening` (older version): one warning, and the tools channel if requested.
  - Test first: unit test with a fake `cds` emitter and registry, with and without `registerTemplate` (duck-typed, no import of the plugin); then the contract suite against a fixture app using `@gavdi/cap-mcp` once Contract A ships there.
  - Before starting: `docs/upstream/gavdi-cap-mcp/` (handoff and its ADR 0013) updated to Contract A revision 2 and agreed again with that plugin's maintainer.
  - Blocked until the `@gavdi/cap-mcp` side of Contract A is released; until then, stop and record it under **Blocked** in `docs/progress.md`.
- [ ] **4.7 `@cap-js/mcp`.** `src/serve/mcp/cap-js-mcp.ts`: tools channel only. `as: ["resources"]` gives one warning that this plugin has no resource hook (unless ADR-0010 gains a Contract C).
- [ ] **4.8 Plugin fixture apps and CI.** `test/fixtures/app-gavdi-mcp` and `test/fixtures/app-cap-js-mcp` (the two plugins do not share one app); each runs the contract suite through a real MCP client, including the ADR-0010 tools (`Index`, `getConcept`, `searchConcepts`, `bundleInfo`) and, for `@gavdi/cap-mcp`, namespaced resources below and above the template threshold; a CI job `integrations` runs both. Dev dependencies only.
- [ ] **4.9 Java.** Static serving through a small Spring controller that applies the same filter rules; MCP per ADR-0006 (`cds-adapter-mcp`). Separate PRs.
- [ ] **4.10 Config validation.** Unknown keys and wrong types under `cds.okf` (including ADR-0010's `namespace`, `requires`, `templateThreshold`) produce a warning naming the key and the allowed values. Never write settings under `cds.mcp`.

**Gate G5:** contract suite green for the static route, the tools channel under both MCP plugins, and `@gavdi/cap-mcp` resources (or 4.6 recorded as blocked upstream), on both runtimes; nothing served unless configured; auth sections never reach unauthenticated requesters.

## Phase 5 — Fiori authoring → Gate G6 → release 0.3

Do not start until ADR-0008 (source of truth: database vs Git) is **Accepted**. Tasks will be detailed in a follow-up plan revision: CDS model for concepts, `DbBundleSource`, Fiori elements List Report/Object Page with draft, review and verify flow stamping `verified.by`, export back to OKF.

**Gate G6:** a business owner edits, reviews and publishes a concept without a developer; export round-trip is lossless.
