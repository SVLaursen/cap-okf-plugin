# 0013. Contract C, client side: instructions and tool notes through `mcp:hints`

- Status: Proposed
- Date: 2026-11-17, revised 2026-11-18 (round 2 of the benchmark brief)
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

A second evaluation (2026-11-18) added, in general terms:

- One signal is enough. Directive OKF tool descriptions, server instructions or tool notes each
  raised how often agents read the knowledge by about the same amount; all three together added
  nothing. Tool notes are by far the most expensive: they are added to every tool they apply to,
  on every request; the instructions are a few sentences, once.
- With only generated concepts to read, "read this first" did harm: agents obeyed, made many more
  calls, and answered worse than without OKF.
- Plain reads of one record by key paid for an index read they didn't need.
- Agents that read nearby notes gave confident answers for a figure no note defines; told that the
  notes have gaps, they say it isn't defined.
- Knowledge the question doesn't point to (who may see what) was almost never read: it has to be
  pushed.

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
- **Per user, only with curated notes** (`cds.okf.serve.mcp.signals`: `"auto"` (default) |
  `"always"`). With `"auto"`, a caller who sees no curated note (none in the bundle, or none left
  after the per-role filter of ADR-0012) gets no instructions, no tool notes and the neutral OKF
  tool descriptions. `"always"` gives every caller who meets `requires` the signals.
- **Instructions** (`cds.okf.serve.mcp.instructions`: `true` (default) | `false` | a string that
  replaces the default). The default, under 500 characters, ties reading to need: read the index
  (`OkfService_getIndex`, `okf://<namespace>/index.md`, whichever channels are on) when a request
  uses a business term, a code or status value, a named figure or KPI, a time or unit convention,
  or asks for an action; a plain read of one record by key or name doesn't need it. It also says
  the notes have gaps: if a term, figure or rule isn't defined in the notes or the data, say that
  it isn't defined instead of assuming a definition. Nothing for a caller who doesn't meet
  `cds.okf.serve.mcp.requires`.
- **Pinned notes.** A curated note MAY set `pinned: true`. The instructions (the default or the
  app's own text) end with the pinned notes the caller sees: title, path and description, at most
  three, the first in index (path) order, each line at most 300 characters, the whole text within
  the contract's 1,500. More than three pinned notes in the bundle: one warning at startup. Lint
  K4 warns about a pinned note without a description. The root index lists pinned notes first
  (ADR-0012).
- **OKF tool descriptions.** `srv/okf-service.cds` holds neutral descriptions (what each tool
  returns). The directive part (when to read; for `getIndex` also the gap sentence; for
  `getConcept` that linked notes often hold the other half of an answer) is a tool note on
  `OkfService`'s own tools, given per caller by the rule above. With `signals: "always"`, or
  through `@cap-js/mcp` (no `mcp:hints`), it is added to the descriptions in the model instead,
  for everyone. Neutral and directive part together stay at about 400 characters.
- **Tool notes** (`cds.okf.serve.mcp.pointers`: `false` (default) | `"short"` | `true`). A tool
  whose CDS definition a curated note links to gets one line built only from the notes' own
  titles and paths (`"short"`: `Business knowledge: Shipping KPIs (guides/shipping-kpis.md);
  Units (guides/units.md)`), or with their descriptions (`true`:
  `Business knowledge: Shipping KPIs (guides/shipping-kpis.md): <description>`).
  - The definition is found through the generated concept's `resource: cds:<name>`.
  - Several notes are joined with `; `, most specific first: notes linking to the definition
    itself, then, for a bound action or function, notes linking to its entity; in path order
    within each group.
  - Under 400 characters: descriptions are dropped first (the least specific note's first), then
    whole notes from the end.
  - Filtered per user (ADR-0012): only notes the caller may see; nothing for a caller who
    doesn't meet `requires`.
  - Never pointers for `OkfService`'s own tools (they get the directive part only).
- Provider id `cap-okf` for both kinds.

## Consequences

- By default an agent gets one cheap signal, the server instructions, plus the directive tool
  descriptions when the tools channel is on; tool notes are for hosts that ignore server
  instructions.
- A caller with no curated note to read is never told to read first.
- Agents are told to say when something isn't defined, and get the pinned notes without asking.
- cap-okf answers a note per tool per request; it answers from a map built once per reader view,
  so a request costs one lookup per tool.
- With `instructions: false`, `pointers: false` and the tools channel off (or the directive in the
  model), nothing is registered.
- An older `@gavdi/cap-mcp` without `mcp:hints` gets neither instructions nor the directive part
  of the tool descriptions; `signals: "always"` puts the directive part into the model for it.
- Depends on an unreleased `@gavdi/cap-mcp` contract (their ADR 0014, proposed). Older versions
  just don't emit the event.

## Amendment 2026-11-25 (ADR-0014)

`@gavdi/cap-mcp` accepted its ADR 0014 on 2026-11-25 and, with its ADR 0017, added `skills` to the
context every provider gets (contract version still 1):

```ts
// ctx = { user, tenant?, locale?, skills }
interface HintSkill { uri: string; name: string; description: string } // sorted by URI
```

- **Skills after the pinned notes.** The instructions (the default or the app's own text) end with
  the pinned notes, then a block listing the skills the request serves, one line each with the
  skill's name, URI and description and the curated notes the caller sees that name it
  (frontmatter `skills:`). At most ten skills; pinned notes keep priority (skills get only the
  room left), and inside a skill's line the description goes before its notes; the whole text
  stays within 1,500 characters. No skills, no
  block: the text is as before. Switch: `cds.okf.serve.mcp.skills` (default `true`). Details in
  ADR-0014.
- **Same callers.** The block goes only to callers who get the instructions under the rules above
  (`requires`, `signals`).
- **`skills` missing** (an older `@gavdi/cap-mcp`) or malformed counts as none.
- **Contract version.** The `mcp:hints` listener registers nothing, with one `[okf]` warning, when
  `contractVersion` isn't 1 (also for `mcp:resources`, ADR-0014).
