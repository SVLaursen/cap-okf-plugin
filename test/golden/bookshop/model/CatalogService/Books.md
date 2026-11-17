---
type: Projection
title: Books
description: Books that the shop sells, with stock and authors
resource: cds:CatalogService.Books
tags:
  - cds
  - projection
  - CatalogService
generated:
  by: cap-okf/0.0.0-golden
  at: 2026-01-01T00:00:00Z
---

# Books

Projection on [Books](/model/sample/bookshop/Books.md)

A book that the shop can sell.

## Elements

| Element | Type | Notes |
| --- | --- | --- |
| `ID` | `UUID` | key |
| `title` | `String(150)` | mandatory |
| `summary` | `String(2000)` |  |
| `publishedYear` | `Integer` |  |
| `pages` | `Integer` |  |
| `copies` | `Integer` | default: 0 |

## Associations

- `author` → [Authors](/model/CatalogService/Authors.md) (to one)
- `genre` → [Genres](/model/CatalogService/Genres.md) (to one)

## Actions

### reserve

Action. Holds copies of this book for a shopper; returns the copies left.

| Parameter | Type | Notes |
| --- | --- | --- |
| `copies` | `Integer` |  |

Returns: `Integer`

<!-- okf:auth:start -->
## Authorization

A request must pass every rule in this section. In a table of privileges, one matching row is enough.

Read-only for every user.
<!-- okf:auth:end -->
