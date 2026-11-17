---
type: Projection
title: Authors
description: A person who wrote one or more books.
resource: cds:AdminService.Authors
tags:
  - cds
  - projection
  - AdminService
generated:
  by: cap-okf/0.0.0-golden
  at: 2026-01-01T00:00:00Z
---

# Authors

Projection

A person who wrote one or more books.

## Elements

| Element | Type | Notes |
| --- | --- | --- |
| `ID` | `UUID` | key |
| `createdAt` | `Timestamp` |  |
| `createdBy` | [User ID](/model/User.md) | User's unique ID |
| `modifiedAt` | `Timestamp` |  |
| `modifiedBy` | [User ID](/model/User.md) | User's unique ID |
| `name` | `String(150)` | mandatory |
| `country` | `String(2)` |  |

## Associations

- `books` → [Books](/model/AdminService/Books.md) (to many)

<!-- okf:auth:start -->
## Authorization

A request must pass every rule in this section. In a table of privileges, one matching row is enough.

| Grant | To | Where |
| --- | --- | --- |
| `*` | `catalog-manager` |  |

### From service [AdminService](/model/AdminService.md)

Requires: `authenticated-user`
<!-- okf:auth:end -->
