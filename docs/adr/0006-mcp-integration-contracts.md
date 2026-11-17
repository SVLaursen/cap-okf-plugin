# 0006. MCP integration contracts

- Status: Superseded by ADR-0010 (2026-11-17, Simon Vestergaard Laursen)
- Date: 2026-11-13
- Deciders: Simon Vestergaard Laursen
- Proposed by: Claude (pre-drafted from a read of `@gavdi/cap-mcp` v2; completed in Phase 0 task 0.5)

## Context

ADR-0004 decides *that* cap-okf integrates with `@gavdi/cap-mcp` and `@cap-js/mcp`. This ADR
fixes *how* each side talks to the other.

### What `@gavdi/cap-mcp` v2 does today

Read at commit `590033c` (2.0.0-alpha.0), in `src/index.ts`, `src/adapter/` and `src/config.ts`:

- On `served` it reads `cds.env.mcp`, builds the exposure registry, then emits `mcp:apps` with a
  registry whose `register(uri, content)` only accepts `ui://` URIs.
  - `cds.emit` is not awaited, so listeners must register synchronously.
  - The emit happens *inside* cap-mcp's own `served` listener.
- It mounts one `/mcp` route for all `@mcp` services, behind `cds.middlewares.before` (its ADR 0009).
- Each request builds a fresh `McpServer` from `cds.context` (user, model, locale).
  - Resources are registered per request, and the `resources` capability is advertised only when
    the caller sees at least one (`listChanged: false`).
  - `resources/list` carries `cacheScope: private`.
  - A read that fails with a known error (no such record) answers with the SDK's
    `ResourceNotFoundError`; any other error is logged and answered as an internal error.
- A service opts in with `@mcp: true`. That exposes its entities as query and get tools, plus its
  functions (its ADR 0004). `@mcp` is not a CAP protocol here: neither v1 nor v2 registers
  `cds.protocols.mcp`, so the service is still served over OData too.
- Its ADR 0006 says resources are application-controlled (the host or the user attaches them).
  Many clients never let the model read resources on its own, so tools stay the agent's main path.
- `cds.env.mcp` keys it doesn't know are reported as warnings at startup. cap-okf must therefore
  keep its settings under `cds.okf`, never `cds.mcp`.
- **v1 (1.x)** has the same package name but a different annotation style: per-entity
  `@mcp: { name, description, resource: [...] }`, `@mcp.wrap`. It has neither `mcp:apps` nor a
  service-level `@mcp` opt-in. Neither contract below works with v1.

### What `@cap-js/mcp` does today

Read in the published package 1.5.0 (`cds-plugin.js`, `lib/`):

- It is a CAP **protocol adapter**. Its `package.json` registers `cds.protocols.mcp` (path
  `/mcp`, impl `@cap-js/mcp/lib`). So `@mcp` on a service is a protocol annotation, just like
  `@odata`. With `@mcp` alone, a service is served **only** over MCP, at `/mcp/<service path>`.
- It runs one MCP server per service, with three tools: `describe`, `query`, and `call` (or one
  tool per action with `per_action_tool`). It offers no resources, no prompts, and no event, hook
  or exported registry another plugin could use. `lib/tools.js` exports tool factories for
  `@cap-js/agents`; those add tools to agents and are not a hook for adding resources.
  - Accepted ADR-0004's context table calls the third tool `call_action`; the package names it
    `call`. That is a factual slip in ADR-0004 for the maintainer to correct, not a change of
    decision.
- The `query` tool runs real queries against the service, in one of two modes (`cds.mcp.format`):
  - **`cql` (the package default):** the agent writes a CQL string, which goes through
    `cds.parse.cql`. It can use path expressions, nested expands, aggregates and functions.
  - **`cqn`:** the agent sends structured `where`, `orderBy`, `limit`, `columns`, `distinct`,
    `search`, `groupBy`, `having` and `one`.
  - In both modes the tool always sets `SELECT.count = true`.
- It checks `@requires` and `@restrict` on the service itself before any tool runs, and answers
  401 (anonymous) or 403.
- **Autowire in development:** on `listening`, unless `cds.mcp.autowire` is `false`, it writes
  every MCP-protocol service into the developer's MCP client configuration files in their home
  folder (Claude Code, opencode and others; `lib/clients.js`).

**So there is no Contract C.** The text for an upstream feature request is drafted in
`docs/upstream/cap-js-mcp-resources.md`. It has not been filed: filing upstream issues is the
maintainer's call (GOVERNANCE).

