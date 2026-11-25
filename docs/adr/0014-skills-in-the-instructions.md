# 0014. Skills in the instructions, and notes for skills

- Status: Proposed
- Date: 2026-11-25
- Deciders: Simon Vestergaard Laursen
- Proposed by: Claude Code (plan task dr.0, "Dual release with `@gavdi/cap-mcp` 2.0")
- Amends: ADR-0013 (Proposed; its amendment is written into it). Relates to ADR-0004 (one
  interface, no imports, never `cds.mcp`), ADR-0010 (the Contract A listener, which gains the
  contract version check), ADR-0012 (per-role visibility, search), and
  `@gavdi/cap-mcp` ADR 0014 (`mcp:hints`), ADR 0016 (skills over MCP) and ADR 0017 (skills in the
  hint context), all accepted 2026-11-25.

## Context

`@gavdi/cap-mcp` 2.0 serves Agent Skills: folders with a `SKILL.md` (a `name`, a `description`,
then steps an agent follows), named by `cds.mcp.skills` (their ADR 0016). Every caller the
endpoint lets in gets the same catalog. A skill can't be changed per caller or by another plugin:
hosts bind a user's approval to the digest of every file.

Their ADR 0017 tells `mcp:hints` providers which skills a request serves. `HintContext` gains
`skills`, a frozen list of `{ uri, name, description }` sorted by URI, empty without
`cds.mcp.skills`. Contract version stays 1.

A skill is a procedure ("ship an order: these tools, in this order"). An OKF note is knowledge
the procedure needs ("what counts as on time", "which status codes mean shipped"). Today an agent
that picks a skill has nothing telling it which notes go with it.

Decided by the maintainer on 2026-11-25, not reopened here:

- cap-okf's server instructions list the app's skills;
- a curated note can be written for a skill.

What cap-okf may not do (plan rules for this block, ADR-0004):

- read `cds.mcp` or the skills folder: it knows skills only through `ctx.skills`, at request time;
- change a skill, or `require` `@gavdi/cap-mcp`: the shapes are declared locally.

Constraints from the contract (their ADR 0014): one instructions text per provider, cut at 1,500
code points; providers run on every request and should answer from memory.

What is already in cap-okf's instructions (ADR-0013): the default text (about 500 code points,
depending on the namespace and the channels) or the app's own text, then up to three pinned notes, each line at most 300 code
points, the whole within 1,500.

## Options considered

How a note names its skills:

1. **Frontmatter `skills:`, skill names** as in `ctx.skills[].name`; one name or a list. Authors
   know a skill by its folder name; it is what the `SKILL.md` says. It works the same in every
   channel and in `cds build`, where no URI exists.
2. **Frontmatter `skills:`, `skill://` URIs.** Exact, but the URI scheme is `@gavdi/cap-mcp`'s
   (`skill://<name>/SKILL.md`); authors would copy a detail they don't own, and a change there
   breaks every note.
3. **A link in the body to `skill://…`.** Readable, but the bundle's link checks (W4) would
   report it as broken, and the body is the reader's text, not metadata.

Where skills go in the instructions:

1. **A block after the pinned notes**, one line per skill. Pinned notes always apply, so they
   keep their place; skills come with what cap-okf knows about them.
2. **A block before the pinned notes.** Skills are the more actionable list, but a long catalog
   would push pinned notes, which an app chose as always relevant, out of the 1,500.
3. **Only skills that have notes.** Shorter, but the maintainer decided the instructions list
   the app's skills.

## Decision

Option 1 in both cases, with the rules below.

### Notes name skills in frontmatter

- A curated note MAY set `skills:` to a skill name or a list of skill names, matched exactly
  against `ctx.skills[].name`. Example: `skills: [ship-order]`.
- The key is kept by the parser and serializer as every key is. It is not authorization detail:
  it reaches every reader who sees the note.
