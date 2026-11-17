---
type: Entity
title: Books
description: Books that the shop sells, with stock and authors
resource: cds:sample.bookshop.Books
tags:
  - cds
  - entity
  - sample.bookshop
generated:
  by: cap-okf/0.0.0-golden
  at: 2026-01-01T00:00:00Z
---

# Books

A book that the shop can sell.

## Elements

| Element | Type | Notes |
| --- | --- | --- |
| `ID` | `UUID` | key |
| `createdAt` | `Timestamp` |  |
| `createdBy` | [User ID](/model/User.md) |  |
| `modifiedAt` | `Timestamp` |  |
| `modifiedBy` | [User ID](/model/User.md) |  |
| `title` | `String(150)` | mandatory |
| `summary` | `String(2000)` | Short text shown on the book's detail page. |
| `publishedYear` | `Integer` |  |
| `pages` | `Integer` |  |
| `copies` | `Integer` | default: 0 |

## Associations

- `author` → [Authors](/model/sample/bookshop/Authors.md) (to one)
- `genre` → [Genres](/model/sample/bookshop/Genres.md) (to one)
