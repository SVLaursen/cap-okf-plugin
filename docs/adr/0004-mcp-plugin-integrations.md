# 0004. Integrate with both MCP plugins, opt-in, through one interface

- Status: Accepted
- Date: 2026-11-13
- Deciders: Simon Vestergaard Laursen

## Context

Two CAP plugins can put an app on MCP:

| Plugin | What it serves | Extension point today |
| --- | --- | --- |
| [`@gavdi/cap-mcp`](https://github.com/gavdilabs/cap-mcp-plugin) v2 | Typed tools per entity and operation, `cap://` record resources, prompts, MCP Apps; stateless, one `McpServer` per request inside `cds.context` | `mcp:apps` event, limited to `ui://` resources that a tool links to |
| [`@cap-js/mcp`](https://cap.cloud.sap/docs/guides/protocols/mcp) | `describe`, `query` and `call` tools per `@mcp` service | None documented |

cap-okf should work with whichever one an app uses, without depending on either, and without
exposing anything the developer did not ask for (ADR-0002).

Both plugins read `@mcp` on services and the `cds.mcp` config block, so an app normally runs
one of them, not both.

## Decision

1. **Opt-in, chosen in cap-okf's own config.** `cds.okf.serve.mcp` is `false` by default.
   Detecting an MCP plugin never switches anything on; it only decides *how* to serve once the
   developer has said *that* they want it.

   ```json
   "cds": { "okf": { "serve": {
     "mcp": false
       | true
       | { "plugin": "auto" | "@gavdi/cap-mcp" | "@cap-js/mcp",
           "as": ["resources", "tools"] }
   } } }
   ```

   `true` means `{ "plugin": "auto" }` with the plugin's natural channel: `resources` for
   `@gavdi/cap-mcp`, `tools` for `@cap-js/mcp`.

2. **Detection.** `auto` looks for the two plugins in the app's resolved CAP plugin list.
   One found: use it. None: one warning, nothing served over MCP. Both: an error that asks the
   developer to set `plugin`. An explicit `plugin` that is not installed is an error.

3. **Two channels.**
   - **resources**: every concept as an `okf://<bundle path>` resource (`text/markdown`),
     plus `okf://index.md`. Native for `@gavdi/cap-mcp` through a small, duck-typed event
     contract (ADR-0006). For `@cap-js/mcp` only once it offers a hook.
   - **tools**: a read-only CDS service `OkfService` with one entity `Concepts`
     (`path`, `type`, `title`, `description`, `tags`, `body`), served from `BundleSource` and
     annotated `@mcp`. Both plugins turn it into query tools with no special code, so this works
     with either plugin today.

4. **One interface, no imports.** Each plugin gets one module in `lib/serve/mcp/` implementing
   `McpIntegration { name, detect(cds), attach({ source, filter, options, log }) }`. cap-okf
   never `require`s an MCP plugin, and no MCP plugin requires cap-okf; they meet through CAP
   events and CDS models only.

5. **Same authorization rule everywhere.** Both channels read through `BundleSource` and pass
   every concept through the ADR-0003 filter with the caller's `cds.context.user`.

## Consequences

- Works today with both plugins (tools channel); resources arrive per plugin as hooks exist.
- `@gavdi/cap-mcp` needs one addition on its side (ADR-0006), owned by the same maintainer.
- A third MCP plugin is one new module, with no change to the others (open/closed).
- The contract suite runs each channel against a fixture app per plugin, since the two plugins
  do not share an app.
