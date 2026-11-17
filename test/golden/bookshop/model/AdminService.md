---
type: Service
title: AdminService
description: Maintenance of the catalog by shop staff.
resource: cds:AdminService
tags:
  - cds
  - service
generated:
  by: cap-okf/0.0.0-golden
  at: 2026-01-01T00:00:00Z
---

# AdminService

Maintenance of the catalog by shop staff.

Path: `/admin`

## Entities

- [Books](/model/AdminService/Books.md) - Books that the shop sells, with stock and authors
- [Authors](/model/AdminService/Authors.md) - A person who wrote one or more books.
- [Genres](/model/AdminService/Genres.md) - A category of books; genres can be nested.

<!-- okf:auth:start -->
## Authorization

A request must pass every rule in this section. In a table of privileges, one matching row is enough.

Requires: `authenticated-user`
<!-- okf:auth:end -->
