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
| Timestamps | 44 | In quotes: `at: '2026-07-10T23:14:11+00:00'` | Without quotes: `at: 2026-07-10T23:14:11+00:00`, as the `acme_retail` samples do. cap-okf reads it as text (YAML 1.2); a consumer using YAML 1.1 (e.g. PyYAML) reads it as a date |
| Long values | 29 | Wrapped onto the next line after about 80 characters | On one line, however long |
| Inline lists and mappings | 17 | `tags: [finance, margin]`, `generated: { by: …, at: … }` | One item or key per line |

Most files show several of these at once: the same 44 files have unindented lists and quoted
timestamps, and 29 of them also have wrapped values. The 17 files with inline lists or mappings
are 9 from `acme_retail` and 8 from `stackoverflow`.

No sample hits the following, but a round trip also changes, for example:

- **Integer-like keys come first, even before `type`, and are written in quotes.** Frontmatter is
  a plain JavaScript object, which lists keys such as `1:` before all others; it is written back
  as `"1":`.
- **Comments are dropped.** YAML comments are not part of the parsed values.
- **YAML tags are dropped:** `!foo bar` is written back as `bar`.
- **Anchors and aliases are written out in full:** the value an alias points to is repeated.
- **Numbers and empty values are written in their standard form:** `0x1F` becomes `31`, `1.0`
  becomes `1`, `~` becomes `null`.
- **Line endings and the start of the file:** CRLF becomes LF, a UTF-8 byte order mark is removed,
  and several newlines at the end become exactly one. The body is otherwise kept byte for byte.

## When this changes

The suite checks that this document states the current number of byte-identical files, in the
first sentence under "What is not guaranteed". A change to the serializer's style that changes
that number fails the suite until this document is updated. The numbers in the table are not
checked; recount them when the serializer's style changes.
