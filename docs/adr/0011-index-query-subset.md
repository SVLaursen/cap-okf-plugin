# 0011. OkfService.Index answers the queries `@gavdi/cap-mcp` sends

- Status: Accepted (Simon Vestergaard Laursen, 2026-11-17)
- Date: 2026-11-17
- Deciders: Simon Vestergaard Laursen
- Proposed by: Claude Code (task 4.5, step 2a review)
- Supersedes: the bullet "`Index` answers real queries" in ADR-0010, Contract B. The rest of
  ADR-0010 is unchanged.

## Context

ADR-0010 (Accepted) carried over ADR-0006's subset for the in-memory READ handler on
`OkfService.Index`: `count`; comparisons and `contains` on `path`, `type`, `title`, `tags`;
`orderBy`; paging; `columns`; and it rejects `search` (use `searchConcepts`), `one`,
`groupBy`/`having`, expands, functions and aggregates.

That subset was written before anyone read `@gavdi/cap-mcp` v2. Task 4.5 read its source
(`src/executor/reads.ts`, `src/executor/arguments.ts`) and a review checked, with a probe on
`@sap/cds` 10.2.2, what reaches a custom `on READ` handler:

- **The count query** that comes with every `OkfService_Index_query` call sends `one: true` with
  `columns: [count(*) as total]`.
- **The get tool** (`OkfService_Index_get`) sends `one: true` with the key as a filter on `from`.
- **Free text (`q`)** becomes `search` over every String column of `Index` in `where`.
- **Filters** are comparisons, `in`, `is (not) null`, `contains`, `startswith` and `endswith`, on
  any String column, joined by `and`.
- **CAP adds** a default `limit` (without offset) and the key to `orderBy` (marked `implicit`).

Following ADR-0010's subset would make the count query, the get tool and free text fail, so the
`Index` tools would be unusable. The reason for refusing `search` in ADR-0006 was that a search
over the concept's body could probe the authorization section (ADR-0003). `Index` has no body:
its six columns are `path`, `type`, `title`, `description`, `tags` and `links`, all built from
text the reader may see.

`@cap-js/mcp` is parked (maintainer decision, 2026-11-17); its query tool can send other shapes
(CQL with aggregates, `groupBy`, `SELECT.search`), which ADR-0010's subset had in mind.

## Options considered

1. **Keep ADR-0010's subset.** Simple to state, but `@gavdi/cap-mcp`'s `Index` tools don't work:
   every query call fails on its count query, every get fails on `one`.
2. **Answer exactly what `@gavdi/cap-mcp` sends, refuse the rest.** The tools work; anything
   else (another plugin, OData) gets a clear 400 rather than a wrong answer.
3. **Answer any CQN generically**, e.g. by putting the rows into an in-memory database. Covers
   every plugin, but adds a moving part for shapes nobody sends today.

## Decision (proposed)

Option 2. The READ handler on `OkfService.Index` (`src/serve/mcp/index-query.ts`) answers:

- `from`: the entity, or the entity with a key filter (the get tool); anything else is refused;
- `columns`: plain refs to the six columns, or `count(*) as total`;
- `where`: `=`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `is null`, `is not null`, `contains`,
  `startswith`, `endswith`, and `search` over one column or a list of them, joined by `and`, on
  all six columns;
- `orderBy`, `limit` (rows, offset) and `one`.

Semantics:

- `contains`, `startswith`, `endswith` and `search` ignore case; comparisons compare by code
  unit, as the rest of cap-okf sorts.
- With null, comparisons are never true, except `!=`, which is true when exactly one side is
  null, as CAP's databases treat it (`IS DISTINCT FROM`). `<>` is refused: CAP gives it plain SQL
  meaning, and no tool sends it.

Everything else (`or`, `not`, `groupBy`, `having`, `distinct`, `SELECT.search`, expands, other
functions, sub-selects, paths in `from`) is refused with a 400 and the message
`[okf] OkfService.Index — <what> isn't supported.` plus a fix line naming what works and
`searchConcepts`.

## Consequences

- `@gavdi/cap-mcp`'s `OkfService_Index_query` and `OkfService_Index_get` work, including free
  text; step 2b and the contract suite (4.1, 4.8) test them through the plugin.
- Searching `Index` can't reach a concept's text, so ADR-0003 still holds; the rows are built
  from text already filtered for the reader (step 2b), so `links` never names a concept linked
  only from an authorization section.
- When `@cap-js/mcp` comes back, its query shapes need checking against this subset; a new ADR
  extends it if needed.
- ADR-0010's Contract B bullet "`Index` answers real queries" is superseded by this ADR; mark it
  so in ADR-0010 when this is accepted (the maintainer edits Accepted ADRs).
