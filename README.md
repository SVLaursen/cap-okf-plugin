# cap-okf

A CAP plugin that turns your CDS model and curated Markdown into an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (OKF) bundle that people and AI agents can read, and lets your app choose how to serve it: a static route, MCP through [`@gavdi/cap-mcp`](https://github.com/gavdilabs/cap-mcp-plugin) or [`@cap-js/mcp`](https://cap.cloud.sap/docs/guides/protocols/mcp), both, or neither.

> Status: pre-release, under development. Targets OKF v0.2. See `docs/PLAN.md` for the roadmap.

## Planned usage

```sh
npm add -D cap-okf
cds build            # writes gen/okf
cds add okf          # scaffolds okf/ for curated knowledge
```

```json
"cds": {
  "okf": {
    "serve": {
      "static": false,
      "mcp": false
    },
    "[development]": {
      "serve": { "static": "/okf", "mcp": { "plugin": "auto", "as": ["resources", "tools"] } }
    }
  }
}
```

Nothing is served unless you turn it on. With `mcp` on, cap-okf finds the MCP plugin your app uses; `resources` publishes each concept as an `okf://` resource (`@gavdi/cap-mcp`), `tools` adds a read-only `OkfService` that either plugin exposes as query tools. Authorization rules are only shown to authenticated requesters.

## Contributing

See `CONTRIBUTING.md` and `docs/GOVERNANCE.md`. Licensed under Apache-2.0.
