---
type: Projection
title: Authors
description: A person who wrote one or more books.
resource: cds:CatalogService.Authors
tags:
  - cds
  - projection
  - CatalogService
generated:
  by: cap-okf/0.0.0-golden
  at: 2026-01-01T00:00:00Z
---

# Authors

Projection on [Authors](/model/sample/bookshop/Authors.md)

A person who wrote one or more books.

## Elements

| Element | Type | Notes |
| --- | --- | --- |
| `ID` | `UUID` | key |
| `name` | `String(150)` | mandatory |
| `country` | `String(2)` |  |

## Associations

- `books` → [Books](/model/CatalogService/Books.md) (to many)

<!-- okf:auth:start -->
## Authorization

A request must pass every rule in this section. In a table of privileges, one matching row is enough.

Read-only for every user.
<!-- okf:auth:end -->
