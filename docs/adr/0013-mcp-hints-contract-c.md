# 0013. Contract C, client side: instructions and tool notes through `mcp:hints`

- Status: Proposed
- Date: 2026-11-17
- Deciders: Simon Vestergaard Laursen
- Proposed by: Claude Code (benchmark brief m2, task 8)
- Relates to: ADR-0006 and ADR-0010 (Contracts A and B), ADR-0012; `@gavdi/cap-mcp` ADR 0014
  ("Hints from code", proposed, branch `feat/benchmark-m2-improvements`, commit `83e6d69`)

## Context

Agents use the app's knowledge only when something tells them that it exists and when it
applies. Where nothing hinted at hidden meaning (a field that looks obvious but must not be
used), no agent ever looked. The two texts every agent reads are the MCP server's
`instructions` and each tool's `description`. cap-okf can't write either: the app owns its
annotations and `cds.mcp.instructions`, and ADR-0004 forbids touching `cds.mcp`.

`@gavdi/cap-mcp` now emits `mcp:hints` once on `served`, after `mcp:resources`, with a registry
(contract version 1):

```ts
interface HintRegistry {
  readonly contractVersion: 1;
  addInstructions(p: { id: string; text(ctx): string | undefined | Promise<string | undefined> }): void;
  addToolNotes(p: { id: string; note(target: { tool: string; service: string; definition: string;
    kind: "entity" | "action" | "function" }, ctx): string | undefined | Promise<string | undefined> }): void;
}
// ctx = { user, tenant?, locale? }; instructions are cut at 1,500 characters, a note at 400.
```

Listeners register synchronously; providers are called per request inside `cds.context`.

## Options considered

1. **Ask apps to write the hints themselves** (annotations, instructions file). Nothing to build,
   but nobody does it, and it can't be filtered per user.
2. **Listen for `mcp:hints`** and answer from the bundle, per user. Small, opt-out per setting,
   and in line with ADR-0004 (no import, met through a CAP event).

## Decision

Option 2.

- cap-okf subscribes to `mcp:hints` at plugin load (as for `mcp:resources`) and is told at
  bootstrap what to serve. Active only when `cds.okf.serve.mcp` is on with `@gavdi/cap-mcp`.
  If the event never arrives by `listening`, one line at debug level; nothing else changes.
- **Instructions** (`cds.okf.serve.mcp.instructions`: `true` (default) | `false` | a string that
  replaces the default). The default, in three sentences: this app publishes its business
  knowledge (terms, codes, calculations, rules) as OKF notes; read the index before answering a
  question that uses a business term or code, or before calling an action; how to read it on
  the channels that are on (`OkfService_getIndex`, `okf://<namespace>/index.md`). Nothing for a
  caller who doesn't meet `cds.okf.serve.mcp.requires`.
- **Tool notes** (`cds.okf.serve.mcp.pointers`: `true` (default) | `false`). A tool whose CDS
  definition a curated note links to gets one line built only from the notes' own titles, paths
  and descriptions: `Business knowledge: Shipping KPIs (guides/shipping-kpis.md): <description>`.
  - The definition is found through the generated concept's `resource: cds:<name>`.
  - Several notes are joined with `; `, most specific first: notes linking to the definition
    itself, then, for a bound action or function, notes linking to its entity; in path order
    within each group.
  - Under 400 characters: descriptions are dropped first (the least specific note's first), then
    whole notes from the end.
  - Filtered per user (ADR-0012): only notes the caller may see; nothing for a caller who
    doesn't meet `requires`.
  - Never for `OkfService`'s own tools.
- Provider id `cap-okf` for both kinds.

## Consequences

- Agents learn from the server's instructions that knowledge exists, and from a tool's own
  description which note applies to it.
- cap-okf answers a note per tool per request; it answers from a map built once per reader view,
  so a request costs one lookup per tool.
- With `instructions: false` and `pointers: false` nothing is registered.
- Depends on an unreleased `@gavdi/cap-mcp` contract (their ADR 0014, proposed). Older versions
  just don't emit the event.
