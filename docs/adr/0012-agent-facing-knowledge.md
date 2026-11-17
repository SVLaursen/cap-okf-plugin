# 0012. Knowledge agents find, enter lightly, and see per role

- Status: Proposed
- Date: 2026-11-17
- Deciders: Simon Vestergaard Laursen
- Proposed by: Claude Code (benchmark brief m2, branch `feat/benchmark-m2-improvements`)
- Amends: ADR-0003 (per-role visibility), ADR-0004 point 1 (`true` with `@gavdi/cap-mcp`),
  ADR-0010 Contract B (tool surface, search) and its shared rules. ADR-0003, ADR-0004 and
  ADR-0010 are Accepted and can't be edited by agents; the amendment notes for them are at the
  end, ready to add.

## Context

An evaluation of agents working against a CAP app found that curated OKF notes help a lot when
the agent reads them, and that it reads them about half the time:

- agents opened OKF in about 46% of runs through tools and 16% through resources, and only when
  the question sounded like it needed a definition;
- 47% of `searchConcepts` calls found nothing (91% with four or more words): every word had to
  match, and words in a note's text or synonyms never did;
- the `Index` entity answered with about 6,700 characters of flat JSON for 32 concepts, where
  `index.md` says the same in about 1,200;
- generated concepts alone helped nothing: they repeat the schema the MCP tools already carry,
  come twice per entity (database entity and service projection), and left out element
  descriptions;
- agents read one right note and missed the second one it links to;
- `Index_get` and `bundleInfo` were never called in 352 runs;
- every signed-in user could read every curated note, so a confidential note was listed, with
  title and description, to users who shouldn't know it exists.

## Options considered

1. **Keep the surfaces and improve descriptions only.** Cheap, but leaves the empty searches,
   the heavy index, the doubled concepts and the visibility gap.
2. **One reader view under every channel, plus a smaller, outline-first tool surface.** Every
   rule (authorization sections, per-role visibility) is applied once; channels only read.
3. **Per-role visibility in each channel.** Easy to start, easy to get wrong on one surface.

## Decision

Option 2.

### Per-role visibility (amends ADR-0003)

- A concept MAY declare `requires:` in its frontmatter: one role or a list. A reader sees it when
  `user.is(role)` holds for one of them, CAP's pseudo-roles included. No `requires` means
  ADR-0003 as before. A value that isn't a role or a list hides the concept from everyone.
- For anyone else the concept doesn't exist: it isn't listed, found, read, completed or counted,
  other concepts' links to it lose their target, also in code blocks; an autolink to it goes; a
  list item that links to it goes as a whole, with its continuation lines, and a heading whose
  section empties with it. A folder index (generated or hand-written) whose concepts are all
  hidden goes too. Generated `index.md` files are built again from what the reader sees, so
  counts are theirs; a curated `index.md` only loses its entries.
