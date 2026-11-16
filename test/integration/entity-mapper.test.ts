import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept } from "../../src/core/concept";
import { outsideAuthSection } from "../helpers/auth";
import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { entityMapper } from "../../src/export/mappers/entity";
import { mapperFor, registryKeyOf } from "../../src/export/mappers/index";
import { validateBundle } from "../../src/core/validate";

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
  test("Books has its @description and its inherited elements", () => {
    const books = mapEntity("sample.bookshop.Books");
    expect(books.frontmatter).toEqual({
      type: "Entity",
      title: "Books",
      // No texts are given to this context, so '{i18n>BooksDescription}' shows as its key;
      // test/integration/i18n.test.ts checks the real text.
      description: "BooksDescription",
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

  test("an entity without @description takes the first sentence of its doc comment", () => {
    expect(mapEntity("sample.bookshop.Authors").frontmatter?.["description"]).toBe(
      "A person who wrote one or more books.",
    );
  });

  test("Genres links to itself as parent and as composed children", () => {
    const genres = mapEntity("sample.bookshop.Genres").body;
    expect(genres).toContain("- `parent` → [Genres](/model/sample/bookshop/Genres.md) (to one)");
    expect(genres).toContain(
      "- `children` → [Genres](/model/sample/bookshop/Genres.md) (composition, to many)",
    );
  });

  // AdminService restricts its entities; nothing of that may leak outside the auth section.
  test("AdminService.Books shows authorization detail only inside the marked section", () => {
    const text = outsideAuthSection(serializeConcept(mapEntity("AdminService.Books")));
    expect(text).not.toMatch(/restrict|requires|catalog-manager/i);
  });

  // Descriptions of projections (2.2) and of sap.common texts (2.6) come in later tasks; the
  // links are this task's job.
  // Entity tables link to types such as User (task 2.3), so the whole model is mapped here.
  test("every link of every mapped entity resolves, with the rest of the model mapped too", () => {
    const context = defaultMapperContext(model);
    const files = Object.entries(model.definitions)
      .flatMap(([name, definition]) => {
        const mapper = mapperFor(registryKeyOf(definition));
        return mapper === undefined ? [] : [mapper.map(name, definition, context)];
      })
      .map((concept) => ({ path: concept.path, text: serializeConcept(concept) }));
    const brokenLinks = validateBundle(files).filter((finding) => finding.rule === "W4");
    expect(files.length).toBeGreaterThan(10);
    expect(brokenLinks).toEqual([]);
  });
});

// Shapes the bookshop fixture doesn't have, compiled by CAP itself so the CSN is real.
describe("entity mapper on real CSN shapes", () => {
  const SHAPES = `
    namespace x;
    entity Orders {
      key ID     : Integer;
      status     : String(10) enum { open; closed };
      tags       : many String;
      lines      : many { qty : Integer };
      owner      : String default $user;
      items      : Composition of many { key pos : Integer; note : String };
      mine       : Association to many Orders on mine.owner = $user;
    }
    entity Ref { key ID : Integer; s : type of Orders:status; }
  `;
  let shapes: Csn;

  beforeAll(() => {
    shapes = cds.compile(SHAPES) as unknown as Csn;
  });

  function mapShape(name: string): string {
    return entityMapper.map(name, shapes.definitions[name]!, defaultMapperContext(shapes)).body;
  }

  test("arrayed elements show as many <type>", () => {
    const orders = mapShape("x.Orders");
    expect(orders).toContain("| `tags` | `many String` |  |");
    expect(orders).toContain("| `lines` | `many structured` |  |");
  });

  test("a type reference shows the element it refers to", () => {
    expect(mapShape("x.Ref")).toContain("| `s` | `x.Orders:status` |  |");
  });

  test("an association that is part of the key says so", () => {
    expect(mapShape("x.Orders.items")).toContain(
      "- `up_` → [Orders](/model/x/Orders.md) (key, to one)",
    );
  });

  // ADR-0003: a $user condition or default is about who sees what; it is never rendered.
  test("$user in an ON condition or a default appears nowhere", () => {
    expect(mapShape("x.Orders")).not.toContain("$user");
  });
});
