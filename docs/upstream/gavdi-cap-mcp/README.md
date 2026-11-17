# Handoff: `mcp:resources` event for `@gavdi/cap-mcp` v2

> **Superseded (2026-11-17).** This describes the first proposal of Contract A. The contract as
> built is in [`reply-2026-11-17.md`](reply-2026-11-17.md) (their record: `0013-resources-from-code.md`
> in the `@gavdi/cap-mcp` repository) and cap-okf's ADR-0010. Kept for history.

For the developer working on `@gavdi/cap-mcp` v2 (`cap-mcp-v2`). It's written to that repository's
rules (its `CLAUDE.md`, ADRs 0003–0007, `docs/testing.md`). It was checked against commit
`590033c` (2.0.0-alpha.0); line numbers may have moved since.

- **What:** a new CAP event, `mcp:resources`, that lets app code and other plugins add MCP
  resources.
- **Why:** cap-okf needs it to publish its knowledge bundle as `okf://` resources. The event is
  general, though; cap-okf is only its first user.
- **Agreed by:** the maintainer of both projects, on 2026-11-13, as Contract A of cap-okf's
  ADR-0006.
- **The decision record:** [`0013-mcp-resources-event.md`](0013-mcp-resources-event.md), ready
  to copy into `docs/adr/`.

## Acceptance criteria

1. On `served`, right after `mcp:apps`, the plugin emits `mcp:resources` with a registry that has
   `register(resource)` (shape in the ADR).
2. `register` throws on any of these:
   - a URI that isn't absolute;
   - a `cap://` or `ui://` URI;
   - a duplicate URI or name;
   - a missing `read`.
3. For each request, the caller's server lists the registered resources whose `visible(ctx)` is
   true (missing `visible` = true), sorted by URI.
4. The `resources` capability is advertised when the caller sees a registered resource, even if
   there are no `@mcp.resource` records or UIs. `resources/list` keeps `cacheScope: private`, and
   `listChanged` stays `false`.
5. `resources/read`:
   - calls `read({ user, locale })` inside the request's `cds.context`;
   - a string becomes the content, with the registered `mimeType`;
   - `undefined` becomes `ResourceNotFoundError`;
   - a thrown error is logged and answered as an internal error (production hides the message).
6. A `visible` that throws counts as not visible and is logged.
7. Without listeners, nothing changes: same capabilities, same lists, same cost per request.
   The existing tests stay green unchanged.

## Where to change things

| File | Change |
| --- | --- |
| `src/adapter/resources.ts` (new) | `class PluginResources implements ResourceRegistry`: `register` with the checks from criterion 2, and `visibleFor(user)` returning the visible resources sorted by URI. Model it on `McpApps` in `src/adapter/apps.ts`. |
| `src/types.ts` | Export the `ResourceRegistry` type (rule 7: the module contract changes deliberately). Also export it from the package entry for TypeScript users. |
| `src/index.ts` (`activate`, after `setUpApps`) | `const resources = new PluginResources(); cds.emit("mcp:resources", resources);` then pass `resources` into `mcpHandler({...})`. Optional: one startup-report line with the count. |
| `src/adapter/index.ts` | `AdapterOptions` gets `resources?: PluginResources` ("none when omitted", like `apps`). In `serverFactory`: `const extra = options.resources?.visibleFor(user) ?? []`; include `extra.length > 0` in `hasResources`; register each with a new `registerPluginResource(server, resource, context, options)` modelled on `registerApp`. |
| `demo/server.js` | Rule 6, the demo is the fixture: register one example resource, e.g. `docs://bookshop/returns-policy.md`, with `visible` limited to authenticated users, next to the existing `mcp:apps` listener. Add a row to `demo/README.md`. |

`registerPluginResource` in outline:

```ts
server.registerResource(
  r.name,
  r.uri,
  { title: r.title, description: r.description, mimeType: r.mimeType },
  async () => {
    let text: string | undefined;
    try {
      text = await r.read({ user: context.user, locale: context.locale });
    } catch (error) {
      throw internalError(`reading ${r.uri} failed:`, error, options);
    }
    if (text === undefined) throw new ResourceNotFoundError(r.uri);
    return { contents: [{ uri: r.uri, mimeType: r.mimeType, text }] };
  },
);
```

## Tests (test first, against real CAP: ADR 0007, never mock `@sap/cds`)

- **`test/contract/plugin-resources.test.ts`:** criteria 2, 3 and 6 on `PluginResources`
  directly: rejected URIs and duplicates, `visibleFor` filtering and sort order, a throwing
  `visible`.
- **`test/contract/activate.test.ts`:** `mcp:resources` is emitted once, after `mcp:apps`, with
  the registry.
- **`test/behaviour/`**, against the demo, as anonymous, `bob` and `alice` (test name suggestion:
  `plugin-resources.test.ts`):
  - `resources/list` shows the demo resource only to authenticated users;
  - `resources/read` returns its text and MIME type;
  - an unknown URI → not found;
  - the capability appears for a caller who sees only a plugin resource.
- **Criterion 5's error paths:** a resource registered in the test whose `read` returns
  `undefined`, and one whose `read` throws (internal error, message hidden with
  `NODE_ENV=production`).
- **Criterion 7:** the existing suites prove it, as they must pass unchanged.

## Docs to touch

- `docs/adr/0013-…` (the ADR) plus a row in `docs/adr/README.md`.
- `docs/annotations.md`: a "`mcp:resources`" section next to the `mcp:apps` one: the registry
  shape, synchronous registration, visibility, the error rules.
- `docs/architecture.md`: the startup sequence (`mcp:apps` then `mcp:resources`) and where plugin
  resources join the per-request server.
- Optional: a short guide in `docs/guide/` mirroring `mcp-apps.md`.

## Definition of done

The repository's own list (`CLAUDE.md`): failing test first, `npm run check` green, docs touched,
backlog ticked. Also a release that cap-okf can depend on (2.x), with the event named in its
changelog.

## How cap-okf will use it (for context, nothing to build there)

```js
// cap-okf cds-plugin.js, at plugin load (cap-mcp emits from inside its own `served` listener)
cds.on('mcp:resources', registry => {
  for (const concept of bundle.list())
    registry.register({
      uri: `okf://${concept.path}`, name: `okf:${concept.path}`, title: concept.title,
      description: concept.description, mimeType: 'text/markdown',
      read: ({ user }) => bundle.readFiltered(concept.path, user)   // ADR-0003 auth filter
    })
})
```

cap-okf does not read cap-mcp's version. If no `mcp:resources` event has arrived by `listening`,
it logs one warning and falls back to its tools channel if that was requested.