- Only curated notes (outside `model/`) count. A generated concept has no `skills` key.
- A value that isn't a non-empty name or a list of them is lint finding **K5** (warning), on the
  key's line: "`skills` must be a skill name or a list of skill names". The note then names no
  skill; it is otherwise served as usual. A list that mixes names and other values keeps the
  names and is still K5.
  - Not a validator rule, as the task first said: the validator checks OKF v0.2 only, and
    cap-okf's own frontmatter keys are checked by the knowledge lint (K4 for `pinned`). The lint
    runs in `cds build` and once at startup, as K1–K4 do, whatever `cds.okf.serve.mcp.skills` is.

### The skills block in the instructions

```text
<the default text, or the app's own text>

Pinned notes, which always apply:
- Margin rules (finance/margins.md): How the shop sets the margin on a book's price.

Skills this app serves:
- ship-order (skill://ship-order/SKILL.md), read with Shipping books (guides/shipping.md): Ship a submitted order of books, one parcel per order.
- tidy-catalog (skill://tidy-catalog/SKILL.md): Find books in the catalog that have no stock left.
```

**A skill's line** has one of four forms. The description always comes last, so cutting it
never touches the rest:

| Notes the caller sees for it | Description | Line |
| --- | --- | --- |
| none | none or empty | `- <name> (<uri>)` |
| none | yes | `- <name> (<uri>): <description>` |
| some | none or empty | `- <name> (<uri>), read with <title> (<path>); <title> (<path>)` |
| some | yes | `- <name> (<uri>), read with <title> (<path>); <title> (<path>): <description>` |

- Notes: the curated notes the caller sees whose `skills` names the skill, in path order, at most
  three. Two served skills with the same name (nested skill folders) each list the note.
- Names, descriptions and titles are made one line (whitespace runs become one space), as for
  pinned notes. All lengths are in code points, as `@gavdi/cap-mcp` counts them.
- A description longer than 160 code points is always cut to 160, the last one being `…`.

**Building the block.** Pinned notes keep their priority: the skills block only gets the room the
text and the pinned notes leave. (The plan's "pinned notes before skills" is read this way; the
maintainer confirms it by accepting this ADR.) Inside a line, the description goes before the
notes, because the host already shows each skill's description from `skills/list`, and the notes
are what only cap-okf can say.

1. Start from the text as it is today (the instructions text plus the pinned notes). The heading
   `\n\nSkills this app serves:` goes before the first line, `\n` before every other line.
2. Take the first ten skills in `ctx.skills` order (sorted by URI). For each, in order, try these
   forms of its line and take the first one that is at most 300 code points (counting the `- `)
   and keeps the whole text within 1,500 (counting the heading for the first line):
   1. with its description and every note (up to three);
   2. without the description;
   3. without the description, dropping notes from the end, one at a time;
   4. name and URI only.
3. When no form fits, stop: no later skill is tried, so the list never skips one.
4. If skills were left out (by step 3, or past the tenth), add `- and <n> more (skills/list)`, with
   `<n>` the number left out, only if it fits the 1,500. A listed skill is never dropped for it.
5. No line listed: no heading either. No skills served: no block, and the text is byte for byte
   what it is today.

