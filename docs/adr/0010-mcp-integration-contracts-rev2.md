# 0010. MCP integration contracts, revision 2 (supersedes ADR-0006)

- Status: Proposed
- Date: 2026-11-17
- Deciders: Simon Vestergaard Laursen
- Proposed by: Claude Code, from the maintainer's revision 2 of ADR-0006 (2026-11-17), merged
  with the findings of task 0.5 that ADR-0006 recorded; Contract A updated the same day to the
  `@gavdi/cap-mcp` maintainers' answer (`docs/upstream/gavdi-cap-mcp/reply-2026-11-17.md`)
- Supersedes: ADR-0006 (once Accepted; ADR-0006 is Accepted and can't be edited, so this ADR
  replaces it as a whole)
- Amends: ADR-0004 point 3 (channel shapes). The maintainer's amendment note for ADR-0004 is
  given at the end, ready to add there.

## Context

ADR-0004 decides *that* cap-okf integrates with `@gavdi/cap-mcp` and `@cap-js/mcp`. ADR-0006
fixed *how*, with the facts task 0.5 found in both plugins. Those facts still hold and are not
repeated here; read ADR-0006's Context for them. In short:

- `@gavdi/cap-mcp` v2 emits `mcp:apps` from inside its own `served` listener, without awaiting
  listeners; it builds one `McpServer` per request inside `cds.context`; `@mcp` is not a CAP
  protocol there, so an `@mcp` service is also served over OData; unknown `cds.mcp` keys are
  warned about, so cap-okf keeps its settings under `cds.okf`.
- `@cap-js/mcp` is a CAP protocol adapter (`cds.protocols.mcp`): an `@mcp` service is served only
  at `/mcp/<service path>`, with the tools `describe`, `query` and `call`. It has no resources,
  events or hooks. Its `query` tool sends real queries (CQL or CQN) and always sets `count`.
- Detection reads `cds.env.plugins` by package name, with no version check, so `@gavdi/cap-mcp`
  1.x can't be told from 2.x.

### Why a revision

ADR-0006 had four problems:

1. **Context flooding.** `Concepts.body` was an ordinary column. A query tool called without
   `columns` returns every concept's full Markdown, which fills the agent's context and defeats
   OKF's progressive disclosure (read the index, then only the concepts you need).
2. **URI collisions.** `okf://index.md` has no namespace. A host connected to two cap-okf apps
   sees two resources with the same URI.
3. **Resource-list noise.** One fixed resource per concept is fine for small bundles. With
   hundreds of concepts a host's resource picker becomes unusable, and adding resource templates
   later would have changed the contract.
4. **Tenants and locales.** With extensibility the CDS model, and so the bundle, can differ per
   tenant; texts can differ per locale. ADR-0006 said nothing about either.

## Options considered

1. **Resources through a new `mcp:resources` event in `@gavdi/cap-mcp`** (sibling of `mcp:apps`).
   Small, explicit, mirrors an existing pattern. Needs a change and an ADR in that repo.
2. **Reuse `mcp:apps`.** No change upstream, but `ui://` and the tool-link rule don't fit
   documents; it would bend that plugin's ADR 0012.
3. **Tools only, through an `@mcp` CDS service, for both plugins.** No upstream change; works
   today. Agents can find and read concepts, but hosts can't pin them as resources.

## Decision (proposed)

Option 3 for both plugins as the baseline, plus option 1 for `@gavdi/cap-mcp` 2.x, as in
ADR-0006, with the channel shapes below.

### Shared rules (both channels)

- **One key.** A concept's bundle path is its identity on both channels:
  `okf://acme-orders/model/sample/bookshop/Books.md` and
  `getConcept('model/sample/bookshop/Books.md')` are the same concept.
