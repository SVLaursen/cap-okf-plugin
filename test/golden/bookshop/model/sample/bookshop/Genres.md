---
type: Entity
title: Genres
description: A category of books; genres can be nested.
resource: cds:sample.bookshop.Genres
tags:
  - cds
  - entity
  - sample.bookshop
generated:
  by: cap-okf/0.0.0-golden
  at: 2026-01-01T00:00:00Z
---

# Genres

A category of books; genres can be nested.

## Elements

| Element | Type | Notes |
| --- | --- | --- |
| `code` | `String(20)` | key |
| `name` | `String(100)` |  |

## Associations

- `parent` → [Genres](/model/sample/bookshop/Genres.md) (to one)
- `children` → [Genres](/model/sample/bookshop/Genres.md) (composition, to many)
