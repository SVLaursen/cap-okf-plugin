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

- CAP finds plugins among the app's `dependencies`, plus `devDependencies` outside production, by resolving `<pkg>/cds-plugin`. It also looks in `@sap/cds`'s own dependencies and in the `CDS_PLUGINS` environment variable. It never loads the project's own `cds-plugin.js`.
- The `cds` section of the plugin's `package.json` is merged into `cds.env` before the app's own config. So the plugin can ship defaults, and app profiles still win.
- `cds-plugin.js` runs after `cds.env` is built, so `cds.env.okf` already reflects the active profiles there.
- `cds compile` and `cds build` both `await cds.plugins` before they do any work. `cds build` then rebuilds the environment (`cds.env = cds.env.for(...)`, `@sap/cds-dk/bin/build.js`), which throws away any changes a plugin made to `cds.env` at load time.

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
- Without a `suffix`, CAP's writer appends `.<target>`, so every file would end in `.okf`. The writer merges each file's options into one shared object, so a suffix given once carries over to later files. Setting it on every file is still the safe, explicit choice.

### (b) Build task: proven, with one condition

```js
cds.build?.register?.('okf', class extends cds.build.Plugin {
  static taskDefaults = { src: '.' }
  init()  { this.task.dest = /* bundle location, ADR-0007 */ }
  async build() { const csn = await this.model(); /* … */ await this.write(text).to(file) }
})
```

- `cds.build` and `cds.add` exist only while the `build`, `deploy` or `push` commands (for `cds.build`) or the `add`, `init` or `help` commands (for `cds.add`) run (`@sap/cds-dk/lib/index.js`). Under Jest they are `undefined` even with cds-dk installed. So access them with `?.` in `cds-plugin.js`; tests require `@sap/cds-dk/lib/build` and `@sap/cds-dk/lib/init/add` directly.
- **Condition.** CAP only asks `hasTask()` (default `true`) when the app has **no** `cds.build.tasks`. An app that lists its own tasks gets the okf task only if it lists `{ "for": "okf" }` itself. Proven:
  - no task list: bundle built;
  - `[nodejs, okf]`: bundle built;
  - `[nodejs]`: no bundle.

  ADR-0002 says the bundle is always generated, so the `cds add okf` facet (task 3.3) must add `{ "for": "okf" }` to an existing `build.tasks` list, and the README must say so.

### (c) `cds add` facet: proven

`cds.add?.register?.('okf', class extends cds.add.Plugin { async run() {…} })`. `cds add okf` calls `run()` with `cds.root` set to the app. `combine()` isn't needed: nothing in the facet depends on other facets.

### (d) Express route at bootstrap: proven for mocked auth

```js
cds.on('bootstrap', app => {
  app.use('/okf', cds.middlewares.before, handler)   // handler reads cds.context.user
})
```

- `cds.middlewares.before` (context, trace, auth, ctx_model) is CAP's own chain. It sets `cds.context.user` without rejecting anonymous requests.
- With mocked auth, an anonymous request gave an anonymous user, and basic auth as `alice` gave an authenticated one.
- The ADR-0003 filter decides with the public `user.is('authenticated-user')`, not internal flags.
- **Listing on the index page.** The generated `/` page lists `app._app_links`, which is internal (leading underscore). The only public way to fill it is `app.serve(path).from(pkg, folder)`, and that only serves a static folder. Pushing onto `app._app_links` was proven to work.

### (e) Conditional `OkfService` model

A `cds.requires` entry that has only a `model` adds that model to `cds.resolve('*')`. `@capire/common` uses this pattern, and the key isn't a service name, so nothing is mocked. Four ways to make it conditional:

