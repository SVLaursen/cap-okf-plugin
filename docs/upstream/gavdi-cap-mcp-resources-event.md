# Draft: ADR for `@gavdi/cap-mcp` — `mcp:resources` event

> Status: **draft for the `@gavdi/cap-mcp` maintainer.** Written in cap-okf task 0.5 as Contract A
> of cap-okf's ADR-0006. It belongs in that repository's `docs/adr/` once agreed. cap-okf never
> changes that repository. Checked against cap-mcp-v2 commit `590033c` (2.0.0-alpha.0).

---

# 00NN — Other plugins can add resources through `mcp:resources`

Status: proposed

## Context

`mcp:apps` (ADR 0012) lets app code add `ui://` resources that `@mcp.ui` tools link to. Other
plugins have read-only documents that hosts or users should be able to attach as context. One
example is cap-okf, which publishes knowledge about the app's model as Markdown. `mcp:apps` doesn't
fit: it accepts only `ui://`, and serves a resource only to callers who see a tool that links to
it.

ADR 0006 keeps querying in tools and treats resources as application-controlled context. That
matches documents a user pins, as long as the documents stay out of the tool path.

## Decision

On `served`, right after `mcp:apps` and from the same listener, emit `mcp:resources` with a
registry:

```ts
interface ResourceRegistry {
  register(resource: {
    uri: string;          // absolute; not cap:// or ui://
    name: string;
    title?: string;
    description?: string;
    mimeType: string;
    read(ctx: { user: unknown; locale?: string }): string | Promise<string>;
    visible?(ctx: { user: unknown }): boolean;
  }): void;
}
```

- `register` throws on a duplicate URI, a reserved scheme, or a missing `read`.
- Listeners register synchronously; the event is not awaited, the same as `mcp:apps`.
- Per request, the server factory adds every registered resource whose `visible(ctx)` is true
  (true when it is missing).
- Those resources count towards advertising the `resources` capability. Lists keep
  `listChanged: false` and `cacheScope: private`.
- `read` runs inside the request's `cds.context`. A thrown error becomes
  `ResourceNotFoundError`, and the message is not passed on in production.
- The plugin never imports the plugins that listen.

## Consequences

- A general extension point. Anyone can use it, not just cap-okf.
- A contract test with a fake listener in this repo; cap-okf runs the same contract from its side.
- Without listeners nothing changes: no extra capability, no extra cost per request.
