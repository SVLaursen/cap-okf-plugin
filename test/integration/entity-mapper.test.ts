import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept } from "../../src/core/concept";
import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { entityMapper } from "../../src/export/mappers/entity";

// The entity mapper on the real bookshop fixture, loaded the way the build loads it:
// the inferred model, with doc comments (ADR-0007).

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");

let model: Csn;

beforeAll(async () => {
  // cds.load's result is CAP's own CSN type; ours names only the parts the mappers read.
  model = (await cds.load(FIXTURE, { docs: true })) as unknown as Csn;
});

function mapEntity(name: string) {
  return entityMapper.map(name, model.definitions[name]!, defaultMapperContext(model));
}

describe("entity mapper on the bookshop fixture", () => {
  test("Books has its doc comment as description and its inherited elements", () => {
    const books = mapEntity("sample.bookshop.Books");
    expect(books.frontmatter).toEqual({
      type: "Entity",
      title: "Books",
      description: "A book that the shop can sell.",
      resource: "cds:sample.bookshop.Books",
      tags: ["cds", "entity", "sample.bookshop"],
    });
    expect(books.body).toContain("Includes: `cuid`, `managed`");
    expect(books.body).toContain("| `ID` | `UUID` | key |");
    expect(books.body).toContain("| `createdAt` | `Timestamp` |");
    expect(books.body).toContain(
      "| `summary` | `String(2000)` | Short text shown on the book's detail page. |",
    );
    expect(books.body).toContain(
      "- `author` → [Authors](/model/sample/bookshop/Authors.md) (to one)",
    );
    expect(books.body).toContain("- `genre` → [Genres](/model/sample/bookshop/Genres.md) (to one)");
  });

  test("Genres links to itself as parent and as composed children", () => {
    const genres = mapEntity("sample.bookshop.Genres").body;
    expect(genres).toContain("- `parent` → [Genres](/model/sample/bookshop/Genres.md) (to one)");
    expect(genres).toContain(
      "- `children` → [Genres](/model/sample/bookshop/Genres.md) (composition, to many)",
    );
  });

  // AdminService restricts its entities; nothing of that may leak outside the auth section.
  test("AdminService.Books shows no authorization detail", () => {
    const text = serializeConcept(mapEntity("AdminService.Books"));
    expect(text).not.toMatch(/restrict|requires|catalog-manager/i);
  });
});
