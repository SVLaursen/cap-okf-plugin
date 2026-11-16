import { serializeConcept } from "../../src/core/concept";
import type { Csn, CsnDefinition } from "../../src/export/csn";
import { entityMapper } from "../../src/export/mappers/entity";
import { MAPPERS, mapperFor } from "../../src/export/mappers/index";
import { conceptPathFor, conceptLinkFor } from "../../src/export/paths";
import { defaultMapperContext } from "../../src/export/mappers/context";

// Mappers turn one CSN definition into one OKF concept. They read CSN as plain data, so these
// tests use small literal models; test/integration/entity-mapper.test.ts runs the real fixture.

const MODEL: Csn = {
  definitions: {
    "sample.bookshop.Books": {
      kind: "entity",
      doc: "A book that the shop can sell. Every book has one author.",
      includes: ["cuid"],
      "@title": "{i18n>Books}",
      elements: {
        ID: { key: true, type: "cds.UUID" },
        title: { "@mandatory": true, type: "cds.String", length: 150 },
        summary: {
          doc: "Short text | shown\non the detail page.",
          type: "cds.String",
          length: 2000,
        },
        price: { type: "cds.Decimal", precision: 9, scale: 2 },
        copies: { type: "cds.Integer", default: { val: 0 } },
        createdBy: { type: "User", length: 255 },
        author: {
          type: "cds.Association",
          target: "sample.bookshop.Authors",
          keys: [{ ref: ["ID"] }],
        },
        chapters: {
          type: "cds.Composition",
          cardinality: { max: "*" },
          target: "sample.bookshop.Chapters",
        },
      },
    },
    "sample.bookshop.Authors": {
      kind: "entity",
      "@title": "Writers",
      "@description": "People who write books.",
      elements: { ID: { key: true, type: "cds.UUID" } },
    },
    "sample.bookshop.Chapters": {
      kind: "entity",
      elements: { no: { key: true, type: "cds.Integer" } },
    },
    Plain: { kind: "entity", elements: { id: { key: true, type: "cds.Integer" } } },
  },
};

function mapEntity(name: string) {
  const definition = MODEL.definitions[name] as CsnDefinition;
  return entityMapper.map(name, definition, defaultMapperContext(MODEL));
}

describe("mapper registry", () => {
  test("has a mapper for entities", () => {
    expect(mapperFor("entity")).toBe(entityMapper);
    expect(MAPPERS.entity).toBe(entityMapper);
  });

  test("has no mapper for a kind nobody registered", () => {
    expect(mapperFor("no-such-kind")).toBeUndefined();
  });

  test("every registered mapper is registered under its own kind", () => {
    for (const [kind, mapper] of Object.entries(MAPPERS)) expect(mapper.kind).toBe(kind);
  });
});

describe("concept paths from fully qualified names (ADR-0007)", () => {
  test.each([
    ["sample.bookshop.Books", "model/sample/bookshop/Books.md"],
    ["CatalogService.Books", "model/CatalogService/Books.md"],
    ["CatalogService", "model/CatalogService.md"],
    ["my.Bücher", "model/my/B%C3%BCcher.md"],
    ["a.b%c", "model/a/b%25c.md"],
    ["shop.index", "model/shop/index_.md"],
    ["shop.LOG", "model/shop/LOG_.md"],
    ["shop.CON", "model/shop/CON_.md"],
    ["com1.Orders", "model/com1_/Orders.md"],
    ["Books_texts", "model/Books_texts.md"],
  ])("%s → %s", (name, path) => {
    expect(conceptPathFor(name)).toBe(path);
  });

  test("a link is the absolute path, encoded once more as a URI path", () => {
    expect(conceptLinkFor("sample.bookshop.Books")).toBe("/model/sample/bookshop/Books.md");
    expect(conceptLinkFor("a.b%c")).toBe("/model/a/b%2525c.md");
  });
});

describe("entity mapper frontmatter", () => {
  test("names the concept after the definition", () => {
    const concept = mapEntity("sample.bookshop.Books");
    expect(concept.path).toBe("model/sample/bookshop/Books.md");
    expect(concept.id).toBe("model/sample/bookshop/Books");
  });

  test("writes type, title, description from the doc comment, resource and tags", () => {
    expect(mapEntity("sample.bookshop.Books").frontmatter).toEqual({
      type: "Entity",
      // {i18n>Books} falls back to its key until task 2.5 resolves texts.
      title: "Books",
      description: "A book that the shop can sell.",
      resource: "cds:sample.bookshop.Books",
      tags: ["cds", "entity", "sample.bookshop"],
    });
  });

  test("prefers @title and @description over the name and the doc comment", () => {
    expect(mapEntity("sample.bookshop.Authors").frontmatter).toMatchObject({
      title: "Writers",
      description: "People who write books.",
    });
  });

  test("without a title, doc comment or namespace: the name, no description, no namespace tag", () => {
    expect(mapEntity("Plain").frontmatter).toEqual({
      type: "Entity",
      title: "Plain",
      resource: "cds:Plain",
      tags: ["cds", "entity"],
    });
  });
});

