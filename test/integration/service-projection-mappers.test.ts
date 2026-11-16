import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept, type Concept } from "../../src/core/concept";
import { validateBundle } from "../../src/core/validate";
import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { mapperFor, registryKeyOf } from "../../src/export/mappers/index";

// Services and projections of the bookshop fixture, loaded the way the build loads it.

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");

let model: Csn;

beforeAll(async () => {
  // cds.load's result is CAP's own CSN type; ours names only the parts the mappers read.
  model = (await cds.load(FIXTURE, { docs: true })) as unknown as Csn;
});

/** Every definition that has a mapper today, mapped. */
function mapAll(): Concept[] {
  const context = defaultMapperContext(model);
  return Object.entries(model.definitions).flatMap(([name, definition]) => {
    const mapper = mapperFor(registryKeyOf(definition));
    return mapper === undefined ? [] : [mapper.map(name, definition, context)];
  });
}

function concept(name: string): Concept {
  const definition = model.definitions[name]!;
  return mapperFor(registryKeyOf(definition))!.map(name, definition, defaultMapperContext(model));
}

describe("services and projections of the bookshop fixture", () => {
  test("CatalogService lists its path, entities and event", () => {
    const body = concept("CatalogService").body;
    expect(body).toContain("Path: `/catalog`");
    expect(body).toContain("- [Books](/model/CatalogService/Books.md)");
    expect(body).toContain("- [Authors](/model/CatalogService/Authors.md)");
    expect(body).toContain("- [Genres](/model/CatalogService/Genres.md)");
    expect(body).toContain(
      "- [BookReserved](/model/CatalogService/BookReserved.md) - Emitted after copies of a book were reserved.",
    );
  });

  test("a projection links to its source and takes the source's doc comment", () => {
    const authors = concept("CatalogService.Authors");
    expect(authors.frontmatter?.["description"]).toBe("A person who wrote one or more books.");
    expect(authors.body).toContain("Projection on [Authors](/model/sample/bookshop/Authors.md)");
  });

  test("a projection's associations point at the service's own projections", () => {
    expect(concept("CatalogService.Books").body).toContain(
      "- `author` → [Authors](/model/CatalogService/Authors.md) (to one)",
    );
  });

  // ADR-0003: AdminService and its projections are restricted; none of it may show (task 2.4).
  test("AdminService and its projections show no authorization detail", () => {
    for (const name of ["AdminService", "AdminService.Books", "CatalogService.Books"]) {
      expect(serializeConcept(concept(name))).not.toMatch(
        /restrict|requires|readonly|authenticated-user|catalog-manager/i,
      );
    }
  });

  // The event and action concepts come in task 2.3; until then their links are the only gap.
  test("every link resolves except the one to the event, which task 2.3 maps", () => {
    const files = mapAll().map((each) => ({ path: each.path, text: serializeConcept(each) }));
    const brokenLinks = validateBundle(files).filter((finding) => finding.rule === "W4");
    expect(brokenLinks.map((finding) => [finding.file, finding.message])).toEqual([
      [
        "model/CatalogService.md",
        'link target "/model/CatalogService/BookReserved.md" does not exist in the bundle',
      ],
    ]);
  });
});

// Shapes the bookshop doesn't have, compiled by CAP so the CSN is real.
describe("services and projections on real CSN shapes", () => {
  const SHAPES = `
    namespace db;
    /** A book. Sold by the piece. */
    entity Books { key ID : Integer; stock : Integer; author : Association to Authors; }
    /** A person who writes. */
    entity Authors { key ID : Integer; name : String; }
    service S {
      entity Books as projection on db.Books;
      entity ProjOnProj as projection on Books;
      entity AuthorOf as projection on db.Books:author;
      entity InStock as projection on db.Books[stock > 0];
      entity ![Dotted.Name] as projection on db.Authors;
      entity Joined as select from db.Books join db.Authors on Books.author.ID = Authors.ID { Books.ID };
      entity Both as select from db.Books { ID } union select from db.Authors { ID };
      event BookEvt : projection on db.Books { ID };
      type BookType : projection on db.Books { ID };
    }
  `;
  let shapes: Csn;

  beforeAll(() => {
    shapes = cds.compile(SHAPES) as unknown as Csn;
  });

  function mapShape(name: string): Concept {
    const definition = shapes.definitions[name]!;
    return mapperFor(registryKeyOf(definition))!.map(
      name,
      definition,
      defaultMapperContext(shapes),
    );
  }

  test("only entities can be projections: an event or type built as one keeps its kind", () => {
    expect(registryKeyOf(shapes.definitions["db.S.BookEvt"]!)).toBe("event");
    expect(registryKeyOf(shapes.definitions["db.S.BookType"]!)).toBe("type");
  });

  test("a path expression links to the entity it leads to, with that entity's description", () => {
    const authorOf = mapShape("db.S.AuthorOf");
    expect(authorOf.body).toContain("Projection on [Authors](/model/db/Authors.md)");
    expect(authorOf.frontmatter?.["description"]).toBe("A person who writes.");
  });

  test("a source with an infix filter is still linked", () => {
    const inStock = mapShape("db.S.InStock");
    expect(inStock.body).toContain("Projection on [Books](/model/db/Books.md)");
    expect(inStock.frontmatter?.["description"]).toBe("A book.");
  });

  test("a projection on a projection takes the doc comment from further down the chain", () => {
    const projOnProj = mapShape("db.S.ProjOnProj");
    expect(projOnProj.body).toContain(
      "Projection on [Books](/model/db/S/Books.md)\n\nA book. Sold by the piece.",
    );
    expect(projOnProj.frontmatter?.["description"]).toBe("A book.");
  });

  test("a view on a join or a union has no single source", () => {
    expect(mapShape("db.S.Joined").body).toContain("\n# Joined\n\nView\n");
    expect(mapShape("db.S.Both").body).toContain("\n# Both\n\nView\n");
  });

  test("the service lists every entity it exposes, a dotted name included, and the event", () => {
    const body = mapShape("db.S").body;
    const entities = [...body.matchAll(/^- \[[^\]]*\]\(([^)]*)\)/gm)].map((match) => match[1]);
    expect(entities).toEqual([
      "/model/db/S/Books.md",
      "/model/db/S/ProjOnProj.md",
      "/model/db/S/AuthorOf.md",
      "/model/db/S/InStock.md",
      "/model/db/S/Dotted/Name.md",
      "/model/db/S/Joined.md",
      "/model/db/S/Both.md",
      "/model/db/S/BookEvt.md",
    ]);
    expect(body).toContain("## Events\n\n- [BookEvt](/model/db/S/BookEvt.md)");
  });
});
