# Benchmark brief m2: what changed

- Branch: `feat/benchmark-m2-improvements`, from `431b85d`
- `@gavdi/cap-mcp` built against: `../cap-mcp-v2`, branch `feat/benchmark-m2-improvements`,
  commit `83e6d69` ("mcp:hints: instructions and tool notes from code (ADR 0014)"); its
  `lib/` build already contained `mcp:hints`, so Contract C is tested end to end, not only
  against a fake.
- Decisions: [ADR-0012](../adr/0012-agent-facing-knowledge.md) and
  [ADR-0013](../adr/0013-mcp-hints-contract-c.md), both Proposed.

## What changed

1. **Per-role visibility.** A concept MAY declare `requires:` (a role or a list). Every channel
   (static route, MCP resources, MCP tools, the hints) now reads through one per-reader view
   (`src/serve/reader-view.ts`). For a reader without one of the roles, the concept does not
   exist:
   - it isn't in `Index`, `getIndex`, `index.md` or `searchConcepts`, and resource completion
     doesn't offer it;
   - `getConcept`, the resource template and the static route answer as for an unknown path;
   - other concepts lose their links to it, and their list entries for it;
   - it isn't in related blocks, Business knowledge sections or tool notes;
   - generated indexes are rebuilt from what the reader sees, so counts are theirs;
   - a generated folder index whose concepts are all hidden is gone too.

   The `requires` key reaches authenticated readers only.
2. **Tool descriptions.** `OkfService`'s `@description`s now say:
   - what is there: meanings of terms and codes, KPI and calculation definitions, rules for
     actions, fields not to use;
   - when to read it: before filtering on a code or status field, computing a named figure, or
     calling an action.

   Each is under 400 characters.
3. **Outline first.**
   - The generated root `index.md` lists every curated note with title, path and description,
     then folds `model/` into one line.
   - New `getIndex(folder?)` returns exactly what `okf://<namespace>/index.md` returns for the
     same reader.
   - `Index` and `bundleInfo` are `@mcp: false`: they're still in the service, but not on the
     tool list.
4. **Search.**
   - Matches any word, case-insensitively, with plural folding, CamelCase split and prefix
     matching (at half weight); stop words are dropped.
   - Searches title, tags and `aliases`, description, then body and path, ranked in that order.
     Ties go by words found, then curated first, then path.
   - Never empty: with no match, the curated outline with `matched: false`.
   - `type`, `tag`, `top` and the limit of 100 are kept.
5. **Related concepts.** A concept read on either MCP channel ends with the visible concepts it
   links to: curated first, at most 10. The list sits between
   `<!-- okf:related:start -->` and `<!-- okf:related:end -->`, and is the same on both channels.