- **Namespace.** `cds.okf.serve.mcp.namespace`. The default is derived from the app's
  `package.json` name: lowercase, leading `@` dropped, `/` replaced by `-`
  (`@acme/orders` → `acme-orders`). It must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`; anything
  else, or no name to derive it from, is a startup error with an `[okf]` message and a fix.
- **Bundle key `(tenant, locale)`.** `BundleSource` takes the request's tenant and locale and
  caches what it resolves under that key. The ADR-0003 filter then runs per user on top.
  - *Proposed scope for release 0.2:* every key resolves to the same bundle: the built
    `okf-bundle/` in a deployed app, or the in-memory bundle in development (ADR-0007), with texts
    in the default language (task 2.5). Bundles that really differ per tenant (extensibility) or
    per locale need generation at runtime or one built bundle per locale, which changes ADR-0007;
    they get their own ADR when needed. The key is in the interface from the start, so adding
    them later changes no contract.
- **Read-only.** No channel offers writes, now or later. Curated notes are edited in the repo.
- **Staleness.** A hash of the bundle lets hosts that pin resources detect a stale copy.
  - *Not* in the root `index.md`: OKF v0.2 §8 allows only `okf_version` in an index file's
    frontmatter, and cap-okf's validator reports any other key as R3 (an error that fails the
    build).
  - *Not* in resource metadata either: Contract A as built passes no `_meta` (template `list`
    entries carry only `uri`, `name`, `title`, `description`).
  - *Proposed instead:* `bundleHash` (SHA-256 over the sorted paths and texts of the
    `(tenant, locale)` bundle, before filtering) from the function `bundleInfo()` on Contract B,
    returning `{ okfVersion, bundleHash, namespace }`. A host that pins `okf://` resources and
    wants to check staleness calls that tool.

### Contract A — `mcp:resources` in `@gavdi/cap-mcp`, as built

The `@gavdi/cap-mcp` maintainers build this (their ADR 0013, accepted once cap-okf confirms); their
answer, with the reasons for each difference from the first proposal, is in
`docs/upstream/gavdi-cap-mcp/reply-2026-11-17.md`. Changes from ADR-0006: `contractVersion`;
`registerTemplate` in the same release; `tenant` in every context; "not found" is a thrown 404,
not `undefined`; canonical URIs; concepts through one template.

Emitted once on `served`, right after `mcp:apps`, from the same listener, also when nothing else
produces resources. Listeners register synchronously, before any `await`; the registry closes
when the emit returns, and `register` and `registerTemplate` throw after that. A registration
that throws fails startup with a `cap-mcp:` message.

```ts
interface ResourceContext { user: unknown; tenant?: string; locale?: string }

interface ResourceRegistry {
  readonly contractVersion: 1;
  register(resource: FixedResource): void;
  /** Ships with register in contractVersion 1; listeners still feature-detect it. */
  registerTemplate?(template: TemplateResource): void;
}

interface FixedResource {
  uri: string;                 // absolute and canonical: new URL(uri).href === uri; not cap:/ui:
  name: string;
  title?: string;
  description?: string;
  mimeType: string;            // "text/markdown" for OKF; text only
  /** Called per resources/read, inside the request's cds.context; not wrapped in srv.tx. */
  read(ctx: ResourceContext): string | Promise<string>;
  /** Optional, synchronous: hide the resource (not listed, not readable) for this caller. */
  visible?(ctx: ResourceContext): boolean;
}

interface TemplateResource {
  uriTemplate: string;         // RFC 6570, canonical once expanded, e.g. "okf://acme-orders/{+path}"
  name: string;                // unique among templates, e.g. "okf-acme-orders-concepts"
  title?: string;
  description?: string;
  mimeType: string;
  /** Optional: concrete resources to add to resources/list. */
  list?(ctx: ResourceContext): ListedResource[] | Promise<ListedResource[]>;
  /** Per resources/read of a matching URI; params are strings, still percent-encoded. */
  read(ctx: ResourceContext & { uri: string; params: Record<string, string> }): string | Promise<string>;
  /** Optional: completion for the template's own variables; at most 100 values are passed on. */
  complete?(ctx: ResourceContext, param: string, value: string): string[] | Promise<string[]>;
}

interface ListedResource { uri: string; name: string; title?: string; description?: string }
```

`@gavdi/cap-mcp` side (as built):

- Adds, per request, every fixed resource whose `visible(ctx)` is not `false`, and every template.
  A `visible` that throws hides that resource for the request and is logged.
- Advertises the `resources` capability only when the caller has a resource; `listChanged: false`,
  no subscriptions; `resources/list` keeps `cacheScope: private`.
- A hidden fixed URI that a template also matches is answered by the template's `read`.
  Overlapping templates match in sorted `uriTemplate` order.
- Calls the callbacks inside the request's `cds.context` (user, tenant, locale), not inside
  `srv.tx`, and doesn't cache their results across requests.
