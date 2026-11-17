---
type: Projection
title: Books
description: Books that the shop sells, with stock and authors
resource: cds:AdminService.Books
tags:
  - cds
  - projection
  - AdminService
generated:
  by: cap-okf/0.0.0-golden
  at: 2026-01-01T00:00:00Z
---

# Books

Projection

A book that the shop can sell.

## Elements

| Element | Type | Notes |
| --- | --- | --- |
| `ID` | `UUID` | key |
| `createdAt` | `Timestamp` |  |
| `createdBy` | [User ID](/model/User.md) | User's unique ID |
| `modifiedAt` | `Timestamp` |  |
| `modifiedBy` | [User ID](/model/User.md) | User's unique ID |
| `title` | `String(150)` | mandatory |
| `summary` | `String(2000)` | Short text shown on the book's detail page. |
| `publishedYear` | `Integer` |  |
| `pages` | `Integer` |  |
| `copies` | `Integer` | default: 0 |

## Associations

- `author` → [Authors](/model/AdminService/Authors.md) (to one)
- `genre` → [Genres](/model/AdminService/Genres.md) (to one)

<!-- okf:auth:start -->
## Authorization

A request must pass every rule in this section. In a table of privileges, one matching row is enough.

| Grant | To | Where |
| --- | --- | --- |
| `READ` | `authenticated-user` |  |
| `CREATE`, `UPDATE`, `DELETE` | `catalog-manager` |  |

### From service [AdminService](/model/AdminService.md)

Requires: `authenticated-user`
<!-- okf:auth:end -->