1. **Static entry in our `package.json`.** Simple and survives every CLI command. But the service would always exist, which ADR-0004/0006 rule out.
2. **Profile-scoped static entry**, e.g. `"[okf-tools]": { "requires": … }`. Conditional, but switched on by a profile name instead of `cds.okf.serve.mcp`, which breaks ADR-0004's config shape.
3. **`cds add okf` writes the entry**, or a `using from 'cap-okf/srv/okf-service'`, into the app's own model or config. Robust across all commands and task lists. But it is a second switch next to `cds.okf.serve.mcp` that can disagree with it, and turning tools off would need a file edit, not a profile. That again breaks ADR-0004's single-config shape.
4. **Set the entry from code whenever the tools channel is on**: `cds.env.requires['cap-okf/tools'] = { model: … }`. One function, `addToolsModel()`, is called from three places so every command sees it:
   - **at plugin load:** covers `cds serve`, `cds watch`, `cds.test` and `cds compile '*'`;
   - **in the build plugin's `static hasTask()`:** covers `cds build` without a task list, which calls `hasTask()` after rebuilding `cds.env` and before working out each task's model paths;
   - **in the build plugin's constructor:** covers `cds build` with a task list that includes `okf`. CAP constructs each listed plugin (`new PluginClass().requires`) before working out model paths.

   Proven with the tools channel on:
   - With no task list, and with `[nodejs, okf]`, `gen/srv/srv/csn.json` contains `OkfService`, and a production server built from it answers `/okf-service/$metadata` (HTTP 200).
   - With the setting off, the service is absent everywhere (HTTP 404).

   **Limitation:** with a task list that leaves out `okf`, the model is missing from the build. This is the same condition as in (b), and the same `cds add` step fixes both. As a safety net, the plugin warns at `served` when the tools channel is on but `OkfService` is not in the model.

## Decision (proposed)

- (a)–(d) as shown above.
- (b) `cds add okf` adds `{ "for": "okf" }` to an app's existing `build.tasks`.
- (d) Show the static route on the index page through `app._app_links`. The code must tolerate the property being missing, and losing the link must not fail serving.
- (e) Option 4, with the warning at `served`.
- Defaults (`okf.serve.static: false`, `okf.serve.mcp: false`) are shipped in the `cds` section of our `package.json`.

## Consequences

- Each extension point is a few lines in `cds-plugin.js` that hand over to modules in `lib/`, matching the target layout in `docs/PLAN.md`.
- **Fragile points**, each to be guarded by an integration test in the task that uses it:
  - (e) relies on the order in which `cds build` calls things. That order is observed, not documented. Task 4.5 needs `cds build` tests with the tools channel on, for no task list, `[nodejs, okf]` and `[nodejs]` (where it expects the warning), checking `gen/srv/srv/csn.json`.
  - (d) The index-page link uses an internal property. Worth asking CAP for a public API.
- **Not yet checked; for the tasks named:**
  - **Real authentication (`jwt`, `ias`, `xsuaa`), task 4.3.** "Anonymous gets an anonymous user, not a 401" was proven for mocked auth only.
  - **The `OkfService` READ handler in a production build, task 4.5.** The spike only declared the service and read `$metadata`. How the handler over `BundleSource` is attached when serving from `gen/srv` (an implementation file next to the `.cds`, `@impl`, or a `cds.on('serving')` handler) is still to be shown.
  - **The model path, task 4.5.** The spike used an absolute path. The package path `cap-okf/srv/okf-service` needs an installed package and is not proven.
  - **`mcp: true`, task 4.5.** Under ADR-0004 this means auto-detection, which picks `tools` for `@cap-js/mcp`. So `addToolsModel()` must run the same detection as `lib/serve/mcp/index.js` (task 4.4), not just look for `as: ['tools']`. The spike only tested an explicit `{ "as": ["tools"] }`.
- **Developing in this repo:** CAP doesn't load a project's own `cds-plugin.js`. The `cds compile test/fixtures/bookshop --to okf` command in `CLAUDE.md` and in `ci.yml` only works if cap-okf is loaded explicitly, e.g. `CDS_PLUGINS="{\"cap-okf\":{\"impl\":\"$PWD/cds-plugin.js\"}}" npx cds compile …`, wrapped in an npm script. Unit and integration tests can simply `require('../../cds-plugin.js')`. Task 2.8 should add the npm script and update both places, which a human edits.
