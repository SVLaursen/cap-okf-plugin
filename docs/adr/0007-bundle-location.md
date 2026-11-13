# 0007. Where the bundle lives

- Status: Accepted (2026-11-13, Simon Vestergaard Laursen)
- Date: 2026-11-13
- Deciders: Simon Vestergaard Laursen
- Proposed by: Claude Code (plan task 0.6)

## Context

cap-okf combines two kinds of knowledge into one OKF bundle:

- **generated** concepts, from the CDS model (Phase 2);
- **curated** concepts, which people write and commit (Phase 3).

The plan's starting point (task 0.6) is:

- `okf/` for curated files;
- `gen/okf` for generated output;
- generated concepts under `model/` inside the bundle.

This ADR fixes those locations. It also covers what the plan left open: where a **running** app
reads the bundle when it serves it (Phase 4), and how bundle paths are formed.

### Findings

Checked against `@sap/cds` 10.2.2 and `@sap/cds-dk` 10.2.1, in the ADR-0005 spike app and in
`demo/`:

- **`gen/okf` is never deployed.** `cds build` gives the Node.js app its own folder (`gen/srv`),
  which is what runs in production. Nothing outside it is shipped, and the curated `okf/` folder
  isn't copied either.
- **A build plugin can find that folder through `this.context.tasks`.** It lists every resolved
  task with its `dest` (proven: `okf → <root>/gen/okf`, `nodejs → <root>/gen/srv`).
  - The list is complete only inside `build()`, because tasks are added one by one while plugins
    are created.
  - It has no documentation of its own.
  - Copying into `<nodejs dest>` with `this.copy(…).to(<absolute path>)` works.
- **Doc comments need `cdsc.docs`.** That setting is off by default, and then both `cds.load` and
  the Node.js build drop `/** … */`.
  - A deployed app's `cds.model` has descriptions only if the app turned `cdsc.docs` on (the demo
    does: `gen/srv/srv/csn.json` keeps them).
  - Turning it on for the app has a visible side effect: docs become `Core.Description` in its
    `$metadata`.
  - `gen/srv/_i18n/` always holds every language.
- **Runtime and build models differ.** The Node.js build compiles for Node.js, and as `xtended`
  when extensibility or feature toggles are on. A model the okf task loads itself can differ from
  `cds.model` at runtime.
- **In-place builds (`build.target: "."`, Java projects):**
  - CAP's base `init()` appends `gen`, so a `src: "."` task writes to `<root>/gen`, not the root.
  - Base `clean()` deletes `task.dest` (`rm -rf`) in in-place mode. So a task whose `dest` ever
    resolved to `<root>/okf` would **delete the curated folder**.
  - The Node.js task's own output moves to `<root>/srv/gen`.

## Options considered

### Where a running app gets the bundle

1. **Generate in memory at startup, everywhere**, from `cds.model` plus the curated folder. The
   build copies the curated folder into the deployed app.
   - Pro: one code path.
   - Pro: never stale.
   - Pro: a later per-tenant bundle could use `cds.context.model`.
   - Con: production serves something nobody reviewed, built from different inputs than
     `gen/okf`.
   - Con: descriptions disappear unless the app turns on `cdsc.docs`, with its `$metadata` side
     effect.
   - Con: `generated.at` changes on every restart, and two instances serve different bytes.
2. **Serve the build output in production; generate in memory in development.**
   - The build writes the merged bundle to `gen/okf` and puts the same files into the deployed
     app.
   - Production reads them as files. Development (`cds watch`, `cds serve`, `cds.test`) has no
     build, so it generates in memory with the same exporter.
   - Pro: what production serves is exactly what the build validated and what reviewers saw.
   - Pro: `generated.at` is the build time.
   - Pro: the exporter loads the model with doc comments itself, whatever the app's `cdsc.docs`.
   - Con: two ways to get a bundle; a parity test keeps them equal.
   - Con: depends on `this.context.tasks`.
3. **Serve only build output**, in development too. Development would need a `cds build` or the
   task 3.4 watcher before every change shows up; stale output is the normal state.

### Where curated files live

1. **`okf/` at the project root** (the plan's starting point). Visible, next to `db/`, `srv/` and
   `app/`, and clearly not CDS source.
2. **`srv/okf/`.** The Node.js staging build already copies native `srv/` content into
   `gen/srv`, so curated files would ship without any help from cap-okf.
   - With option 2 above, the build ships the merged bundle anyway, so that advantage disappears.
   - It mixes knowledge into the service sources.
3. **`app/okf/`.** `app/` is for UIs, and CAP serves it statically in development. Curated files
   would then be readable without the ADR-0003 filter.

## Decision

### Where things go

| What | Where | Committed |
| --- | --- | --- |
| Curated concepts | `okf/` at the project root | yes |
| Built bundle, for review and CI | `gen/okf` | no (`gen/` is ignored) |
| Built bundle, deployed | `<nodejs dest>/okf-bundle/` (`gen/srv/okf-bundle/`) | no |

- **Production serves the built bundle (option 2).** At startup, if `<app root>/okf-bundle/`
  exists, the server reads it through a `FileBundleSource`. A deployed app has it; a project root
  doesn't.
- **Development generates in memory.** Without `okf-bundle/`, the server generates the bundle from
  the app's model plus `<app root>/okf`. It loads the model sources with doc comments itself (as
  cap-mcp-v2 does for its doc-comment check), with the same options the build task uses.
  - If this happens with `NODE_ENV=production`, the server logs one warning ("no built bundle;
    generated at startup"), because the deployed app was built without the okf task (see ADR-0005
    (b)).