describe("entity mapper body", () => {
  test("lists the doc comment, includes, elements and associations", () => {
    expect(mapEntity("sample.bookshop.Books").body).toBe(
      [
        "",
        "# Books",
        "",
        "A book that the shop can sell. Every book has one author.",
        "",
        "Includes: `cuid`",
        "",
        "## Elements",
        "",
        "| Element | Type | Notes |",
        "| --- | --- | --- |",
        "| `ID` | `UUID` | key |",
        "| `title` | `String(150)` | mandatory |",
        "| `summary` | `String(2000)` | Short text \\| shown on the detail page. |",
        "| `price` | `Decimal(9, 2)` |  |",
        "| `copies` | `Integer` | default: 0 |",
        "| `createdBy` | `User(255)` |  |",
        "",
        "## Associations",
        "",
        "- `author` → [Writers](/model/sample/bookshop/Authors.md) (to one)",
        "- `chapters` → [Chapters](/model/sample/bookshop/Chapters.md) (composition, to many)",
        "",
      ].join("\n"),
    );
  });

  test("an entity without a doc comment, includes or associations has only its elements", () => {
    expect(mapEntity("Plain").body).toBe(
      "\n# Plain\n\n## Elements\n\n| Element | Type | Notes |\n| --- | --- | --- |\n| `id` | `Integer` | key |\n",
    );
  });
});

describe("entity mapper body, less common shapes", () => {
  test("renders the less common element and association shapes", () => {
    const edges: Csn = {
      definitions: {
        Edges: {
          kind: "entity",
          doc: "Shapes the bookshop doesn't use",
          elements: {
            address: { elements: { street: { type: "cds.String" } } },
            code: { type: "cds.String", notNull: true, localized: true },
            score: { type: "cds.Decimal", precision: 5 },
            shadow: { type: "cds.Integer", virtual: true },
            pair: { type: "cds.Association", target: "Edges", cardinality: { max: 2 } },
            single: { type: "cds.Association", target: "Edges", cardinality: { max: 1 } },
            external: { type: "cds.Association", target: "other.Thing" },
          },
        },
        Empty: { kind: "entity" },
      },
    };
    const context = defaultMapperContext(edges);
    const concept = entityMapper.map("Edges", edges.definitions["Edges"]!, context);
    expect(concept.frontmatter?.["description"]).toBe("Shapes the bookshop doesn't use");
    expect(concept.body).toContain("| `address` | `structured` |  |");
    expect(concept.body).toContain("| `code` | `String` | mandatory; localized |");
    expect(concept.body).toContain("| `score` | `Decimal(5)` |  |");
    expect(concept.body).toContain("| `shadow` | `Integer` | virtual |");
    expect(concept.body).toContain("- `pair` → [Edges](/model/Edges.md) (to many)");
    expect(concept.body).toContain("- `single` → [Edges](/model/Edges.md) (to one)");
    // A target outside the model still gets a link; the validator reports it if it's broken.
    expect(concept.body).toContain("- `external` → [Thing](/model/other/Thing.md) (to one)");
    const empty = entityMapper.map("Empty", edges.definitions["Empty"]!, context);
    expect(empty.body).toBe("\n# Empty\n");
  });

  test("the concept serializes to valid OKF text", () => {
    const text = serializeConcept(mapEntity("sample.bookshop.Books"));
    expect(text.startsWith("---\ntype: Entity\ntitle: Books\n")).toBe(true);
  });
});

describe("entity mapper and authorization (ADR-0003)", () => {
  test("@restrict and @requires appear nowhere in the concept", () => {
    const restricted: Csn = {
      definitions: {
        Orders: {
          kind: "entity",
          "@requires": "admin",
          "@restrict": [{ grant: "READ", to: "auditor", where: "country = $user.country" }],
          elements: { ID: { key: true, type: "cds.UUID", "@restrict": [{ grant: "*", to: "x" }] } },
        },
      },
    };
    const concept = entityMapper.map(
      "Orders",
      restricted.definitions["Orders"]!,
      defaultMapperContext(restricted),
    );
    const text = serializeConcept(concept);
    for (const word of ["restrict", "requires", "auditor", "admin", "grant", "$user"]) {
      expect(text).not.toContain(word);
    }
  });
});
