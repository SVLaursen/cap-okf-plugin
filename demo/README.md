# Demo bookshop

A small CAP app that uses cap-okf the way a real app does. It depends on the plugin through
`"cap-okf": "file:.."`, so CAP loads `cds-plugin.js` from the repo root as a normal plugin. CAP
only loads plugins listed in an app's dependencies, never the project's own `cds-plugin.js`, so the
repo root can't be used for this.

Use it to try commands by hand and as the target for integration tests (`cds.test`). The golden
tests use `test/fixtures/bookshop` instead: that fixture stays frozen, while this demo grows with
each feature.

## Run it

From the repo root (the demo is an npm workspace, so `npm install` at the root sets it up):

```sh
npm run demo          # cds watch; OData at http://localhost:4004
npm run demo:build    # cds build into demo/gen/
```

Both scripts compile cap-okf first (`npm run build`), because `cds-plugin.js` loads the compiled
`lib/` (ADR-0009). Inside `demo/` (`npx cds watch`, `npx cds build`, `npx cds env okf`), run
`npm run build` at the repo root first.

The database is in-memory SQLite with no data rows: OKF describes the model, not its data.

Nothing checks the curated files in `okf/` yet. Once the validator (task 1.3) exists, add a test
that validates `demo/okf` so these examples stay correct.

## Users (mocked auth)

| User  | Password | Roles   | Can use                                            |
| ----- | -------- | ------- | -------------------------------------------------- |
| alice | alice    | admin   | everything                                         |
| bob   | bob      | none    | CatalogService                                     |
| carol | carol    | support | CatalogService; in AdminService, read Books and her own Orders |

Anonymous users can use CatalogService only.

## Configuration

`package.json` turns nothing on by default and serves the bundle on the static route in the
`development` profile only (ADR-0002, ADR-0004):

```json
"okf": {
  "serve": { "static": false, "mcp": false },
  "[development]": { "serve": { "static": true } }
}
```

No MCP plugin is installed. The two MCP plugins can't share one app, so they get separate fixture
apps in task 4.8.

## What each part exercises

| Feature (plan task)                                  | Where                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Entities, keys, elements, associations (2.1)         | `db/schema.cds`: `Books`, `Authors`, `Genres`, `Orders`, `OrderItems`                     |
| Doc comments as descriptions (2.1)                   | `/** … */` on every `db` entity and service; `cdsc.docs: true` keeps them in the compiled model |
| No doc comment, no description (2.1)                 | `CatalogService.Authors`, `CatalogService.Genres`, the `AdminService` projections         |
| Composition, self-reference (2.1)                    | `Orders.items`, `Genres.children` / `Genres.parent`                                       |
| Services and projections (2.2)                       | `CatalogService`, `AdminService`                                                          |
| Projection with `excluding` (2.2)                    | `CatalogService.Books` drops `costPrice`, `createdBy`, `modifiedBy`                        |
| Bound action and bound function (2.3)                | `CatalogService.Books`: `reserve`, `availableWithin`                                      |
| Unbound action and function (2.3)                    | `CatalogService.submitOrder` (structured return), `CatalogService.booksByAuthor`          |
| Custom types, enum (2.3)                             | `demo.bookshop.Price`, `demo.bookshop.BookStatus`                                         |
| Aspects (2.3)                                        | `demo.bookshop.Reviewed`, plus `cuid`, `managed`, `CodeList` from `@sap/cds/common`        |
| Event (2.3)                                          | `CatalogService.OrderSubmitted`                                                           |
| `@requires` on a service and an action (2.4)         | `AdminService` (`admin`, `support`), `AdminService.restock` (`admin`)                     |
| `@restrict` with roles and a `where` clause (2.4)    | `AdminService.Books`, `AdminService.Orders` (`createdBy = $user`)                         |
| i18n titles and descriptions, en and de (2.5)        | `_i18n/`; `@title` and `@description` on `Books`, `@title` on elements                    |
| `@okf: false` on an element a service exposes (2.6)  | `demo.bookshop.Books.costPrice` (in `AdminService.Books`): must never appear in OKF output |
| `@okf: false` on an entity (2.6)                     | `demo.bookshop.InternalNotes`: only matters with `include: "all"`, as no service reaches it |
| `@okf.tags` (2.6)                                    | `demo.bookshop.Books`: `catalog`, `sales`                                                 |
| Entity not exposed by any service (2.6)              | `InternalNotes` (only with `include: "all"`)                                              |
| Composition target auto-exposed (2.2, 2.6)           | `OrderItems`: CAP adds `AdminService.OrderItems` (`@cds.autoexposed`) because of `Orders.items` |
| Curated concepts next to generated ones (3.1)        | `okf/guides/ordering.md` (stable, verified), `okf/guides/returns.md` (draft, `stale_after`) |
| Auth section in a curated concept (ADR-0003, 4.2)    | `okf/guides/ordering.md`: `## Authorization` between the `okf:auth` markers               |
| Reserved files (1.3)                                 | `okf/index.md` (with `okf_version`), `okf/log.md`                                         |
| Unknown frontmatter keys kept (1.1, 1.2)             | `review_owner` in `okf/guides/ordering.md`                                                |
| Links into generated concepts (1.4)                  | `okf/guides/*.md` link to `/model/…` paths                                                |
| Profile-aware serving config (4.3, 4.10)             | `cds.okf` in `package.json`                                                               |
| Anonymous vs authenticated (ADR-0003, 4.3)           | anonymous, `bob`, `alice`                                                                 |
