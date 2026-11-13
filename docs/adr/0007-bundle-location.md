# 0007. Where the bundle lives

- Status: Proposed
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

This ADR fixes those three locations. It also covers what the plan left open: where a **deployed**
app reads the bundle when it serves it (Phase 4), and how bundle paths are formed.

Checked against `@sap/cds` 10.2.2 and `@sap/cds-dk` 10.2.1, in the ADR-0005 spike app and in
`demo/`:

- **`gen/okf` is never deployed.** `cds build` gives the Node.js app its own folder (`gen/srv`),
  which is what runs in production. Nothing outside it is shipped, and the curated `okf/` folder
  is not copied there either.
- **A build plugin can find that folder.** `this.context.tasks` lists every resolved task with its
  `dest` (proven: `okf → <root>/gen/okf`, `nodejs → <root>/gen/srv`). Copying the curated `okf/`
  to `<nodejs dest>/okf` worked. `this.context` has no documentation of its own, so it gets the
  same guard as ADR-0005's fragile points.
- **The deployed app can rebuild the bundle.** `gen/srv/srv/csn.json` keeps doc comments when
  `cdsc.docs` is on, and `gen/srv/_i18n/` holds every language (checked in `demo/`).
- **In-place builds point at the project root.** Java projects set `build.target` to `.`. A task
  with `src: "."` then gets the project root as its default `dest`, so `<target>/okf` would be the
  curated `okf/` folder itself.

## Options considered

### Where a running app gets the bundle

1. **Read the build output.** The build writes the merged bundle into the deployed app folder as
   well (e.g. `gen/srv/okf-bundle/`), and the server reads it from there.
   - Pro: what is served is exactly what the build validated.
   - Con: in development there is no deployed folder, so the server must read `gen/okf`. That is
     missing or stale until someone runs `cds build` or task 3.4's watcher.
   - Con: two runtime paths (development and production) and a second copy of the bundle.
2. **Generate in memory at startup.** The server builds the bundle from the model it serves
   (`cds.model`) plus the curated folder `okf/` next to it. The build copies the curated `okf/`
   into the deployed app.
   - Pro: one code path for `cds watch`, `cds serve` and production.
   - Pro: never stale; `cds watch` restarts on model changes anyway.
   - Pro: a later per-tenant bundle can use the tenant's extended model (`cds.context.model`),
     which is the open "multitenant bundles" question in `HANDOVER.md`.
   - Con: a little startup work. Generation is a pure transform, so it can also run lazily on the
     first request.
   - Con: `generated.at` in served concepts is the time the server generated them, not the build
     time.
3. **Both:** option 2 at runtime, plus the build output from option 1 for review only.
   - The build still writes `gen/okf`, so CI and reviewers can inspect and validate it. The server
     never reads `gen/okf`.

### Where curated files live

1. **`okf/` at the project root** (the plan's starting point). Visible, short, next to `db/`, `srv/`
   and `app/`.
2. Under `srv/okf/` or `app/okf/`. These folders already mean something to CAP: `srv/` is copied by
   some build tasks, and `app/` is for UIs. Mixing knowledge in there is confusing.

## Decision (proposed)

### Folders

| What | Where | Committed |
| --- | --- | --- |
| Curated concepts | `okf/` at the project root | yes |
| Build output (merged bundle, for review and CI) | `<build target>/okf`, i.e. `gen/okf` | no (`gen/` is ignored) |
| Curated concepts in the deployed app | `<nodejs task dest>/okf`, i.e. `gen/srv/okf` | no |

- The served bundle is generated in memory at startup (option 3). The server reads the curated
  files from `<app root>/okf`. That is the project root in development and `gen/srv` in a deployed
  app, so it is the same rule everywhere.
- The build plugin writes `gen/okf` and copies the curated `okf/` to the `nodejs` task's `dest`. If
  there is no `nodejs` task (Java, task 4.9), nothing is copied, and Java's serving decides its own
  location then.
- **The build output never lands in `okf/`.** The okf build task sets its `dest` to
  `<cds.root>/<build.target>/okf`. When `build.target` resolves to the project root, it uses
  `<cds.root>/gen/okf` instead.
- No new config keys now. A `cds.okf.folder` setting can be added later through its own ADR if
  apps need a different curated folder.

### Paths inside the bundle

- **Generated concepts live under `model/`.** A definition's fully qualified name maps to a path:
  namespace and service segments become folders, and the last segment becomes the file. For
  example:
  - `demo.bookshop.Books` → `model/demo/bookshop/Books.md`
  - `CatalogService.Books` → `model/CatalogService/Books.md`
  - `CatalogService` → `model/CatalogService.md`
- **Curated concepts keep their path relative to `okf/`.** For example,
  `okf/guides/ordering.md` → `guides/ordering.md`.
- **`model/` belongs to the generator.** A curated file at `okf/model/…` is an error with a fix
  hint (task 3.1).
- **Reserved names:** a definition whose last segment is `index` or `log` (any case) would collide
  with OKF's reserved files (spec §3.1). It gets a trailing underscore (`index_.md`, `log_.md`).
- **Unsafe characters:** characters a file name cannot hold portably (`/ \ : * ? " < > |`, control
  characters) are percent-encoded. CDS identifiers rarely contain them, but quoted
  identifiers (`![…]`) can.
- **Case:** two generated paths that differ only in letter case would overwrite each other on
  macOS and Windows. The validator reports this as an error.
- **Index files:**
  - The generator writes an `index.md` in `model/` and in each folder below it (task 1.5).
  - The bundle-root `index.md` is the curated `okf/index.md` if there is one. Otherwise the
    generator writes one that lists `model/` and the top-level curated folders.
- **`log.md`** is never generated. Curated `log.md` files are kept as they are.

## Consequences

- Task 2.9 (build task) writes `gen/okf`, copies the curated `okf/` into the `nodejs` `dest`, and
  guards against in-place targets.
- Task 3.4 (`cds watch`) shrinks to regenerating `gen/okf` for inspection. Serving already follows
  model changes, because `cds watch` restarts the server.
- Task 4.x servers read through a `BundleSource` that generates in memory from `cds.model` plus a
  `FileBundleSource` over `<app root>/okf`. No server reads `gen/okf`.
- `generated.at` for served concepts is set when the server generates them, through the injected
  clock (`{ now }`). Build output stays byte-identical for the same `now`.
- The README must say:
  - `okf/` is committed;
  - `gen/okf` is a review artifact, not a deployment input;
  - deployed apps carry their curated files in `gen/srv/okf`.
- Fragile point: finding the `nodejs` task through `this.context.tasks`, which has no
  documentation. Task 2.9 needs an integration test that runs `cds build` and checks
  `gen/srv/okf`.
- Java (task 4.9) needs its own answer for where curated files go in the deployed jar, probably
  `srv/src/main/resources/okf`. This ADR doesn't decide that.
