# 0003. Authorization rules only for authenticated requesters

- Status: Accepted
- Date: 2026-11-09
- Deciders: Simon Vestergaard Laursen

## Context

`@restrict` and `@requires` describe who may do what. That is useful context for agents, but it reveals internal security design to anyone who can read the bundle.

## Decision

Generated concepts include authorization rules, but only inside one marked section:

```markdown
<!-- okf:auth:start -->
## Authorization
…
<!-- okf:auth:end -->
```

Every server removes everything between the markers (inclusive) unless the requester is authenticated, as determined by the CAP app's own authentication. No authorization detail may appear anywhere else in a concept, including frontmatter.

## Consequences

- One pure filter function (`lib/serve/filter.js`) enforces this for all servers; the contract suite tests it.
- The generated files on disk contain the section. Apps that commit or ship `gen/okf` publicly must consider that; the README says so.
