import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept, type Concept } from "../../src/core/concept";
import { validateBundle } from "../../src/core/validate";
import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { mapperFor, registryKeyOf } from "../../src/export/mappers/index";
import { selectExported } from "../../src/export/selection";

// Task 2.6 on the bookshop fixture and on CSN compiled by CAP.

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");

function mapSelected(model: Csn, exported: ReadonlySet<string>): Concept[] {
  const context = defaultMapperContext(model, undefined, (name) => exported.has(name));
  return [...exported].map((name) => {
    const definition = model.definitions[name]!;
    return mapperFor(registryKeyOf(definition))!.map(name, definition, context);
  });
}

describe("the bookshop fixture with the default include: services", () => {
  let model: Csn;
  let exported: ReadonlySet<string>;
  let concepts: Concept[];

  beforeAll(async () => {
    // cds.load's result is CAP's own CSN type; ours names only the parts the mappers read.
    model = (await cds.load(FIXTURE, { docs: true })) as unknown as Csn;
    exported = selectExported(model, "services");
    concepts = mapSelected(model, exported);
  });

  test("exports the services, what they expose, their sources and the types they use", () => {
    expect([...exported].sort()).toEqual([
      "AdminService",
      "AdminService.Authors",
      "AdminService.Books",
      "AdminService.Genres",
      "CatalogService",
      "CatalogService.Authors",
      "CatalogService.BookReserved",
      "CatalogService.Books",
      "CatalogService.Genres",
      "User",
      "sample.bookshop.Authors",
      "sample.bookshop.Books",
      "sample.bookshop.Genres",
    ]);
  });

  test("no concept mentions a definition that isn't exported", () => {
    const unexported = Object.keys(model.definitions).filter((name) => !exported.has(name));
    for (const concept of concepts) {
      const text = serializeConcept(concept);
      for (const name of unexported) {
        expect({
          path: concept.path,
          mentions:
            text.includes(`\`${name}\``) || text.includes(`/${name.replace(/\./g, "/")}.md`),
        }).toEqual({
          path: concept.path,
          mentions: false,
        });
      }
    }
  });

  test("every link resolves and every concept has a description", () => {
    const files = concepts.map((each) => ({ path: each.path, text: serializeConcept(each) }));
    expect(validateBundle(files)).toEqual([]);
  });
});

describe("@okf: false and @okf.tags on CSN compiled by CAP", () => {
  const SHAPES = `
    namespace x;
    entity Orders @(okf.tags: ['sales']) {
      key ID : Integer;
      note : String @okf: false;
      audit : Association to Audit;
    }
    @okf: false entity Audit { key ID : Integer; }
    service S { entity Orders as projection on x.Orders; }
  `;
  let concepts: Concept[];
  let exported: ReadonlySet<string>;

  beforeAll(() => {
    const model = cds.compile(SHAPES) as unknown as Csn;
    exported = selectExported(model, "services");
    concepts = mapSelected(model, exported);
  });

  test("the annotations arrive as CAP compiles them", () => {
    expect([...exported].sort()).toEqual(["x.Orders", "x.S", "x.S.Orders"]);
    const orders = concepts.find((each) => each.path === "model/x/Orders.md")!;
    expect(orders.frontmatter?.["tags"]).toEqual(["cds", "entity", "x", "sales"]);
    expect(orders.body).not.toMatch(/note|audit|Audit/);
  });
});
