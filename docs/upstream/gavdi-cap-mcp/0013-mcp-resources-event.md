# 0013 — Plugins and app code add MCP resources through `mcp:resources`

> **Superseded (2026-11-17).** This describes the first proposal of Contract A. The contract as
> built is in [`reply-2026-11-17.md`](reply-2026-11-17.md) (their record: `0013-resources-from-code.md`
> in the `@gavdi/cap-mcp` repository) and cap-okf's ADR-0010. Kept for history.

Status: accepted · 2026-11-13 (agreed by the maintainer as Contract A of cap-okf ADR-0006)

> Ready to copy into `docs/adr/` of `@gavdi/cap-mcp` v2. If 0013 is taken by then, use the next
> free number and add a row to `docs/adr/README.md`.

## Context

`mcp:apps` (ADR 0012) lets app code supply the HTML of `ui://` resources that `@mcp.ui` tools link
to. Other plugins and apps have read-only documents that hosts or users should be able to attach
as context. One example is cap-okf, which publishes knowledge about the app's model as Markdown
(Open Knowledge Format) under `okf://` URIs.

`mcp:apps` doesn't fit them:

- it accepts only `ui://`;
- it serves a resource only to callers who see a tool that links to it;
- documents have no tool.

ADR 0006 keeps querying and writes in tools and treats resources as application-controlled
context; `@mcp.resource` exposes single records by key. Documents a user pins as context fit that
reading of resources. They don't change how records are exposed.

## Decision

When CAP has served the app, right after `mcp:apps` and from the same `served` listener, the
plugin emits `cds.emit('mcp:resources', resources)`. The registry has one method:

```ts
export interface ResourceRegistry {
  register(resource: {
    /** Absolute URI, unique. Not cap:// (records, ADR 0006) and not ui:// (apps, ADR 0012). */
    uri: string;
    /** Unique among registered resources. */
    name: string;
    title?: string;
    description?: string;
    mimeType: string;
    /**
     * Called on every resources/read, inside the request's cds.context, so it can filter by user.
     * `undefined` means "not found"; a thrown error is a bug.
     */
    read(ctx: { user: unknown; locale?: string }): string | undefined | Promise<string | undefined>;
    /** Whether this caller may see the resource at all (default: everyone). */
    visible?(ctx: { user: unknown }): boolean;
  }): void;
}
```

- **Registering:** `register` throws on any of these:
  - a URI that isn't absolute;
  - a `cap://` or `ui://` URI;
  - a duplicate URI or name;
  - a missing `read`.
- **Synchronous:** the event is a plain emit, so listeners register synchronously, as with
  `mcp:apps`.
- **No globals (ADR 0005):** listeners get the registry as the event's argument.
- **Per request:** the server factory adds every registered resource whose `visible(ctx)` is true
  (true when `visible` is missing).
  - Those resources count when deciding whether to advertise the `resources` capability.
  - `listChanged` stays `false`, and `resources/list` keeps `cacheScope: private`, because the list
    depends on the user.
  - A `visible` that throws counts as not visible and is logged once per request.
- **Reading:** `read` runs inside the request's `cds.context`.
  - `undefined` → `ResourceNotFoundError`.
  - A thrown error → logged and answered as an internal error, like `registerApp` does. Its
    message is not passed on in production.
- **Opt-in (ADR 0004):** a registration *is* the opt-in. The plugin exposes nothing new without
  one, and a listener exists only because the app or another plugin was configured to add it.
  Without listeners, behaviour and cost per request stay exactly as today.
- **Independence:** the plugin never imports the plugins that listen, and they never import it.
  They meet only through the CAP event.

## Alternatives considered

- **Widen `mcp:apps` to any scheme.** `mcp:apps` ties visibility to tool links, and documents have
  none. Two different rules under one event would confuse app code.
- **Each plugin runs its own MCP server.** A second endpoint and a second client configuration
  for every app, and auth and the per-request context would be duplicated.
- **Expose documents only as a CDS entity behind the query tool.** Works today, but hosts can't
  list or pin the documents.

## Consequences

- `cds.on('mcp:resources')` becomes part of the user-facing contract (`docs/annotations.md`).
- A contract test covers the registry, and a behaviour test covers the demo's registration
  (`demo/server.js`).
- cap-okf (Contract A of its ADR-0006):
  - subscribes at plugin load;
  - registers `okf://index.md` plus one `okf://<path>` per concept;
  - filters authorization sections in `read` per caller;
  - logs one warning when no `mcp:resources` event arrives by `listening`.
- Resources registered here exist in the base model's app only. A per-tenant set would need
  `read` and `visible` to look at the tenant themselves. Revisit if extensions need their own.
