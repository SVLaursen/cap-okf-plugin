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

## Round 2

Maintainer brief of 2026-11-18, on the same branch: cheaper signals, several notes per read,
honest gaps. Decisions are in the same two ADRs, revised in place (both still Proposed):
[ADR-0012](../adr/0012-agent-facing-knowledge.md) and
[ADR-0013](../adr/0013-mcp-hints-contract-c.md). The `@gavdi/cap-mcp` build is unchanged
(`83e6d69`).

### What changed

1. **Tool notes are opt-in.** `cds.okf.serve.mcp.pointers` is `false` by default; `"short"`
   gives `Business knowledge: <title> (<path>); <title> (<path>)`, `true` the round 1 form with
   descriptions. The README explains the trade-off: the server instructions are the cheap
   default, tool notes are for hosts that ignore server instructions.
2. **Several notes at once, neighbours first.**
   - `getConcept` takes `path` (as before) or `paths` (up to 5; with both, `path` first, each
     once). With `paths` the answer is the concepts in the order asked, each under a line
     `<!-- okf:concept <path> -->`. A hidden or unknown path gets the same not-found text as a
     single read, in its place; the others still come. More than 5, or no path, is a 400. A call
     with `path` alone answers exactly as before (a 404 when it isn't there).
   - Directly under a concept's title (when the body's first non-blank line is a `# ` heading;
     otherwise at the start of the body, so never inside an authorization section or under a
     later section), a marked line names the visible curated notes it links to:
     `Read together with: Storage bins (guides/storage-bins.md), …` (at most ten), between
     `<!-- okf:together:start -->` and `<!-- okf:together:end -->`. Same on both MCP channels,
     filtered per user, switched by `serve.mcp.related`.
   - **Decision: the related block at the end is dropped.** It didn't make agents read the
     second note, its generated entries repeat links that are already in the text, and it cost
     tokens on every read.
   - The `getConcept` description says that several paths can be read in one call and that
     linked notes often hold the other half of an answer.
3. **No "read this first" without curated notes.** Per user: a caller who sees no curated note
   (none in the bundle, or none left after the role filter) gets no server instructions, no tool
   notes, and neutral OKF tool descriptions. To make that possible per user, the descriptions in
   `srv/okf-service.cds` are now neutral (what each tool returns), and the directive part is a
   tool note on `OkfService`'s own tools (`src/serve/mcp/tool-texts.ts`), given only to callers
   who see curated notes. `serve.mcp.signals: "always"` forces the signals on; the directive part
   then goes into the model's descriptions for everyone.
4. **Conditional directive.** The instructions and the tool descriptions tie reading to need (a
   business term, a code or status value, a named figure or KPI, a time or unit convention, an
   action) and say a plain read of one record by key or name doesn't need it.
5. **Gaps.** The default instructions and the `getIndex` description say the notes don't cover
   everything, and to say a term, figure or rule isn't defined instead of assuming one.
