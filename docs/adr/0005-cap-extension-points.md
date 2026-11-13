# 0005. CAP extension points used by cap-okf

- Status: Proposed
- Date: 2026-11-13
- Deciders: Simon Vestergaard Laursen
- Proposed by: Claude Code (plan task 0.4)

## Context

cap-okf hooks into CAP in five places (plan task 0.4):

- (a) a `cds compile --to okf` target (task 2.8);
- (b) a `cds build` task (task 2.9);
- (c) a `cds add okf` facet (task 3.3);
- (d) an Express route at bootstrap (task 4.3);
- (e) a CDS model, `OkfService`, that exists only when the tools channel is on (task 4.5, ADR-0006 Contract B).

All five come from `cds-plugin.js`.

**How this was checked.** Each point was looked up in the CAP docs (cds-mcp) and in the source of `@sap/cds` 10.2.2 and `@sap/cds-dk` 10.2.1. It was then proven in a throwaway app: the bookshop fixture, with a spike plugin loaded through `CDS_PLUGINS`. "Proven" below means it ran and the output was checked.

### How CAP loads a plugin (`@sap/cds/lib/plugins.js`, `lib/env/cds-env.js`)

- CAP finds plugins only among the app's `dependencies`, plus `devDependencies` outside production, by resolving `<pkg>/cds-plugin`. It never loads the project's own `cds-plugin.js`.
- The `cds` section of the plugin's `package.json` is merged into `cds.env` before the app's own config. So the plugin can ship defaults, and app profiles still win.
- `cds-plugin.js` runs after `cds.env` is built, so `cds.env.okf` already reflects the active profiles there.
- `cds compile` and `cds build` both `await cds.plugins` before they do any work.

## Findings and options

### (a) Compile target: proven

```js
cds.compile.to.okf = (csn, options) => function* () {
  yield [markdown, { file: 'model/sample/bookshop/Books', suffix: '.md' }]
}()
```

- `cds compile` checks that `cds.compile.to[<name>]` exists once plugins are loaded.
- A generator of `[content, { file, suffix }]` produces many files.
- `-o <dir>` writes them, creating nested folders. Without `-o`, each file is printed under a `----- <file> -----` header.
- `suffix` must be set on every file; otherwise CAP's writer appends `.okf` to each name.

### (b) Build task: proven

```js
cds.build?.register?.('okf', class extends cds.build.Plugin {
  static taskDefaults = { src: '.' }
  init()  { this.task.dest = /* bundle location, ADR-0007 */ }
  async build() { const csn = await this.model(); /* … */ await this.write(text).to(file) }
})
```

- `cds.build` exists only when `@sap/cds-dk` is present, so access it with `?.`.
- `hasTask()` returns `true` by default, so every `cds build` runs the task. That matches ADR-0002: the bundle is always generated.

### (c) `cds add` facet: proven

`cds.add?.register?.('okf', class extends cds.add.Plugin { async run() {…} })`. `cds add okf` calls `run()` with `cds.root` set to the app. `combine()` isn't needed: nothing in the facet depends on other facets.

### (d) Express route at bootstrap: proven

```js
cds.on('bootstrap', app => {
  app.use('/okf', cds.middlewares.before, handler)   // handler reads cds.context.user
})
```

- `cds.middlewares.before` (context, trace, auth, ctx_model) is CAP's own chain. It sets `cds.context.user` without rejecting anonymous requests.
- With mocked auth, an anonymous request gave `user.id === 'anonymous'` and `_is_anonymous === true`. Basic auth as `alice` gave an authenticated user.
- So the ADR-0003 filter can decide "authenticated" without its own authentication code.
- **Listing on the index page.** The generated `/` page lists `app._app_links`, which is internal (leading underscore). The only public way to fill it is `app.serve(path).from(pkg, folder)`, and that only serves a static folder. Pushing onto `app._app_links` was proven to work.

### (e) Conditional `OkfService` model: proven, with one caveat

A `cds.requires` entry that has only a `model` adds that model to `cds.resolve('*')`. `@capire/common` uses this pattern, and the key isn't a service name, so nothing is mocked. Three ways to make it conditional:

1. **Static entry in our `package.json`.** Simple and survives every CLI command. But the service would always exist, which ADR-0004/0006 rule out.
2. **Profile-scoped static entry**, e.g. `"[okf-tools]": { "requires": … }`. Conditional, but switched on by a profile name instead of `cds.okf.serve.mcp`, which breaks ADR-0004's config shape.
3. **Set the entry from code when `cds.okf.serve.mcp` asks for `tools`** (`cds.env.requires['cap-okf/tools'] = { model: 'cap-okf/srv/okf-service' }`). This must happen in two places:
   - at plugin load, which covers `cds serve`, `cds watch`, `cds.test` and `cds compile '*'`;
   - again in the build plugin's `static hasTask()`. `cds build` rebuilds `cds.env` after plugins load, which drops the first change, and it calls `hasTask()` after that rebuild but before it works out each task's model paths.

   Proven:
   - With the setting on, `gen/srv/srv/csn.json` contains `OkfService`, and a production server built from it serves `/okf-service` (HTTP 200).
   - With it off, the service is absent everywhere (HTTP 404).
   - Without the `hasTask()` step, the production build left it out.

## Decision (proposed)

- (a)–(d) as shown above.
- (d) Show the static route on the index page through `app._app_links`. The code must tolerate the property being missing, and losing the link must not fail serving.
- (e) Option 3. One small function, `addToolsModel()`, is called from both places. The model path is the package path `cap-okf/srv/okf-service`, not an absolute file path.
- Defaults (`okf.serve.static: false`, `okf.serve.mcp: false`) are shipped in the `cds` section of our `package.json`.

## Consequences

- Each extension point is a few lines in `cds-plugin.js` that hand over to modules in `lib/`, matching the target layout in `docs/PLAN.md`.
- **Fragile points**, each to be guarded by an integration test in the task that uses it:
  - (e) relies on the order in which `cds build` calls things. That order is observed, not documented. If a CAP release changes it, `OkfService` silently goes missing from production builds. Task 4.5 needs a test that runs `cds build` with the tools channel on and checks `gen/srv/srv/csn.json`.
  - (d) The index-page link uses an internal property. Worth asking CAP for a public API.
- **Not yet checked:** real authentication (`jwt`, `ias`, `xsuaa`). The claim that `cds.middlewares.before` lets anonymous requests through was proven for mocked auth only. Task 4.3 must check that the configured auth kind gives anonymous requests an anonymous user, not a 401.
- **Developing in this repo:** CAP doesn't load a project's own `cds-plugin.js`. The `cds compile test/fixtures/bookshop --to okf` command in `CLAUDE.md` and in `ci.yml` only works if cap-okf is loaded explicitly, e.g. `CDS_PLUGINS="{\"cap-okf\":{\"impl\":\"$PWD/cds-plugin.js\"}}" npx cds compile …`, wrapped in an npm script. Unit and integration tests can simply `require('../../cds-plugin.js')`. Task 2.8 should add the npm script and update both places, which a human edits.
