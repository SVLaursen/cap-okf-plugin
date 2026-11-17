# cap-okf

A CAP plugin that turns your CDS model, plus any notes you write yourself, into one
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
(OKF) bundle: a folder of Markdown files that people and AI agents can read to understand your
app.

> **Status:** pre-release, not yet on npm. Release 0.1 covers generating the bundle (`cds build`,
> `cds compile`, `cds add okf`). For serving it from a running app, the static route
> ([Serving the bundle](#serving-the-bundle)) and MCP tools through
> [`@gavdi/cap-mcp`](https://github.com/gavdilabs/cap-mcp-plugin) ([Serving over MCP](#serving-over-mcp))
> are in place; MCP resources, and [`@cap-js/mcp`](https://cap.cloud.sap/docs/guides/protocols/mcp)
> (parked), are planned. Targets OKF v0.2. Roadmap: [`docs/PLAN.md`](docs/PLAN.md).

## What is OKF?

OKF is a simple, open format for "knowledge as files". A bundle is a folder of Markdown files.
Each file describes one thing, a *concept*, and starts with a small YAML block (*frontmatter*)
that says what kind of thing it is:

```markdown
---
type: Entity
title: Books
description: Books that the shop sells, with stock and authors
---

# Books
…
```

Only `type` is required. Every folder can have an `index.md` that lists what is in it, so a
reader (or an agent) can look at the index first and open only the concepts it needs.

For a CAP app, cap-okf writes one concept per service, entity, projection, view, action,
function, type, aspect and event, with their elements, associations, parameters and access
rules. You add what the model can't say, such as how ordering works or why a rule exists, as
Markdown files in `okf/`.

## Quick start

In your CAP project (until cap-okf is on npm, install it from a local clone instead:
`npm add -D <path to cap-okf>`):

```sh
npm add -D cap-okf
cds add okf      # creates okf/ with an index and an example, the cds.okf settings, and a .gitignore entry
cds build        # writes the bundle to gen/okf
```

Open `gen/okf/index.md` and follow the links. That's the bundle.

To look at the bundle without a full build:

```sh
cds compile srv --to okf              # prints the bundle's file paths, one per line
cds compile srv --to okf -o preview   # writes the bundle to preview/
```

`cds compile --help` doesn't list `okf` as a target; it works anyway once cap-okf is installed.

## What the bundle contains

```text
gen/okf/
├── index.md                    # the bundle's front page: okf/index.md, or a generated one
├── guides/                     # your files from okf/, at the same paths
│   ├── index.md
│   └── getting-started.md
└── model/                      # generated from the CDS model; never edit by hand
    ├── index.md
    ├── CatalogService.md
    ├── CatalogService/
    │   ├── index.md
    │   └── Books.md
    └── sample/bookshop/
        ├── index.md
        └── Books.md
```

- **Paths follow the fully qualified name.** `sample.bookshop.Books` becomes
  `model/sample/bookshop/Books.md`, and `CatalogService.Books` becomes
  `model/CatalogService/Books.md`.
- **Concept types:** `Service`, `Entity`, `Projection`, `View`, `Action`, `Function`, `Type`,
  `Aspect` and `Event`.
- **Frontmatter:** each generated concept has `type`, `title`, `description`, `resource`
  (`cds:<name>`), `tags` (`cds`, the kind, the parent name — the namespace, or the service for a
  service member — plus your `@okf.tags`) and `generated`
  (`by: cap-okf/<version>`, `at: <time of the build>`).
- **Body:** elements with their types and notes, associations and compositions as links,
  actions and functions with parameters and return types, and an authorization section (see
  below).
- **Links** between concepts are absolute within the bundle, e.g. `/model/User.md`, so they work
  from any folder.

By default only your **services and what they use** are exported: the services, the entities
they expose, the entities those are built on, and the types and association targets they use.
An aspect is exported when an element uses it as a type or a composition target; aspects mixed
in with `:` (such as `cuid` or `managed`) aren't, and their elements appear on the entity.
Definitions nothing reaches are left out. Set `cds.okf.include` to `"all"` to export everything
(see [Configuration](#configuration)).

## Writing curated knowledge in `okf/`

Everything in `okf/` at your project root goes into the bundle at the same path:
`okf/guides/ordering.md` becomes `guides/ordering.md`.

A concept is a Markdown file with frontmatter. Only `type` is required; `title` and
`description` are recommended, because indexes and agents show them:

```markdown
---
type: Guide
title: Placing an order
description: How a shopper orders a book, and what the shop checks first.
tags: [ordering]
---

# Placing an order

Shoppers browse [Books](/model/CatalogService/Books.md) first. …
```

Rules:

- **`model/` belongs to the generator.** A file in `okf/model/` is an error (L1) and is left
  out. Link to generated concepts instead.
- **Your `okf/index.md` is the bundle's front page.** Link to `model/index.md` from it, or you
  get a warning (L2). Without `okf/index.md`, cap-okf writes one that lists your folders and
  `model/`.
- **Folders get an index.** A folder in `okf/` with concepts but no `index.md` of its own gets a
  generated one. If you write a folder's `index.md` yourself, give it no frontmatter (only the
  bundle's root `index.md` may have it, for `okf_version`) and list entries under headings as
  `* [Title](path) - description` (OKF §8); otherwise the build fails (R3).
- **`index.md` and `log.md` are reserved names** (OKF §3.1), in lower case only: `INDEX.md` or
  `Log.md` is an error (L1).
- **No two paths may differ only in letter case or accents** (`Guides/` and `guides/`): macOS
  and Windows treat them as one. That's an error too (L1).
- **Other files** (a `.sql` query, a `.py` script, an image) are copied as they are. `cds compile
  -o` writes only text files and tells you which it left out; `cds build` copies everything.
- **Not bundled:** dotfiles, and anything reached through a symbolic link.

## Annotation reference

cap-okf reads what your model already has, and adds two annotations of its own.

| In your CDS | Becomes |
| --- | --- |
| `/** Doc comment. More text. */` | The concept's body text. Its first sentence is the description when there is no `@description`. |
| `@title: 'Books'` | The concept's `title` (default: the definition's short name). `@Common.Label` isn't read yet. |
| `@description: 'Books that …'` | The concept's `description`. |
| `@title: '{i18n>Books}'` | Resolved as CAP does, from the `_i18n/` or `i18n/` folders next to your model, in `cds.i18n.default_language` (e.g. `i18n_en.properties`), falling back to `i18n.properties`. |
| `@okf: false` | Leaves the definition, element, parameter or bound action out of the bundle. |
| `@okf.tags: ['sales', 'core']` | Adds tags to the concept (a single tag can be a string). |
| `@restrict`, `@requires`, `@readonly`, `@insertonly`, `@Capabilities` | The concept's authorization section. |

About `@okf: false`:

- On a definition, it leaves the definition and everything inside it out, and no other concept
  mentions it: associations to it are left out, and so are projections' references to it.
- CAP copies annotations from aspects, types and projection sources, and so does
  `@okf: false`. Excluding a type doesn't hide the elements that use it: they stay, shown with
  their built-in type, because they exist on the wire.
- An authorization rule that mentions an excluded definition still shows it as CAP applies it.

Projections and views without their own description or doc comment take their source's. CAP
copies `@description` from the source onto the projection, and `@description` wins over a doc
comment, so a projection's own doc comment doesn't replace its source's `@description`: set
`@description` on the projection to change it.

```cds
namespace sample.bookshop;

/** A book that the shop can sell. */
@description: 'Books that the shop sells, with stock and authors'
@okf.tags: ['catalog']
entity Books {
  key ID     : UUID;
  title      : String(150);
  /** Internal purchasing notes. */
  buyerNotes : String @okf: false;
}
```

## Configuration

Settings live under `cds.okf`, in `package.json` or `.cdsrc.json`, and follow CAP's profiles
(`[development]`, `[production]`) and environment variables (e.g. `CDS_OKF_INCLUDE=all`).
`cds add okf` writes them with their default values, but only when no CAP config file sets
`okf` yet (in any profile), so it never overrides your settings:

```json
"cds": {
  "okf": {
    "include": "services",
    "serve": { "static": false, "mcp": false }
  }
}
```

| Setting | Values | Default | What it does |
| --- | --- | --- | --- |
| `include` | `"services"`, `"all"` | `"services"` | `"services"`: your services and what they use. `"all"`: every definition, except those marked `@okf: false`. |
| `serve.static` | `false`, `true`, `"/path"` | `false` | Serves the bundle's files from a route: `true` means `/okf`. See [Serving the bundle](#serving-the-bundle). |
| `serve.mcp` | `false`, `true`, `{ plugin, as, namespace, requires }` | `false` | Serves the bundle over MCP through `@gavdi/cap-mcp`, as `okf://` resources, tools or both. See [Serving over MCP](#serving-over-mcp) and [ADR-0010](docs/adr/0010-mcp-integration-contracts-rev2.md). |

cap-okf warns about a key it doesn't know (a typo such as `requries` would otherwise be ignored),
and about `okf` or `serve` set to something other than an object. During `cds build` and
`cds compile` it also warns about `serve` settings the deployed app would stop on at startup.

Nothing is ever served unless you turn it on ([ADR-0002](docs/adr/0002-serving-is-opt-in.md)).
Installing an MCP plugin doesn't change that.

Also good to know:

- **Build tasks.** If your app lists its own `cds.build.tasks`, CAP only runs the tasks in that
  list. Add `{ "for": "okf" }` to it, or `cds build` writes no bundle. `cds add okf` does this for
  you in `package.json` and `.cdsrc.json` (base and top-level profiles); for `.cdsrc.yaml` or
  `.cdsrc.js`, and for task lists in profiles inside `build`, add it yourself.
- **Reproducible builds.** `generated.at` is the build time. Set `SOURCE_DATE_EPOCH` (seconds
  since 1970, e.g. `git log -1 --format=%ct`) to stamp a fixed time, so two builds of the same
  sources give the same bytes.
- **Doc comments** don't need `cdsc.docs`: cap-okf loads the model with them itself, so your
  `$metadata` stays as it is.

## Authorization sections

Each concept for something with access rules ends with an authorization section, between two
marker lines:

```markdown
<!-- okf:auth:start -->
## Authorization

A request must pass every rule in this section. In a table of privileges, one matching row is enough.

| Grant | To | Where |
| --- | --- | --- |
| `READ` | `authenticated-user` |  |
| `CREATE`, `UPDATE`, `DELETE` | `catalog-manager` |  |

### From service [AdminService](/model/AdminService.md)

Requires: `authenticated-user`
<!-- okf:auth:end -->
```

It shows the rules as CAP applies them, including those inherited from the service or a
composition's root. When it serves the bundle, cap-okf removes these sections for requests
without an authenticated user ([ADR-0003](docs/adr/0003-authorization-sections.md)).

**Only the section is hidden.** Everything else in a concept is shown to every reader: doc
comments, `@title`, `@description`, i18n texts, tags and the rest of the frontmatter. Keep access
rules out of them: write `/** Orders placed in the shop. */`, not
`/** Support staff only see their own orders. */`; the rule itself appears in the section. In
`okf/` files, put such text between the same two marker lines, each alone on its own line, below
the frontmatter. `cds build` stops on a marker it can't trust (L3): an end without a start, a
start without an end, a marker in the frontmatter, a marker that isn't alone on its line (a
bullet, `#`, quote or other text with it), or a comment meant as a marker but misspelled
(`<!-- okf: auth:start -->`). None of these would hide anything. It warns about a marker written
slightly differently, or inside a code block, where it still cuts the text (L4). Marker text in
inline code within a sentence, or a bulleted example in a fenced block, is fine.

**The files on disk always contain them.** That includes `gen/okf` and the copy in your deployed
app (`gen/srv/okf-bundle/`). If you commit `gen/okf`, publish it, or ship it anywhere public,
consider whether your role names and `where` conditions may be seen. `cds add okf` puts
`gen/okf` in `.gitignore` for this reason.

## Serving the bundle

Turn on the static route, for example only in development:

```json
"cds": { "okf": { "[development]": { "serve": { "static": true } } } }
```

Then `cds watch` serves the bundle at `/okf/`:

- `GET /okf/` or `/okf/index.md` returns the root index; a folder path such as `/okf/model/`
  returns its `index.md`. `.md` files are served as `text/markdown; charset=utf-8`, other text
  files from `okf/` as `text/plain; charset=utf-8`; files that aren't UTF-8 text (e.g. images)
  aren't served.
- Requests go through CAP's own authentication. Readers who aren't authenticated get every file
  without its authorization sections; authenticated users get them in full, whatever their
  roles. With `auth: "dummy"` (or a privileged default user), CAP treats every request as
  authenticated, so everyone sees the sections.
- No CORS: the route answers same-origin requests; a browser tool on another origin can't read
  it, and `OPTIONS` gets 405.
- Links in concepts are bundle-absolute (`/model/User.md`): resolve them against the route
  (`/okf/model/User.md`), not the server's root.
- The route isn't listed on CAP's index page.
- Where the bundle comes from: a deployed app serves its built `okf-bundle/` folder, exactly what
  `cds build` validated. Without one (`cds watch`, `cds serve`, tests), cap-okf generates the
  bundle in memory at startup from the app's model and `okf/`; curated files with errors are left
  out and reported, so startup never fails over them. Under `NODE_ENV=production` that gets a
  warning, because the app was deployed without the okf build task.
- Changes show up when the server restarts. `cds watch` restarts when CDS files change, but not
  when Markdown files do, and a plugin can't change that. To restart on edits in `okf/` too, add
  `md` to its file types; `--ext` replaces the default list, so repeat it:

  ```sh
  cds watch --ext cds,csn,csv,ts,mjs,cjs,js,json,properties,edmx,xml,env,md
  ```

## Serving over MCP

With [`@gavdi/cap-mcp`](https://github.com/gavdilabs/cap-mcp-plugin) v2 installed, cap-okf serves the
bundle over MCP on two channels: `okf://` resources, and tools.

```json
"cds": { "okf": { "serve": { "mcp": { "as": ["resources", "tools"] } } } }
```

`true` alone picks the plugin's own default channel, which for `@gavdi/cap-mcp` is resources.

### Resources

cap-okf registers two resources through the plugin's `mcp:resources` event:

| Resource | What an agent gets |
| --- | --- |
| `okf://<namespace>/index.md` | The bundle's root index: where to start. |
| `okf://<namespace>/{+path}` | Any concept by its bundle path, e.g. `okf://acme-orders/model/CatalogService/Books.md`; a folder (`…/model/`) reads its `index.md`. Completion offers the paths. |

The concepts aren't listed one by one: agents find them through the index, or through completion of
`path`. Each segment of a path is percent-encoded in the URI (`two%20words.md`). This needs a
`@gavdi/cap-mcp` release with `mcp:resources` (contract version 1); with an older one cap-okf warns once at
startup and serves no resources.

### Tools

With `as` including `"tools"`, cap-okf adds a read-only `OkfService` to the app, which the MCP plugin offers as five tools:

| Tool | What an agent gets |
| --- | --- |
| `OkfService_Index_query`, `OkfService_Index_get` | The index: one row per concept (path, type, title, description, tags, links), never its text. Filters, sorting and paging as the plugin offers them; free text searches the text columns. |
| `OkfService_searchConcepts` | Index rows whose title, tags, description or path contain every word, best first (20 by default, at most 100). |
| `OkfService_getConcept` | One concept's full Markdown, by path. |
| `OkfService_bundleInfo` | The OKF version, a hash of the bundle (to tell whether a stored copy is stale) and the namespace. |

### On both channels

- `requires` (default `"authenticated-user"`) is the role or roles a caller needs; one is enough. Callers
  without it don't see the tools or the index resource; calling a tool anyway is answered like an unknown
  tool, and reading a resource like an unknown resource.
- Authorization sections are removed for callers who aren't authenticated, as on the static route; the
  `Index` tool lists links only to concepts the caller can open.
- `OkfService` has no OData endpoint: only the MCP plugin reaches it. It is never part of the bundle.
- If the app lists its own `cds.build.tasks`, include `{ "for": "okf" }`, or the deployed app has no
  `OkfService` (cap-okf warns at startup).
- The namespace of the `okf://` resources (`cds.okf.serve.mcp.namespace`) defaults to the `package.json`
  name, lower case, with `@` dropped and `/` as `-`.

## Building and deploying

`cds build` writes the bundle to `gen/okf` (to `gen/okf` also for in-place builds with
`build.target: "."`), for review and CI. For a Node.js app it also puts the same files into the
app it deploys: `gen/srv/okf-bundle/`. That copy is what a deployed app serves.

The build validates the bundle against OKF v0.2. Errors fail the build, and nothing goes into
the deployed app; warnings are listed and never fail it.

## Messages

Every message names the file to fix, the line, the rule and how to fix it:

```text
[okf] okf/model/notes.md:1 — model/ belongs to the generator; a curated file can't be there (L1).
  Move it out of okf/model/, e.g. to okf/notes/notes.md.
```

Files from `okf/` are named `okf/<path>`; generated files `gen/okf/<path>`; problems in the
model name the `.cds` file and line.

| Rule | Kind | Meaning |
| --- | --- | --- |
| R1 | error | A concept has no valid frontmatter (OKF §11). |
| R2 | error | A concept has no `type`, or an empty one. |
| R3 | error | An `index.md` or `log.md` breaks its structure (OKF §8, §9). |
| W1 | warning | `title` or `description` is missing. |
| W2 | warning | An OKF v0.2 field has the wrong shape. |
| W3 | warning | A deprecated v0.1 field is used (e.g. `timestamp`). |
| W4 | warning | A link points at a file that isn't in the bundle. |
| L1 | error | A file in `okf/` can't go into the bundle (in `model/`, a reserved name, or a path clash). |
| L2 | warning | `okf/index.md` doesn't link to `model/`. |
| L3 | error | An authorization marker in an `okf/` file is broken (unpaired, in the frontmatter, not alone on its line, or misspelled); the file is left out. |
| L4 | warning | An authorization marker in an `okf/` file is written slightly differently, or sits in a code block. |
| M1 | error | Two definitions would get the same path, or paths that differ only in letter case. |

Setting mistakes (e.g. `cds.okf.include: "everything"`) name the setting and its allowed values
instead of a file.

## Known limits

- CAP Node.js only: Java isn't supported in this release.
- Texts come from `cds.i18n.default_language` only; `cds compile -l` is refused, and so are
  `-s <service>` (the bundle holds every exported service), a model piped in on stdin and
  `--sort` (cap-okf loads the model's files again, with doc comments).
- `cds compile --to okf` reports only problems with `okf/` (L1, L2); the full OKF check
  (R1–R3, W1–W4) runs in `cds build`.
- Markdown inside i18n texts (e.g. a link) isn't escaped, so it renders as Markdown.
- `cds compile -o` adds and overwrites files but never deletes any; compile into an empty folder,
  or use `cds build`.
- An `okf/` folder whose only Markdown file is its own `index.md` isn't listed in a generated
  root index.

## Demo app

`demo/` is a small bookshop app that uses cap-okf as a real plugin. Run `npm run demo`
(`cds watch`) or `npm run demo:build` from the repository root. See
[`demo/README.md`](demo/README.md).

To run the cds CLI with this repository's cap-okf in any CAP project during development:
`npm run cds:okf -- build <path to the app>` (CAP only loads plugins an app lists as
dependencies, so the script names this one through `CDS_PLUGINS`).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md). Licensed
under Apache-2.0.
