---
type: Entity
title: Authors
description: A person who wrote one or more books.
resource: cds:sample.bookshop.Authors
tags:
  - cds
  - entity
  - sample.bookshop
generated:
  by: cap-okf/0.0.0-golden
  at: 2026-01-01T00:00:00Z
---

# Authors

A person who wrote one or more books.

## Elements

| Element | Type | Notes |
| --- | --- | --- |
| `ID` | `UUID` | key |
| `createdAt` | `Timestamp` |  |
| `createdBy` | [User ID](/model/User.md) |  |
| `modifiedAt` | `Timestamp` |  |
| `modifiedBy` | [User ID](/model/User.md) |  |
| `name` | `String(150)` | mandatory |
| `country` | `String(2)` |  |

## Associations

- `books` → [Books](/model/sample/bookshop/Books.md) (to many)
