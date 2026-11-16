# Conformance with OKF v0.2

cap-okf is tested against the four official OKF v0.2 sample bundles (`acme_retail`,
`crypto_bitcoin`, `ga4`, `stackoverflow`), copied unchanged from the spec repository into
`test/fixtures/okf-spec/bundles/` (see `SOURCE.md` there). The suite is
`test/conformance/official-samples.test.ts` and runs with `npm test`.

## What is guaranteed

For every Markdown file of every sample bundle:

1. **It parses.** `parseConcept` reads its frontmatter and body without an error.
2. **It validates cleanly.** `validateBundle` reports no finding at all for any of the four
   bundles: no error (R1–R3) and no warning (W1–W4).
3. **It keeps its meaning.** Writing a parsed file with `serializeConcept` and parsing the result
   gives the same concept: the same path, the same frontmatter keys and values, the same body.
4. **Writing is stable.** Writing a written file again gives exactly the same bytes, so a bundle
   that cap-okf wrote once never changes on the next build unless its content changes.
5. **Only the frontmatter's formatting can change.** The body comes back byte for byte, and files
   without frontmatter (24 of them, all `index.md` files) come back unchanged.

## What is not guaranteed: byte-identical frontmatter

25 of the 78 Markdown files round-trip byte for byte: the 24 files without frontmatter, and
`acme_retail/log.md`, whose frontmatter (`type: Log`, `title: …`) is already written the way
cap-okf writes it. In the other 53 files, the values are identical but the frontmatter is
formatted differently. This is a deliberate choice (maintainer decision, 2026-11-16, task 1.7):
cap-okf writes one consistent YAML style instead of remembering how each file was written, so
the bundles it generates diff cleanly.

The sample bundles do not share one style themselves. The differences, with the number of the
53 files that show each one:

| Difference | Files | The samples write | cap-okf writes |
| --- | --- | --- | --- |
| Key order | 53 | Keys in the author's order, e.g. `resource` before `title`, `verified` before `status` | `type, title, description, resource, tags, status, generated, verified, stale_after, sources`, then all other keys in their original order (task 1.2) |
| List items | 44 | `- item` at the same indent as the key | `  - item`, indented two spaces |
| Timestamps | 44 | In quotes: `at: '2026-07-10T23:14:11+00:00'` | Without quotes: `at: 2026-07-10T23:14:11+00:00`; it is still read as text, not as a date |
| Long values | 29 | Wrapped onto the next line after about 80 characters | On one line, however long |
| Inline lists and mappings | 17 | `tags: [finance, margin]`, `generated: { by: …, at: … }` | One item or key per line |

Most files show several of these at once. 44 files use the style of Python's YAML library
(unindented lists, quoted timestamps, wrapped lines); the `acme_retail` concepts use inline lists
and mappings instead.

Two further limits are known, but no sample hits them:

- **Integer-like keys come first.** Frontmatter is a plain JavaScript object, which lists keys such
  as `1:` or `2:` before all others, whatever order they were written in.
- **Comments in frontmatter are dropped.** YAML comments are not part of the parsed values, so
  they are not written back.

## When this changes

`docs/conformance.md` and the suite are pinned to each other: the suite checks that this document
states the current byte-identical count ("25 of the 78 Markdown files"). A change to the
serializer's style that changes the count fails the suite until this document is updated.
