import { serializeConcept } from "../../src/core/concept";
import type { Csn, CsnDefinition } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { mapperFor, registryKeyOf } from "../../src/export/mappers/index";
import { projectionMapper } from "../../src/export/mappers/projection";
import { serviceMapper } from "../../src/export/mappers/service";

// Services list what they expose; projections and views are entities that say what they
// project. Both read CSN as plain data, like every mapper.

const MODEL: Csn = {
  definitions: {
    "shop.Books": {
      kind: "entity",
      doc: "A book in the shop. Sold by the piece.",
      elements: { ID: { key: true, type: "cds.UUID" }, title: { type: "cds.String" } },
    },
    "shop.Authors": { kind: "entity", "@description": "People who write.", elements: {} },
    CatalogService: {
      kind: "service",
      doc: "Read-only catalog for shoppers.",
      "@path": "/catalog",
      "@requires": "authenticated-user",
    },
    "CatalogService.Books": {
      kind: "entity",
      "@readonly": true,
      "@restrict": [{ grant: "READ", to: "shopper" }],
      projection: { from: { ref: ["shop.Books"] } },
      elements: {
        ID: { key: true, type: "cds.UUID" },
        title: { type: "cds.String" },
        author: { type: "cds.Association", target: "CatalogService.Authors" },
      },
    },
    "CatalogService.Authors": {
      kind: "entity",
      doc: "Writers, as the catalog shows them.",
      projection: { from: { ref: ["shop.Authors"] } },
      elements: { ID: { key: true, type: "cds.UUID" } },
    },
    "CatalogService.TopBooks": {
      kind: "entity",
      query: { SELECT: { from: { ref: ["shop.Books"] } } },
      elements: { ID: { key: true, type: "cds.UUID" } },
    },
    "CatalogService.Mixed": {
      kind: "entity",
      query: {
        SELECT: {
          from: { join: "inner", args: [{ ref: ["shop.Books"] }, { ref: ["shop.Authors"] }] },
        },
      },
      elements: {},
    },
    "CatalogService.order": { kind: "action", doc: "Places an order." },
    "CatalogService.price": { kind: "function" },
    "CatalogService.BookReserved": { kind: "event", doc: "Emitted after a reservation." },
    "CatalogService.Books.texts": { kind: "entity", elements: {} },
    "CatalogService.Money": { kind: "type", type: "cds.Decimal" },
    EmptyService: { kind: "service" },
  },
};

function map(name: string) {
  const definition = MODEL.definitions[name] as CsnDefinition;
  const mapper = mapperFor(registryKeyOf(definition))!;
  return mapper.map(name, definition, defaultMapperContext(MODEL));
}

describe("registry", () => {
  test("has a mapper for services and for projections", () => {
    expect(mapperFor("service")).toBe(serviceMapper);
    expect(mapperFor("projection")).toBe(projectionMapper);
  });
});

describe("service mapper", () => {
  test("writes the frontmatter of a service", () => {
    expect(map("CatalogService").frontmatter).toEqual({
      type: "Service",
      title: "CatalogService",
      description: "Read-only catalog for shoppers.",
      resource: "cds:CatalogService",
      tags: ["cds", "service"],
    });
  });

  test("lists its path, then its entities, actions, functions and events as links", () => {
    expect(map("CatalogService").body).toBe(
      [
        "",
        "# CatalogService",
        "",
        "Read-only catalog for shoppers.",
        "",
        "Path: `/catalog`",
        "",
        "## Entities",
        "",
        "- [Books](/model/CatalogService/Books.md) - A book in the shop.",
        "- [Authors](/model/CatalogService/Authors.md) - Writers, as the catalog shows them.",
        "- [TopBooks](/model/CatalogService/TopBooks.md) - A book in the shop.",
        "- [Mixed](/model/CatalogService/Mixed.md)",
        "",
        "## Actions",
        "",
        "- [order](/model/CatalogService/order.md) - Places an order.",
        "",
        "## Functions",
        "",
        "- [price](/model/CatalogService/price.md)",
        "",
        "## Events",
        "",
        "- [BookReserved](/model/CatalogService/BookReserved.md) - Emitted after a reservation.",
        "",
      ].join("\n"),
    );
  });

  test("a service without members, doc comment or path has only its heading", () => {
    expect(map("EmptyService").body).toBe("\n# EmptyService\n");
  });

  test("shows no authorization detail (ADR-0003)", () => {
    expect(serializeConcept(map("CatalogService"))).not.toMatch(/requires|authenticated-user/);
  });
});

