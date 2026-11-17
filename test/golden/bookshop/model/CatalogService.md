---
type: Service
title: CatalogService
description: Read-only catalog for shoppers.
resource: cds:CatalogService
tags:
  - cds
  - service
generated:
  by: cap-okf/0.0.0-golden
  at: 2026-01-01T00:00:00Z
---

# CatalogService

Read-only catalog for shoppers.

Path: `/catalog`

## Entities

- [Books](/model/CatalogService/Books.md) - Books that the shop sells, with stock and authors
- [Authors](/model/CatalogService/Authors.md) - A person who wrote one or more books.
- [Genres](/model/CatalogService/Genres.md) - A category of books; genres can be nested.

## Events

- [BookReserved](/model/CatalogService/BookReserved.md) - Emitted after copies of a book were reserved.