### Detecting the plugins (ADR-0004 §2)

- CAP's resolved plugin list is `cds.env.plugins`: package name → `{ impl }`. It includes app
  `dependencies`, non-production `devDependencies` and `CDS_PLUGINS` (ADR-0005). Look for the keys
  `@gavdi/cap-mcp` and `@cap-js/mcp`.
- Don't use `cds.env.protocols.mcp`: only `@cap-js/mcp` sets it.
- **No version check (maintainer's decision, 2026-11-13).** cap-okf doesn't read
  `@gavdi/cap-mcp`'s `package.json` or anything else from the plugin. Detection is by package
  name only, which keeps ADR-0004's "never `require` an MCP plugin" in its strictest reading.
  - So cap-okf can't tell 1.x from 2.x. It finds out at runtime: if no `mcp:resources` event has
    arrived by `listening`, it logs one warning. The warning says that resources need
    `@gavdi/cap-mcp` 2 with the `mcp:resources` event, and that 1.x exposes neither channel.
  - Detection has no side effects and runs only when `cds.okf.serve.mcp` is on (ADR-0004 §1).

## Options considered

1. **Resources through a new `mcp:resources` event in `@gavdi/cap-mcp`** (sibling of `mcp:apps`).
   Small, explicit, mirrors an existing pattern. Needs a change and an ADR in that repo.
2. **Reuse `mcp:apps`.** No change upstream, but `ui://` and the tool-link rule do not fit
   documents; would bend that plugin's ADR 0012.
3. **Tools only, through an `@mcp` CDS service, for both plugins.** No upstream change at all;
   works today. Agents can query concepts, but hosts cannot pin them as resources.

## Decision

Option 3 for both plugins as the baseline, plus option 1 for `@gavdi/cap-mcp` 2.x.

### Contract A — `mcp:resources` (agreed with `@gavdi/cap-mcp`, 2026-11-13)

Emitted once per `served`, right after `mcp:apps`, from the same listener. Listeners register
synchronously.

```ts
interface ResourceRegistry {
  register(resource: {
    uri: string;                 // absolute URI; must not use cap:// or ui://
    name: string;
    title?: string;
    description?: string;
    mimeType: string;            // "text/markdown" for OKF
    /**
     * Called per resources/read, inside the request's cds.context.
     * `undefined` means "not found"; a thrown error is a bug.
     */
    read(ctx: { user: unknown; locale?: string }): string | undefined | Promise<string | undefined>;
    /** Optional: hide the resource from callers who may not see it at all. */
    visible?(ctx: { user: unknown }): boolean;
  }): void;
}
```

`@gavdi/cap-mcp`:

- adds the registered resources the caller can see to each per-request server;
- counts them when it decides whether to advertise the `resources` capability;
- keeps `listChanged: false` and `cacheScope: private`;
- answers `undefined` from `read` with `ResourceNotFoundError`, and a thrown error as an internal
  error (logged), as it already does for its own resources and apps;
- rejects a duplicate URI, or a `cap://` or `ui://` URI, at `register` time;
- never imports cap-okf.

The ADR for that repo and a developer handoff (files, tests, docs, done criteria) are in
`docs/upstream/gavdi-cap-mcp/`.

cap-okf:

- registers `okf://index.md` and one `okf://<path>` per concept;
- has `read` return the concept through the ADR-0003 filter for `ctx.user`;
- **subscribes at plugin load** (`cds.on('mcp:resources', …)` in `cds-plugin.js`), not inside its
  own `served` listener, because cap-mcp emits from within its `served` listener and plugin load
  order is not fixed;
- checks at `listening` whether the event arrived. If not (cap-mcp 2.x without Contract A), it
  logs one warning and falls back to the tools channel if `tools` was requested.

### Contract B — `OkfService` (both plugins)

```cds
@mcp @path: 'okf-service'   // relative, so each protocol adds its own prefix
service OkfService {
  /** One OKF concept: a CDS definition or a curated note, as Markdown with frontmatter. */
  @readonly entity Concepts {
    key path        : String;
        type        : String;
        title       : String;
        description : String;
        tags        : String;   // comma-separated
        body        : LargeString;
  }
}
```

- The service is served by a READ handler over `BundleSource`, and `body` passes through the
  ADR-0003 filter for `req.user`.
- `@requires` on the service is configurable, defaulting to `authenticated-user`.
- The model is only added to the app when the tools channel is on. ADR-0005 (e) gives the
  mechanism and its limits.
- **How it is served differs by plugin.** CAP adds the protocol prefix only to a relative
  `@path` (`@sap/cds/lib/srv/protocols`), hence `'okf-service'`.
  - With `@cap-js/mcp`, `@mcp` is a protocol, so `OkfService` is only on `/mcp/okf-service`.
    In development, its autowire also writes that endpoint into the developer's MCP client
    configs. The developer opted in, so ADR-0002 holds, but the README must say so.
  - With `@gavdi/cap-mcp`, it is on `/mcp` (as tools), **and by default also on OData** at
    `/odata/v4/okf-service`, because `@mcp` is no protocol there.
- **The extra OData endpoint under `@gavdi/cap-mcp` (maintainer's decision, 2026-11-13).**
  ADR-0002's point is no accidental exposure, and asking for MCP tools should not quietly open
  OData too.
  - **Decided:** mark `OkfService` `@protocol: 'none'` when the plugin is `@gavdi/cap-mcp`. v2
    runs tools through `cds.services[name].tx`, so it may not need any HTTP endpoint. The
    annotation comes from a second small model added by the same mechanism as the service
    (ADR-0005 (e)).
  - **Condition:** task 4.5 must prove that v2 still exposes an internal service. If it doesn't,
    the fallback is to keep the endpoint and document it. It goes through the same READ handler
    and auth filter.
- **The READ handler must answer real queries.** Both plugins' query tools send real queries
  (see Context: `cql` and `cqn` modes for `@cap-js/mcp`). Task 4.5 must either evaluate a defined
  subset in memory, or find another way, such as a backing table. The subset at least:
  - handles `count`, which `@cap-js/mcp` always sets;
  - handles comparisons and `contains` on `type`, `title`, `tags`; `orderBy`; paging; `columns`;
  - rejects with a clear error what it does not support: `search` (or a defined meaning for it),
    `one`, `groupBy`/`having`, expands, functions and aggregates.

  The `describe` and `query` tool descriptions must not promise more than the handler supports.
- **No probing the auth section through filters (ADR-0003).** `where` and `search` are never
  evaluated against the unfiltered `body`. Otherwise a caller could test for authorization
  content with `contains(body, '@restrict')` even though the returned `body` is stripped.
  Simplest rule: `body` is not filterable or searchable at all (a `where` on it is rejected, and
  `search` covers only `title`, `description`, `tags`).

## Status of the open points

- **Resolved:** `@cap-js/mcp` has no resource hook (see Context); no Contract C. The upstream
  request is drafted, not filed.
- **Resolved:** Contract A was checked against the v2 source. It fits the per-request server,
  capability and cache rules there. Changes from the first draft:
  - the subscription moves to plugin load, and the fallback check moves to `listening`;
  - `register` rejects duplicates and reserved schemes;
  - `read` returns `undefined` for "not found", and a thrown error is an internal error.
- **Changed:** `OkfService` uses a relative `@path` (`'okf-service'`), so `@cap-js/mcp` serves it
  under `/mcp/`.
- **Resolved:** detection reads `cds.env.plugins`, by name only; no version check.
- **Resolved by ADR-0005:** how `OkfService` is added only when the tools channel is on.
- **Agreed (2026-11-13):** Contract A, by the `@gavdi/cap-mcp` maintainer. The developer handoff
  is in `docs/upstream/gavdi-cap-mcp/`. Task 4.6 stays blocked until a `@gavdi/cap-mcp` release
  emits `mcp:resources` (`docs/PLAN.md`).
- **Decided (2026-11-13):** don't file the `@cap-js/mcp` feature request for now; the draft stays
  in `docs/upstream/cap-js-mcp-resources.md`.
- **Decided (2026-11-13):** hide the OData endpoint under `@gavdi/cap-mcp` if task 4.5 proves it
  works (Contract B).
- **For the maintainer:** ADR-0004's context table says `call_action`; the tool is named `call`.
  ADR-0004 is Accepted, so the project hook blocks agents from editing it.

## Consequences

- One contract test suite per contract, run in cap-okf against a fake emitter and against a real
  fixture app per plugin (task 4.8).
- `@gavdi/cap-mcp` gains a general extension point other plugins can use too.
- `@gavdi/cap-mcp` 1.x is not supported. cap-okf can't tell it apart from 2.x, so the runtime
  warning names the version and event it needs.
- With `@cap-js/mcp`, concepts are reachable only through the tools channel until it offers a
  resource hook.
- The `OkfService` query subset is a real piece of work in task 4.5, and its limits must be
  visible to agents.