describe("projection mapper", () => {
  test("is an Entity that names its own path and resource", () => {
    expect(map("CatalogService.Books").frontmatter).toEqual({
      type: "Entity",
      title: "Books",
      // No description of its own: the source's, as CSN doesn't copy doc comments.
      description: "A book in the shop.",
      resource: "cds:CatalogService.Books",
      tags: ["cds", "entity", "CatalogService"],
    });
    expect(map("CatalogService.Books").path).toBe("model/CatalogService/Books.md");
  });

  test("keeps its own description when it has one", () => {
    expect(map("CatalogService.Authors").frontmatter?.["description"]).toBe(
      "Writers, as the catalog shows them.",
    );
  });

  test("links to its source, then shows the source's doc comment and its own elements", () => {
    expect(map("CatalogService.Books").body).toBe(
      [
        "",
        "# Books",
        "",
        "Projection on [Books](/model/shop/Books.md)",
        "",
        "A book in the shop. Sold by the piece.",
        "",
        "## Elements",
        "",
        "| Element | Type | Notes |",
        "| --- | --- | --- |",
        "| `ID` | `UUID` | key |",
        "| `title` | `String` |  |",
        "",
        "## Associations",
        "",
        "- `author` → [Authors](/model/CatalogService/Authors.md) (to one)",
        "",
      ].join("\n"),
    );
  });
});

describe("projection mapper, views and missing sources", () => {
  test("a view on one entity says so", () => {
    expect(map("CatalogService.TopBooks").body).toContain(
      "\n# TopBooks\n\nView on [Books](/model/shop/Books.md)\n",
    );
  });

  test("a view on a join has no single source to link to", () => {
    expect(map("CatalogService.Mixed").body).toBe("\n# Mixed\n\nView\n");
  });

  test("shows no authorization detail, @readonly included (ADR-0003, task 2.4)", () => {
    expect(serializeConcept(map("CatalogService.Books"))).not.toMatch(/restrict|readonly|shopper/i);
  });

  // CAP never compiles such a model, but a link to a missing concept would only be a broken link.
  test("a source outside the model is named, but not linked", () => {
    const outside: Csn = {
      definitions: {
        "S.Things": {
          kind: "entity",
          projection: { from: { ref: ["other.Thing"] } },
          elements: {},
        },
      },
    };
    const concept = projectionMapper.map(
      "S.Things",
      outside.definitions["S.Things"]!,
      defaultMapperContext(outside),
    );
    expect(concept.body).toBe("\n# Things\n\nProjection on `other.Thing`\n");
    expect(concept.frontmatter?.["description"]).toBeUndefined();
  });

  // Compiled CSN only has paths along associations; any other path has no single source.
  test("a path that can't be followed has no source, rather than a wrong one", () => {
    const model: Csn = {
      definitions: {
        "db.Books": { kind: "entity", elements: { title: { type: "cds.String" } } },
        "S.Titles": {
          kind: "entity",
          projection: { from: { ref: ["db.Books", "title", "deeper"] } },
          elements: {},
        },
      },
    };
    const concept = projectionMapper.map(
      "S.Titles",
      model.definitions["S.Titles"]!,
      defaultMapperContext(model),
    );
    expect(concept.body).toBe("\n# Titles\n\nProjection\n");
  });
});