Worked example (the fixture's two skills): text and pinned notes take 1,350 code points, so 150
are left. The heading takes 25, leaving 125. `ship-order`'s full line (145) doesn't fit; without
its description (89) it does, leaving 36. `tidy-catalog`'s shortest form, name and URI (46), plus
its `\n` is 47, more than 36, so the list stops there. `- and 1 more (skills/list)` (26) plus its
`\n` is 27 and fits, so it is added.

An app's own instructions text already over 1,500 code points gets no pinned notes and no skills
(as today for pinned notes); `@gavdi/cap-mcp` cuts it.

### Who gets it

- Exactly the callers who get cap-okf's instructions today: they meet
  `cds.okf.serve.mcp.requires`, and with `signals: "auto"` they see at least one curated note.
  So `requires` and `signals` keep their meaning: a caller who gets nothing from cap-okf today
  still gets nothing.
- With `instructions: false` there is no instructions text, so no skills block either.
- A note is named only to callers who see it (ADR-0012): a note with its own `requires` is left
  out of the line for anyone without the role. The skill itself is still listed: every caller of
  the endpoint sees it in `skills/list` anyway.

### The switch

`cds.okf.serve.mcp.skills`: `true` (default) or `false`, checked like `related` (anything else is
a setup error). `false`: no skills block and no warnings about unknown skills; the `skills` key is
still kept and searched, as it is the note's own content. Never a key under `cds.mcp`.

### An app's own instructions text

`instructions: "<text>"` replaces only cap-okf's default text. The pinned notes and the skills
block follow it as they follow the default.

### A note naming a skill that isn't served

Known only at request time, from `ctx.skills`.

- One `[okf]` warning per skill name per server (per bootstrap), at the first request that gives
  instructions to a caller who sees a note naming it. It names the first such note (in path
  order) and the line of its `skills` key, and up to ten served skills:

  ```text
  [okf] okf/guides/returns.md:6 — `skills` names "handle-return", which @gavdi/cap-mcp doesn't serve.
    Use a served skill (ship-order, tidy-catalog), or remove the name.
  ```

- The note is served as usual everywhere; nothing about the unknown name reaches the client.
- With no skills served at all (an older `@gavdi/cap-mcp`, or no `cds.mcp.skills`) the same
  warning says `none are served`.

### Where else a note for a skill shows

- `searchConcepts` matches the note's skill names with the weight of tags and aliases, so a
  search for `ship-order` finds the shipping note. Search doesn't need `ctx.skills`, so this is
  the same on every channel and with `@cap-js/mcp`.
- Nothing new in `index.md`, tool notes, "Read together with" or Business knowledge for 0.2.

### Seen twice, and dead ends

- Hosts that list skills themselves see each skill twice (their list and our line). Accepted: the
  lines are short, and ours add the notes.
- Skills reach every caller, notes follow `requires`. A skill that points at an `okf://` note a
  caller may not read is a dead end for that caller. The README tells authors so (dr.6); there is
  no lint for it, since cap-okf may not read skills.

### Older `@gavdi/cap-mcp`, and the contract version

- A `HintContext` without `skills`, or with something that isn't a list, means no skills. An entry
  without a non-empty text `name` or `uri` is left out; a missing `description` is treated as
  empty.
- Both listeners (`mcp:resources`, `mcp:hints`) check `contractVersion`: anything but 1 gives one
  `[okf]` warning naming the version, and nothing is registered from that event. Today a later
  version would be used as if it were 1; a breaking change must not be met silently (task dr.1).
  For `mcp:resources` this behaves as when the event never arrives (ADR-0010): no `okf://`
  resources, and the tools channel still serves if `tools` was requested. It reads the registry's
  contract version, not the package version, so detection still has no version check (ADR-0006).

## Consequences

- Agents that read the instructions learn which skills exist and which notes go with each, in the
  place they already read; an app gets this by adding `skills:` to its notes.
- New frontmatter key `skills`, new config key `cds.okf.serve.mcp.skills`, new lint rule K5. The
  README documents them (dr.6).
- The instructions grow by up to about 1,000 code points for apps with skills; apps without skills
  see no change. With three long pinned notes, there may be no room for skills at all.
- One more lookup per instructions request: skill name → notes the caller sees, built once per
  reader view (as the tool notes' map), so it costs no I/O per request.
- The warning about unknown skills comes at the first request, not at startup, because skills are
  known only then.
- A future `@gavdi/cap-mcp` contract version 2 switches cap-okf's MCP integration off with a
  warning until cap-okf supports it, instead of working by accident.
- `skills` is a bare frontmatter key, like `requires`, `aliases` and `pinned`. The OKF spec names
  Skills as future work (behind `executor.resource`); if a later OKF version defines a top-level
  `skills` with another meaning, cap-okf needs a new ADR to rename its key.
- If `@gavdi/cap-mcp` later adds per-role skills or `reload()` (their backlog), `ctx.skills` still
  carries the truth per request; nothing here changes.
