---
type: Playbook
title: Placing an order
description: How a shopper orders a book, and what the shop checks first.
tags: [sales, orders]
status: stable
generated: { by: "human:demo-author", at: 2026-11-13T09:00:00Z }
verified:
  - { by: "human:demo-reviewer", at: 2026-11-13T10:00:00Z }
review_owner: shop-team
---

# Steps

1. Find the book in the [catalog](/model/CatalogService/Books.md), for example with
   `booksByAuthor`.
2. Check that enough copies are in stock (`stock`), or call `availableWithin` for a
   delivery estimate.
3. Call `submitOrder` with the book and the quantity. The shop answers with an order number
   and emits `OrderSubmitted`.

# Rules

- Books with status `outOfPrint` cannot be ordered.
- Shop staff look orders up in [AdminService](/model/AdminService.md).

<!-- okf:auth:start -->
## Authorization

Admins see every order. Support staff only see orders they created themselves.
<!-- okf:auth:end -->
