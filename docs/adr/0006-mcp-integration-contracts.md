# 0006. MCP integration contracts

- Status: Proposed
- Date: 2026-11-13
- Deciders: Simon Vestergaard Laursen
- Proposed by: Claude (pre-drafted from a read of `@gavdi/cap-mcp` v2; Phase 0 task 0.5 completes it)

## Context

ADR-0004 decides *that* cap-okf integrates with `@gavdi/cap-mcp` and `@cap-js/mcp`. This ADR
fixes *how* each side talks to the other.

What `@gavdi/cap-mcp` v2 does today (`src/index.ts`, `src/adapter/`):

- On `served` it reads `cds.env.mcp`, builds the exposure registry, then emits `mcp:apps` with a
  registry whose `register(uri, content)` only accepts `ui://` URIs.
- Each request builds a fresh `McpServer` inside `cds.context`; resources are registered per
  request and advertised only when the caller can use one (`resources: { listChanged: false }`,
  `cacheScope: private`).
- `cds.env.mcp` keys it does not know are reported as `UNKNOWN_CONFIG`, so cap-okf must keep its
  settings under `cds.okf`, never `cds.mcp`.

What `@cap-js/mcp` documents: `@mcp` services become `describe`, `query` and `call_action` tools;
no resources, no events or hooks.

## Options considered

1. **Resources through a new `mcp:resources` event in `@gavdi/cap-mcp`** (sibling of `mcp:apps`).
   Small, explicit, mirrors an existing pattern. Needs a change and an ADR in that repo.
2. **Reuse `mcp:apps`.** No change upstream, but `ui://` and the tool-link rule do not fit
   documents; would bend that plugin's ADR 0012.
3. **Tools only, through an `@mcp` CDS service, for both plugins.** No upstream change at all;
   works today. Agents can query concepts, but hosts cannot pin them as resources.

## Decision (proposed)

Option 3 for both plugins as the baseline, plus option 1 for `@gavdi/cap-mcp`.

### Contract A — `mcp:resources` (to be added to `@gavdi/cap-mcp`)

Emitted once on `served`, right after `mcp:apps`. Listeners register synchronously.

```ts
interface ResourceRegistry {
  register(resource: {
    uri: string;                 // absolute URI; must not use cap:// or ui://
    name: string;
    title?: string;
    description?: string;
    mimeType: string;            // "text/markdown" for OKF
    /** Called per resources/read, inside the request's cds.context. */
    read(ctx: { user: unknown; locale?: string }): string | Promise<string>;
    /** Optional: hide the resource from callers who may not see it at all. */
    visible?(ctx: { user: unknown }): boolean;
  }): void;
}
```

`@gavdi/cap-mcp` adds registered resources to each per-request server, advertises the
`resources` capability when the caller sees at least one, keeps `listChanged: false`, and maps a
thrown error to its resource-not-found answer. It never imports cap-okf.

cap-okf registers `okf://index.md` and one `okf://<path>` per concept; `read` returns the concept
through the ADR-0003 filter for `ctx.user`. When no `mcp:resources` event arrives by the end of
`served` (an older `@gavdi/cap-mcp`), cap-okf logs one warning and falls back to the tools channel
if it was requested.

### Contract B — `OkfService` (both plugins)

```cds
@mcp @path: '/okf-service'
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

Served by a READ handler over `BundleSource`; `body` passes through the ADR-0003 filter for
`req.user`. The model is only added to the app when the tools channel is on (mechanism: ADR-0005).
`@requires` on the service is configurable, defaulting to `authenticated-user`.

## Open points for task 0.5

- Confirm in the `@cap-js/mcp` source that it has no resource hook; if it has one, add Contract C.
- Confirm how a plugin adds a CDS model conditionally (ADR-0005), so `OkfService` does not exist
  unless the tools channel is on.
- Agree Contract A with the `@gavdi/cap-mcp` maintainer and record it there as an ADR.

## Consequences

- One contract test suite per contract, run in cap-okf against a fake emitter and against a real
  fixture app per plugin.
- `@gavdi/cap-mcp` gains a general extension point other plugins can use too.