- A hidden path and an unknown one give the same not-found answer on every channel.
- The `requires` key itself is authorization detail: only authenticated readers get it.
- One pure module (`src/serve/reader-view.ts`) builds the view; the static route, the
  resources channel, the tools channel and the hints all read through it, one view per bundle
  and per kind of reader (authenticated or not, and which of the bundle's roles they have).

### Outline first (the root index, `getIndex`)

- The generated root `index.md` lists every curated concept (at any depth) with title, path and
  description, by type, then folds `model/` into one line ("10 concepts: …"). Other folders keep
  the layout they had.
- `OkfService.getIndex(folder?)` returns exactly the Markdown the reader gets from
  `okf://<namespace>/index.md` (or a folder's own index).

### Tool surface (revises ADR-0010 Contract B)

- Agent-facing tools: `getIndex`, `searchConcepts`, `getConcept`
  (`OkfService_getIndex`, `OkfService_searchConcepts`, `OkfService_getConcept`).
- `Index` and `bundleInfo` stay in the service for code in the app, marked `@mcp: false`
  (`@gavdi/cap-mcp`'s way to keep a definition off the tool list). The Index query subset of
  ADR-0011 is unchanged. `bundleHash` is not put into `index.md`: OKF v0.2 §8 allows only
  `okf_version` there. `okf_version` stays in the root index's frontmatter.
- `searchConcepts` returns `ConceptSummary` rows (`path`, `type`, `title`, `description`, `tags`,
  `matched`), without `links`.
- Descriptions say what knowledge is there (meanings of terms and codes, KPI and calculation
  definitions, rules and preconditions for actions, fields not to use) and when to read it
  (before filtering on a code or status field, computing a named figure, or calling an action),
  each under 400 characters, as instructions to an agent.

### Search (revises ADR-0010 Contract B)

- Any word, case-insensitive, simple plural folding, CamelCase split, a word of four letters or
  more also matching the start of a longer one (at half weight); stop words left out unless
  nothing else is left.
- Fields: title; tags and the new optional `aliases:` list; description; then text and path.
  Ranked by score (each word counted once, where it is found best: title 8, tags and aliases 4,
  description 2, text and path 1), then words found, then curated before generated, then path.
  So one word in the title outranks three in the description: the field order comes first.
- The text searched is the reader's own text (authorization sections only for authenticated
  readers), so ADR-0010's "never the body" rule is no longer needed to stop probing.
- Never empty for a text: with no match, the curated concepts in index order, `matched = false`
  (every concept when there are no curated ones). The `type` and `tag` filters still apply, so
  filters that match nothing give an empty answer.
- `type`, `tag`, `top` (default 20, at most 100) as before.

### Related concepts

A concept read over MCP (both channels, the same text) is followed by a block between
`<!-- okf:related:start -->` and `<!-- okf:related:end -->` that lists the visible concepts it
links to: title, path, description; curated first; at most ten. Config
`cds.okf.serve.mcp.related` (default `true`). The static route serves files as they are.

### Generated concepts

- `include: "services"` no longer follows a projection to its source: one concept per entity as
  the service exposes it. `cds.okf.projectionSources: true` brings the source concepts back. A
  projection still takes its description and doc comment from down its source chain (anything
  not `@okf: false`), without naming the source.
- Element and parameter tables show each one's `@description` (else its doc comment, else that
  of the element it is selected from, following the projection's columns: `state as status`
  takes `state`'s; an expression takes none).
- A "Business knowledge" section lists the curated notes that link to the concept (outside
  their authorization sections), before the Authorization section; servers drop entries the
  reader may not see.

### Knowledge lint

Warnings only (`src/core/lint.ts`): K1 a curated note without tags; K2 a curated note that
links to no generated concept; K3 an entity with code-like elements (a short string, a list of
values, or a name ending in type, status, code or kind) that no curated note links to.
`lintBundle()` adds the validator's W1 (curated notes) and W4 (broken links). `cds build` reports
K1–K3 with its other warnings; a bundle generated at startup logs the whole lint once. There's
no `cds` command for it: CAP has no extension point for a plugin's own CLI command (ADR-0005).

### Defaults (amends ADR-0004 point 1)

`cds.okf.serve.mcp: true` with `@gavdi/cap-mcp` means `["resources", "tools"]`; with
`@cap-js/mcp` still `["tools"]`. An `as` with nothing usable left falls back to the same.

### Resource list (ADR-0006 vs. ADR-0010)

ADR-0006's `templateThreshold` (one fixed resource per concept up to 50) was already dropped by
ADR-0010: one fixed `index.md` plus one template. That stays: a short resource list is better
for agents and for any bundle size, and the code already does it.

## Consequences

- Agents get an outline first, find notes with ordinary questions, and see the next note to read.
- A confidential note exists only for the roles that may read it, on every surface.
- Generated bundles are smaller; golden files changed (no `model/<db namespace>/` concepts,
  projections no longer link their source, element descriptions appear).
- The `Index` entity and `bundleInfo` are no longer MCP tools. A host that pinned them must call
  the service in-process or use `getIndex`.
- New config keys: `cds.okf.projectionSources`, `cds.okf.serve.mcp.related`; new frontmatter keys
  `requires` and `aliases`. The README documents them.
- Every channel now builds one view per kind of reader; with many distinct `requires` roles that
  is up to 2 × 2^n views per bundle (n = roles the bundle names), each built on first use.

## Amendment notes (for the maintainer to add; the ADRs are Accepted)

### For ADR-0003

> ### Amendment 2026-11-17 (ADR-0012)
>
> A concept may also declare `requires:` (a role or a list of roles) in its frontmatter. It then
> exists only for readers who have one of them: every server leaves it out of listings, indexes,
> search, links, related blocks, Business knowledge sections and tool notes, and answers a read
> of it as not found. The `requires` key, like the authorization section, reaches authenticated
> readers only. The filter lives in `src/core/filter.ts` (sections) and `src/serve/reader-view.ts`
> (per-role visibility), which every server reads through.

### For ADR-0004

> ### Amendment 2026-11-17 (ADR-0012)
>
> `true` means `{ "plugin": "auto" }` with the plugin's default channels: `["resources",
> "tools"]` for `@gavdi/cap-mcp`, `["tools"]` for `@cap-js/mcp`. The object form gains
> `related`, `instructions` and `pointers` (ADR-0012, ADR-0013).

### For ADR-0010

> ### Amendment 2026-11-17 (ADR-0012, ADR-0013)
>
> Contract B's agent-facing tools are `getIndex(folder?)`, `searchConcepts(text, type, tag,
> top)` and `getConcept(path)`; `Index` and `bundleInfo` are `@mcp: false`. `searchConcepts`
> matches any word, also in the reader's text, and returns `ConceptSummary` rows. A concept read
> on either channel ends with the related-concepts block. Contract C (`mcp:hints`) is ADR-0013.