- Hidden and unknown URIs get the same resource-not-found answer.
- Errors: `status`/`statusCode` 404 or `code: "NOT_FOUND"` → resource-not-found, with the URI only
  (the error's message is not passed on); anything else is logged as an internal error. A `read`
  that returns something other than a string is an internal error; a `list` that throws adds
  nothing; a `complete` that throws offers nothing.
- Rejects at registration: a URI that isn't absolute and canonical, a `cap:` or `ui:` URI, a
  duplicate URI, `uriTemplate` or template `name`, a template the SDK's `UriTemplate` can't parse.
- Exports the contract's types from `@gavdi/cap-mcp` as types only. Never imports cap-okf.

cap-okf side:

- **Subscribes at plugin load** (`cds.on('mcp:resources', …)` from `cds-plugin.js`), not inside
  its own `served` listener: cap-mcp emits from within its `served` listener, and plugin load
  order is not fixed (task 0.5; their answer says the same). It registers synchronously; the
  callbacks may await the bundle, which is ready before `served` completes (ADR-0007).
- **One fixed resource:** `okf://<namespace>/index.md`, without `visible` (its text goes through
  the ADR-0003 filter in `read`, so every caller may see the index).
- **One template for every concept, whatever the bundle size:** `okf://<namespace>/{+path}`,
  named `okf-<namespace>-concepts`, with `read` and `complete`, no `list` (agents find paths in
  the index; a long resource list is what this avoids).
  - `read` percent-decodes `params.path` once, accepts it only if it is a path the bundle lists
    (no `..`, no absolute paths: `BundleSource.read` already refuses those), and returns the
    concept through the ADR-0003 filter for `ctx.user`. An unknown or hidden path throws an
    error with `status: 404`.
  - `complete` offers bundle paths the caller may see that start with the typed value, sorted.
- **Canonical URIs:** every URI cap-okf builds encodes each path segment as a URI path (ADR-0007,
  path rules) and is checked with `new URL(uri).href === uri` before registering, so a mistake
  fails at startup with an `[okf]` message rather than inside cap-mcp.
- **Without `registerTemplate`** (a release without it, which the maintainers don't plan): one
  warning, nothing registered, and the tools channel if `tools` was requested. cap-okf doesn't
  fall back to one fixed resource per concept, which the maintainers asked us not to do.
- Checks at `listening` whether the event arrived. If not (`@gavdi/cap-mcp` 1.x, or 2.x without
  Contract A): one warning naming the version and event it needs, and the tools channel if
  `tools` was requested.
- The contract test may import the exported types (`import type`), which adds a dev dependency
  only (task 4.8), never a runtime one (ADR-0004: never `require` an MCP plugin).

### Contract B — `OkfService` (both plugins), revision 2

Index-first: listing and searching return metadata only; a concept's body is one deliberate
call.

```cds
@mcp @path: 'okf-service'   // relative, so each protocol adds its own prefix (task 0.5)
@okf: false                 // never part of the bundle it serves (task 2.6)
service OkfService {
  /**
   * The app's knowledge index. Start here: one row per concept you may see, without its body.
   * Read a concept's full text with getConcept(path).
   */
  @readonly entity Index {
    key path        : String;   // bundle path, e.g. 'model/sample/bookshop/Books.md'
        type        : String;
        title       : String;
        description : String;
        tags        : String;   // comma-separated
        links       : String;   // comma-separated paths of linked concepts
  }

  /** Full concept as Markdown with frontmatter. Take the path from Index or searchConcepts. */
  function getConcept(path : String) returns LargeString;

  /**
   * Find concepts by words in title, description, tags or path; optionally narrow by type or tag.
   * Returns Index rows only (default 20, at most 100). Then read the ones you need with getConcept.
   */
  function searchConcepts(text : String, type : String, tag : String, top : Integer) returns many Index;

  /** The bundle's OKF version, hash and namespace, to check whether a stored copy is stale. */
  function bundleInfo() returns { okfVersion : String; bundleHash : String; namespace : String };
}
```

- All functions and `Index` read through `BundleSource` for `(tenant, locale)` and the ADR-0003
  filter for `req.user`. `Index` and `searchConcepts` return only visible concepts; `links`
  lists only visible targets. `getConcept` answers 404 for an unknown and a hidden path alike.
- `searchConcepts` matches case-insensitively and ranks title over tags over description over
  path. It never matches the body, so the authorization section can't be probed (ADR-0003).
- **`Index` answers real queries** from both plugins' query tools, so its READ handler evaluates
  a defined subset in memory (from ADR-0006): `count` (always set by `@cap-js/mcp`);
  comparisons and `contains` on `path`, `type`, `title`, `tags`; `orderBy`; paging; `columns`.
  It rejects with a clear error what it doesn't support: `search` (use `searchConcepts`), `one`,
  `groupBy`/`having`, expands, functions and aggregates. Tool descriptions don't promise more.
- **Descriptions as `@description`, not only doc comments.** `@gavdi/cap-mcp` takes a tool's
  description from `@mcp.description`, then `@description`, then the doc comment, and doc
  comments reach the model only when the app sets `cdsc.docs` (its ADR 0011; cap-okf never sets
  it for the app). So the service, `Index`, each function and each parameter carry an
  `@description`, written as an instruction to an agent; the doc comments above say the same for
  readers of the CDS file.
- **Tool names under `@gavdi/cap-mcp`** (confirmed by its maintainers for the first four; the
  fifth follows the same pattern): `OkfService_getConcept`, `OkfService_searchConcepts`,
  `OkfService_Index_query`, `OkfService_Index_get`, `OkfService_bundleInfo`.
- `@requires` comes from `cds.okf.serve.mcp.requires`, default `authenticated-user`.
- The model is only added to the app when the tools channel is on (ADR-0005 (e)).
- **How it is served differs by plugin** (task 0.5, unchanged): with `@cap-js/mcp` only at
  `/mcp/okf-service`, and its development autowire writes that endpoint into the developer's MCP
  client configs (README must say so); with `@gavdi/cap-mcp` at `/mcp`, and `OkfService` is
  marked `@protocol: 'none'` so it isn't also opened on OData (maintainer's decision,
  2026-11-13; task 4.5 proves it works, else the endpoint stays and is documented).
- **Fallback**, if task 4.5 finds that `@cap-js/mcp` can't expose unbound functions as tools
  (`@gavdi/cap-mcp` can, per its maintainers): replace the functions with an entity `Concepts` (the `Index` columns
  plus `body : LargeString`) whose READ handler fills `body` only on a single-key read
  (`Concepts('model/…/Books.md')`) and returns `null` on collection reads, and says so in its doc
  comment; `body` is not filterable. One shape is used for both plugins.

### Settings (ADR-0004 point 1, extended)

```json
"cds": { "okf": { "serve": { "mcp": {
  "plugin": "auto", "as": ["resources", "tools"],
  "namespace": "<derived from package.json name>",
  "requires": "authenticated-user"
} } } }
```

Both new keys are optional. (The first draft's `templateThreshold` is gone: concepts are always
served through the template.)

### Open points

- **Task 4.5, first step:** check in the `@cap-js/mcp` source whether unbound CDS functions
  become tools (through `call` or `per_action_tool`) and where their descriptions come from. This
  decides between Contract B and its fallback for that plugin. (`@gavdi/cap-mcp`: yes, answered.)
- **For the maintainer:** confirm Contract A as built to the `@gavdi/cap-mcp` maintainers, so
  their ADR 0013 is marked accepted. Task 4.6 stays blocked until a release emits
  `mcp:resources`.
- **For the maintainer:** accept the proposed `(tenant, locale)` scope and the `bundleHash`
  placement (now `bundleInfo()` only), or say otherwise.

## Consequences

- Agents get the index first on both channels; full concepts are pulled one at a time.
- Several cap-okf apps can sit in one MCP host without URI collisions.
- The resource list stays short for any bundle size: one index and one template per app.
- The bundle files stay exactly OKF v0.2: the hash lives in MCP metadata, not in `index.md`.
- One contract test suite per contract, run in cap-okf against a fake emitter (with and without
  `registerTemplate`, and with non-canonical URIs) and against a real fixture app per plugin
  (task 4.8).
- `@gavdi/cap-mcp` 1.x stays unsupported; the runtime warning names what's needed.
- ADR-0006 becomes Superseded when this is Accepted; its Context stays the record of task 0.5.

## Amendment note for ADR-0004 (for the maintainer to add; ADR-0004 can't be edited by agents)

> ### Amendment 2026-11-17
>
> ADR-0010 (revision 2 of the MCP integration contracts, superseding ADR-0006) refines the
> channel shapes in point 3. The decision itself (opt-in, two channels, one interface, one
> authorization rule) is unchanged.
>
> - Resource URIs carry a namespace: `okf://<namespace>/index.md` as a fixed resource, and every
>   concept through one template `okf://<namespace>/{+path}`.
> - The tools channel is index-first: `OkfService.Index` (no body) plus the functions
>   `getConcept(path)`, `searchConcepts(...)` and `bundleInfo()`, instead of one `Concepts`
>   entity with `body`.
> - The object form of `cds.okf.serve.mcp` gains two optional keys: `namespace` and `requires`.
>
> The context table keeps `call` as the name of `@cap-js/mcp`'s third tool (not `call_action`).