6. **Pinned notes.** A curated note may set `pinned: true`.
   - The root index lists pinned notes first, under `# Pinned` (not again under their type).
   - The server instructions (the default or the app's own text) end with
     `Pinned notes, which always apply:` and one line per pinned note the caller sees:
     `- <title> (<path>): <description>`; at most 3, the first in index (path) order, each line at
     most 300 characters, the whole text within the contract's 1,500.
   - More than 3 pinned notes in the bundle: one warning at startup naming the 3 that are listed.
   - The role filter applies: a pinned note with `requires` is listed only for users who may see
     it.
   - Lint K4: a pinned note without a description.
7. **ADRs and docs.** ADR-0012 (`getConcept` paths, "Read together with", pinned first in the
   outline) and ADR-0013 (defaults, the per-user rule, conditional and gap wording, pinned notes)
   revised; amendment notes for ADR-0003, ADR-0004 and ADR-0010 updated; README configuration
   table, tool table and frontmatter keys (`pinned` beside `requires` and `aliases`).

### Changed defaults

| Key | Round 1 | Round 2 |
| --- | --- | --- |
| `cds.okf.serve.mcp.pointers` | `true` | `false` |
| OKF tool descriptions | directive for everyone | neutral; the directive part per user, only with curated notes |
| `cds.okf.serve.mcp.related` | block of related concepts at the end | "Read together with" line under the title |

### New config values and frontmatter keys

| Key | Values | Default |
| --- | --- | --- |
| `cds.okf.serve.mcp.pointers` | `false`, `"short"`, `true` | `false` |
| `cds.okf.serve.mcp.signals` (new) | `"auto"`, `"always"` | `"auto"` |
| `pinned` (frontmatter, curated notes) | `true` (anything else doesn't pin) | not pinned |
| `getConcept(paths)` (new parameter) | up to 5 bundle paths | — |

Lint rule K4 is new (warning).

### Default texts

Server instructions, with both channels on (491 characters plus the namespace; under 500 for a
namespace of up to 8 characters; with one channel the brackets name only `OkfService_getIndex` or
only the resource):

> This app defines its business terms, codes, named figures and action rules in OKF notes. When a
> request uses a business term, code or status value, named figure or KPI, time or unit
> convention, or asks for an action, first read the index (OkfService_getIndex or
> okf://&lt;namespace&gt;/index.md). A plain read of one record by key or name doesn't need it. The
> notes don't cover everything: if a term, figure or rule you need isn't defined in them or in the
> data, say it isn't defined instead of assuming one.

followed, when the caller sees pinned notes, by:

> Pinned notes, which always apply:<br>
> \- &lt;title&gt; (&lt;path&gt;): &lt;description&gt;

OKF tool descriptions **without curated notes** (the neutral texts in the model):

| Tool | Description |
| --- | --- |
| `OkfService_getIndex` | Returns the outline of this app's business knowledge as Markdown: curated notes with title, path and description, then the model in one line. |
| `OkfService_getConcept` | Returns notes or model concepts in full, as Markdown: path for one, or up to 5 paths at once, each under a line with its path. Paths come from getIndex or searchConcepts. |
| `OkfService_searchConcepts` | Finds notes and model concepts by any of your words, in titles, tags, synonyms, descriptions and text. Returns paths with title and description, best first. If no word is found, returns the outline of curated notes (matched = false). |

**With curated notes**, each is the neutral text followed by its directive part: as its own
paragraph (a tool note) through `@gavdi/cap-mcp`, or after a space in the model with
`signals: "always"` or `@cap-js/mcp`. Together 397, 396 and 369 characters (with the two line
breaks of a note).

| Tool | Directive part |
| --- | --- |
| `OkfService_getIndex` | Read it when a request uses a business term, code, status value, named figure or KPI, time or unit convention, or asks for an action, not for a plain read of one record by key. Notes have gaps: if what you need isn't defined there or in the data, say so. |
| `OkfService_getConcept` | Its "Read together with" line names linked notes that often hold the other half of an answer: read them all in your next call. Read the matching note before filtering on a code, computing a named figure or calling an action. |
| `OkfService_searchConcepts` | Use it when a request names a business term, code, status value or KPI you don't know, then read the paths it returns with getConcept. |

The index resource's description is neutral too (it no longer says "Start here").

### Deviations from the brief, with reasons

1. **The directive part of the OKF tool descriptions is a tool note on `OkfService`'s own
   tools.** The brief asks for neutral descriptions per user, but a CDS `@description` is the
   same for everyone, and `mcp:hints` can only add text, never replace it. So the model holds the
   neutral text and the directive part is added per caller through `mcp:hints`. The cost is what
   the round 1 descriptions already cost (the same text, now in two parts), not the cost of
   pointers. So with the defaults a tool-notes provider *is* registered with `mcp:hints`; it only
   answers for `OkfService`'s three tools, and the app's own tools get no note.
2. **Without `mcp:hints`, the descriptions are neutral.** An older `@gavdi/cap-mcp` gets neither
   instructions nor the directive part. `signals: "always"` puts the directive part into the
   model for such a host, for every user.
3. **`@cap-js/mcp` gets the directive descriptions in the model, for everyone.** It has no
   per-user hook, so the no-curated-notes rule can't apply there; it is the only signal that
   plugin can carry. (`@cap-js/mcp` is out of scope for this branch; this keeps round 1's
   behaviour for it.)
4. **"Forcing the signals on" is `signals: "always"`**, one switch for instructions, tool notes
   and the directive descriptions, rather than one per signal.
5. **ADR-0006 Contract B and ADR-0003 aren't edited.** ADR-0006 is Superseded by ADR-0010 (where
   Contract B lives today); ADR-0003 and ADR-0010 are Accepted and read-only for agents. The
   changes are in ADR-0012 and ADR-0013 (Proposed), with the amendment notes for ADR-0003,
   ADR-0004 and ADR-0010 updated for the maintainer to paste.
6. **Paths in the "Read together with" line and the pinned list are bundle paths**
   (`guides/storage-bins.md`, not `storage-bins.md`): the form `getConcept` takes.
7. **The custom instructions text is subject to the same per-user rule and gets the pinned
   list.** An app's own `instructions` string is about its OKF notes too, so a caller with no
   curated note doesn't get it either, and pinned notes are appended to it.
8. **"Index order" for the pinned list is path order,** the order of the `# Pinned` section.
9. **The startup warning for more than 3 pinned notes** is logged once, when serving through
   `@gavdi/cap-mcp` with instructions on (where the list is used), for the default tenant's
   bundle, counting every pinned note whatever its `requires`.
10. **Neutral descriptions for a user whose roles leave no curated note are tested with a fake
    `mcp:hints` registry (unit), not end to end.** The contract fixture has a curated note every
    reader sees; a fixture just for this would duplicate the app. The end-to-end suite checks the
    neutral-plus-directive form for a reader who sees notes, and no instructions for a caller
    without `requires`.
11. **A model built with one `signals` setting and served with another** is corrected at load:
    served with `"auto"`, a directive part baked in by the build is taken out again (it then
    comes per caller); served with `"always"`, it is added once.

### Review

The `reviewer` agent read the round 2 diff and found no leak of a hidden note through the new
surfaces (pinned list, "Read together with", several-path reads) and no way around the per-user
rule. Fixed, with tests:

1. The "Read together with" line could land inside an authorization section, or under a later
   section when the body didn't start with a title: it now goes only under a title that is the
   body's first line, else at the start of the body.
2. A CRLF file got mixed line ends: the added lines use CRLF too.
3. A model built with `signals: "always"` and served with `"auto"` gave the directive twice
   (deviation 11).
4. The getIndex and getConcept descriptions came to 418 characters: trimmed to under 400; the
   test now holds them to 400.
5. The getConcept directive said "read them in the same call", though the line is seen only
   after the call: now "read them all in your next call".
6. Weak tests: pinned order now uses titles in reverse path order; the 1,500 limit is tested with
   long app instructions, where a pinned note is left out; the outsider gets empty instructions.

Recorded rather than changed: `@cap-js/mcp` gets the directive in the model even for a bundle
without curated notes (deviation 3), an older `@gavdi/cap-mcp` gets no signal (deviation 2), the
end-to-end gap (deviation 10), and the size of the change (about 950 lines without docs; the
branch stays local).


### Test results (round 2)

`npm ci`, `npm run build`, then `npm run check` (format, typecheck, lint, every Jest project,
with the cap-mcp-v2 build at `83e6d69` present, so the MCP contract suites ran and none were
skipped): 79 suites, 1343 tests, all passed; no lint warnings. No golden file changed.
