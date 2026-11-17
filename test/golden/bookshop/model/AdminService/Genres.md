---
type: Projection
title: Genres
description: A category of books; genres can be nested.
resource: cds:AdminService.Genres
tags:
  - cds
  - projection
  - AdminService
generated:
  by: cap-okf/0.0.0-golden
  at: 2026-01-01T00:00:00Z
---

# Genres

Projection on [Genres](/model/sample/bookshop/Genres.md)

A category of books; genres can be nested.

## Elements

| Element | Type | Notes |
| --- | --- | --- |
| `code` | `String(20)` | key |
| `name` | `String(100)` |  |

## Associations

- `parent` → [Genres](/model/AdminService/Genres.md) (to one)
- `children` → [Genres](/model/AdminService/Genres.md) (composition, to many)

<!-- okf:auth:start -->
## Authorization

A request must pass every rule in this section. In a table of privileges, one matching row is enough.

| Grant | To | Where |
| --- | --- | --- |
| `*` | `catalog-manager` |  |

### From service [AdminService](/model/AdminService.md)

Requires: `authenticated-user`
<!-- okf:auth:end -->
