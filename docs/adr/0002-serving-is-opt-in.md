# 0002. Serving is opt-in and chosen by the app developer

- Status: Accepted
- Date: 2026-11-09
- Deciders: Simon Vestergaard Laursen

## Context

Apps differ in how they want to expose knowledge. Some want a static route, some want MCP, some both, some neither.

## Decision

The plugin always generates the bundle at build time, but serves nothing by default. The developer turns on each channel under `cds.okf.serve`:

- `static: false | true | "<path>"` (true means `/okf`)
- `mcp: false | true` — the shape of this option is refined by ADR-0004 (both MCP plugins, plugin choice and channels); the opt-in rule here is unchanged

Both settings honour CAP profiles.

## Consequences

No accidental exposure. Each server is a separate module behind `BundleSource`, so adding or removing a channel never touches the others. Fiori authoring (Phase 5) is planned on the same basis.