- **The bundle is only built at startup when a serving channel is on** (ADR-0002). It is built
  before `served` completes, because the MCP resources channel (task 4.6) registers one resource
  per concept at that point.
- **The build task (2.9):**
  - writes `gen/okf`;
  - inside `build()`, copies the same files to `<nodejs dest>/okf-bundle/`, only for staging
    builds (`build.target` is not `.`) and only when a `nodejs` task exists;
  - in in-place builds, keeps CAP's base `init()` (`<root>/gen`) and adds `okf`, giving
    `<root>/gen/okf`. It never computes a path that could resolve to `<root>/okf`.
- **Generation and the build see the same model.** The exporter always gets the model flavour and
  options the build uses (inferred, with doc comments). Development may differ only in
  `generated.at`.
- **Same failures everywhere.** The build fails on validation errors (task 3.2). In development, a
  curated file with errors is left out and reported once as `[okf] <file>:<line> — …`. The other
  concepts are still served; startup never crashes over curated content.
- No new config keys now. A `cds.okf.folder` setting can be added later through its own ADR if
  apps need a different curated folder.

### What the bundle contains

- **Generated concepts live under `model/`.** A definition's fully qualified name maps to a path:
  namespace and service segments become folders, and the last segment becomes the file. For
  example:
  - `demo.bookshop.Books` → `model/demo/bookshop/Books.md`
  - `CatalogService.Books` → `model/CatalogService/Books.md`
  - `CatalogService` → `model/CatalogService.md`
- **cap-okf's own definitions are never exported.** That covers `OkfService` when the tools
  channel adds it (ADR-0005 (e)).
- **Curated concepts keep their path relative to `okf/`.** For example,
  `okf/guides/ordering.md` → `guides/ordering.md`.
- **`model/` belongs to the generator.** A curated file at `okf/model/…` is an error with a fix
  hint (task 3.1).
- **Curated files that are bundled:** only regular files under `okf/`.
  - Symlinks are not followed, and dotfiles are skipped.
  - `.md` files are concepts or reserved files.
  - Other files (for example `references/*.py`, spec §6.3) are copied as they are and never
    parsed.
  - `FileBundleSource.read` rejects `..`, absolute paths, and any path not in `list()`.

### Path rules

- **Allowed characters:** a path segment keeps `A–Z a–z 0–9 . _ -`. Any other character, `%`
  included, is percent-encoded (UTF-8). So `a:b` → `a%3Ab`, and `a%b` → `a%25b`.
- **Reserved names:** the following get a trailing `_` (`index_.md`, `Con_.md`):
  - names that are `index` or `log` in any case (OKF's reserved files, spec §3.1);
  - Windows device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`);
  - names ending in a dot.
- **Collisions:** the validator reports any two generated paths that are equal or differ only in
  letter case, for example `index` and `index_`, or `Books` and `books`. Paths are never silently
  renamed beyond the rules above.
- **Links and URIs:**
  - Markdown links (spec §6.1) and `okf://<path>` URIs (ADR-0006) encode the path once more, as a
    URI path. A file named `a%3Ab.md` is linked as `a%253Ab.md`, and a space is `%20`.
  - Consumers decode once to get the file name.
- **Index files:**
  - The generator writes an `index.md` in `model/` and in each folder below it (task 1.5).
  - The bundle-root `index.md` is the curated `okf/index.md` if there is one. A warning is given if
    it doesn't link to `model/`.
  - Otherwise the generator writes a root `index.md` with `okf_version: "0.2"` (spec §8, §12),
    listing `model/` and the top-level curated folders.
- **`log.md`** is never generated. Curated `log.md` files are kept as they are.

## Consequences

- **Plan changes** (made in `docs/PLAN.md` on acceptance, 2026-11-13):
  - **2.9:** "Writes `gen/okf`" becomes "writes `gen/okf` and `<nodejs dest>/okf-bundle/`
    (staging builds only); in-place builds never touch `okf/`".
  - **3.4:** `cds watch` serves the in-memory bundle, which follows model changes because the
    server restarts. Regenerating `gen/okf` on change becomes optional.
  - **Target layout:** add the in-memory source and the merge to `lib/bundle/` (e.g.
    `lib/bundle/model-source.js`, next to `merge.js`).
  - **4.1, 4.5, 4.6:** "over `BundleSource`" means one merged source, picked at startup: built
    files or in-memory.
- **Tests:**
  - **Parity:** for the bookshop fixture, the in-memory bundle equals `gen/okf` byte for byte,
    apart from `generated.at`.
  - **Build (2.9):** an integration test runs `cds build` and checks `gen/srv/okf-bundle/`.
  - **In-place build (2.9):** a build with `build.target: "."` leaves `okf/` untouched.
- **ADR-0003:** a deployed app now has generated auth sections on disk in `okf-bundle/`, as
  `gen/okf` does. Servers filter them per request. The README must say that `gen/srv` contains
  them.
- **Doc comments:** apps don't need `cdsc.docs` for OKF. Their `$metadata` stays as it is.
- **Fragile point:** `this.context.tasks` has no documentation; the build test above guards it.
- **Multitenancy:** a per-tenant bundle (tenant extensions) would need in-memory generation in
  production too. That stays an open question and would supersede part of this ADR.
- **Java (task 4.9)** decides its own deployed location, probably `srv/src/main/resources/`. This
  ADR doesn't.
- **Later, for task 4.3:** bundle-absolute links (`/model/…`) in curated files point to the host
  root when a browser views them under `/okf`. The static route must rewrite them or serve with a
  base.