6. **Generated concepts.**
   - One concept per entity as the service exposes it: projection sources are no longer
     exported by default. Projections still inherit their texts from their sources.
   - `@description` (else the doc comment, else the source element's) goes into element and
     parameter tables.
   - A "Business knowledge" section lists the curated notes that link to the concept, filtered
     per reader when served.
   - The Authorization section and the associations are unchanged.
7. **Knowledge lint.** `src/core/lint.ts` produces warnings only:
   - K1: a note without tags.
   - K2: a note without a link into `model/`.
   - K3: an entity with code-like elements that no note links to.

   `lintBundle()` adds W1 (a curated note without `description`) and W4 (a broken link).
   `cds build` reports K1–K3, and a bundle generated at startup logs the whole lint once.
8. **Contract C** (`mcp:hints`, client side).
   - The listener is registered at plugin load, with no import of cap-mcp. If the event never
     arrives, one debug line.
   - Instructions: a three-sentence default, naming the channels that are on.
   - Tool notes: one line built from each linked note's title, path and description, most
     specific first, at most 400 characters (descriptions are dropped before titles), filtered
     per user.
   - Never on `OkfService`'s own tools. Active only when `serve.mcp` is on with
     `@gavdi/cap-mcp`.
9. **Defaults.**
   - `serve.mcp: true` with `@gavdi/cap-mcp` now means both channels.
   - One fixed index plus one template stays (ADR-0010 already said so; the code already did it).

## New config keys

| Key | Values | Default |
| --- | --- | --- |
| `cds.okf.projectionSources` | `false`, `true` | `false` |
| `cds.okf.serve.mcp.related` | `false`, `true` | `true` |
| `cds.okf.serve.mcp.instructions` | `true`, `false`, a string | `true` |
| `cds.okf.serve.mcp.pointers` | `false`, `true` | `true` |

Changed default: `cds.okf.serve.mcp: true` with `@gavdi/cap-mcp` → `as: ["resources", "tools"]`.
All of them are checked: an unknown key gets a warning; a wrong value is an `[okf]` setup error.

## Tools channel: final tool names

| Tool | Purpose |
| --- | --- |
| `OkfService_getIndex` | The Markdown outline (or a folder's index), as the index resource gives it |
| `OkfService_searchConcepts` | Any-word search; `ConceptSummary` rows with `matched` |
| `OkfService_getConcept` | One concept, followed by the related block |

`OkfService.Index` and `OkfService.bundleInfo` are in the service, `@mcp: false`.

## Frontmatter keys

| Key | Where | Meaning |
| --- | --- | --- |
| `requires` | any concept (meant for curated notes) | One role or a list; only readers with one of them see the concept. An invalid value hides it from everyone. |
| `aliases` | any concept | Synonyms; `searchConcepts` matches them with the weight of tags. |

## Deviations from the brief, with reasons

1. **The ADRs weren't edited in place.**
   - The brief asks to update ADR-0003, amend ADR-0004 and update ADR-0006's Contract B.
     ADR-0003, ADR-0004 and ADR-0010 are Accepted. GOVERNANCE and the project hook make
     Accepted ADRs immutable for agents ("supersede them with a new ADR").
   - So ADR-0012 and ADR-0013 (Proposed) hold the decisions, plus ready-to-paste amendment
     notes for ADR-0003, ADR-0004 and ADR-0010.
   - ADR-0006 is already Superseded by ADR-0010, which is where Contract B and
     `templateThreshold` live today. ADR-0006 only got a one-line pointer to ADR-0012 and
     ADR-0013, which the brief asked for.
2. **`bundle_hash` isn't in the index frontmatter.**
   - The brief assumes it is there. OKF v0.2 §8 allows only `okf_version` in an index file's
     frontmatter (the validator would fail the build with R3), so it was never added.
   - The hash stays available from `OkfService.bundleInfo()` in-process. It's no longer an MCP
     tool, so an MCP host can't get the hash any more: that is the cost of taking `bundleInfo`
     off the agent-facing list.
3. **The `Index` entity is off the MCP surface.** Its result isn't made lighter, because agents
   don't see it any more.
4. **No `cds` CLI command for the lint.** CAP has no extension point for a plugin's own command
   (ADR-0005), so it is a documented function plus warnings at build and at development startup.
   The brief allows this.
5. **Lint rules K1–K3 rather than five new rules.** "No description" and "broken link" are
   already W1 and W4 of the validator, which `cds build` reports. `lintBundle()` includes them;
   the build doesn't report them twice.
6. **The related block isn't on the static route.** The route serves the bundle's files as they
   are (filtered). The brief asks for the block on both MCP channels, and it is there.
7. **A bound action's tool notes include its entity's notes.**
   - A bound action has no concept of its own: it is a subsection of its entity. So its tool
     gets the notes linking to the action's own concept (for an unbound one), then the notes
     linking to its entity.
   - Notes are joined with `; `.
8. **Links to hidden concepts keep their text.** Inside another concept's text, a link to a
   hidden concept loses its target (also in code blocks) but keeps the words the author wrote.
   - An autolink to a hidden concept goes.
   - A list item whose first link is hidden goes as a whole, with its continuation lines.
   - A heading whose section empties this way goes too.

   The link text can repeat the hidden note's title, as in "the [margin rules](…)". Removing
   the author's prose would garble sentences. Authors should keep a restricted note's name out
   of open notes; ADR-0012 says so.
9. **Projections without exported sources** now open with just "Projection" (no source named).
   This follows task 2.6's rule that a concept never names a definition that isn't exported.
10. **Search ranks by field first.**
    - "Rank: title, then tags and aliases, then description, then body; more matching words rank
      higher" is read as: score per word by the best field it is in, summed.
    - So one word in the title outranks three in the description. More words rank higher within
      the same fields, and break ties.
11. **Search fallback keeps the filters.** With no match, the answer is the curated notes within
    the `type` and `tag` filters (or every concept within them, when none is curated). Filters
    that match nothing give an empty list: the brief keeps the filters, and an outline of other
    types would answer a different question.

## Golden files changed

`test/golden/bookshop` was regenerated (`npm run test:update-golden`):

- `model/sample/**` is gone: the projection sources aren't exported by default any more;
- projections no longer link their source;
- element descriptions appear (e.g. `createdBy`: "User's unique ID"; `summary`: its doc
  comment);
- the root and `model/` index counts are 10 instead of 13.

## Review

The `reviewer` agent read the whole branch diff. It found no way around the reader view: every
channel reads through it, and hidden and unknown paths give the same 404 on every channel. It
reported ten findings; all were fixed (with tests) or recorded as decisions:

1. A projection element took another element's description by name, through an alias. Fixed:
   the lookup follows the projection's columns.
2. In `cds watch`, one broken curated note left the generated indexes unrecognised, so hidden
   notes stayed in their counts. Fixed: the indexes are rebuilt after files with errors are left
   out.
3. An unbound action of a namespaced service took the service's notes. Fixed.
4. The search fallback ignored the `type` and `tag` filters. Fixed (deviation 11).
5. Links to hidden concepts in code blocks, autolinks, and a removed item's continuation lines
   stayed. Fixed; the link text stays (deviation 8).
6. A hand-written folder index whose notes were all hidden was still served. Fixed.
7. Ranking by field before word count. Kept (deviation 10).
8. The K3 lint misread descriptions that say "values:", and escaped pipes. Fixed.
9. The tool-note cut could split a character. Fixed: the cut counts code points.
10. The bare "Projection" lead line. Kept (deviation 9).

## Test results

`npm ci`, `npm run build`, then `npm run check` (format, typecheck, lint, every Jest project,
with the cap-mcp-v2 build at `83e6d69` present, so the MCP contract suites ran and none were
skipped): 78 suites, 1295 tests, all passed; no lint warnings.
