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
