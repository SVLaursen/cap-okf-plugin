---
type: Projection
title: Genres
description: A category of books; genres can be nested.
resource: cds:CatalogService.Genres
tags:
  - cds
  - projection
  - CatalogService
generated:
  by: cap-okf/0.0.0-golden
  at: 2026-01-01T00:00:00Z
---

# Genres

Projection

A category of books; genres can be nested.

## Elements

| Element | Type | Notes |
| --- | --- | --- |
| `code` | `String(20)` | key |
| `name` | `String(100)` |  |

## Associations

- `parent` → [Genres](/model/CatalogService/Genres.md) (to one)
- `children` → [Genres](/model/CatalogService/Genres.md) (composition, to many)

<!-- okf:auth:start -->
## Authorization

A request must pass every rule in this section. In a table of privileges, one matching row is enough.

Read-only for every user.
<!-- okf:auth:end -->
