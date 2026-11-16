import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept, type Concept } from "../../src/core/concept";
import { validateBundle } from "../../src/core/validate";
import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { mapperFor, registryKeyOf } from "../../src/export/mappers/index";

// Actions, types, aspects and events, on the bookshop fixture and on CSN compiled by CAP.

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");

// CAP's docs document cds.compile(model, { docs: true }), but its TypeScript types take only the
// model; the cast passes the option that keeps doc comments.
const compile = cds.compile as unknown as (model: string, options: { docs: boolean }) => unknown;

function mapAll(model: Csn): Concept[] {
  const context = defaultMapperContext(model);
  return Object.entries(model.definitions).flatMap(([name, definition]) => {
    const mapper = mapperFor(registryKeyOf(definition));
    return mapper === undefined ? [] : [mapper.map(name, definition, context)];
  });
}

function find(concepts: Concept[], path: string): Concept {
  const concept = concepts.find((each) => each.path === path);
  if (concept === undefined) throw new Error(`no concept at ${path}`);
  return concept;
}

describe("the bookshop fixture", () => {
  let concepts: Concept[];

  beforeAll(async () => {
    // cds.load's result is CAP's own CSN type; ours names only the parts the mappers read.
    concepts = mapAll((await cds.load(FIXTURE, { docs: true })) as unknown as Csn);
  });

  test("CatalogService.Books lists its bound action reserve", () => {
    expect(find(concepts, "model/CatalogService/Books.md").body).toContain(
      "### reserve\n\nAction. Holds copies of this book for a shopper; returns the copies left.\n\n| Parameter | Type | Notes |\n| --- | --- | --- |\n| `copies` | `Integer` |  |\n\nReturns: `Integer`",
    );
  });

  test("the event BookReserved is a concept now", () => {
    const event = find(concepts, "model/CatalogService/BookReserved.md");
    expect(event.frontmatter).toMatchObject({ type: "Event" });
  });

  test("the aspects cuid and managed are concepts", () => {
    expect(find(concepts, "model/cuid.md").frontmatter).toMatchObject({ type: "Aspect" });
    expect(find(concepts, "model/managed.md").frontmatter).toMatchObject({ type: "Aspect" });
  });

  test("every link of the whole mapped model resolves", () => {
    const files = concepts.map((each) => ({ path: each.path, text: serializeConcept(each) }));
    expect(validateBundle(files).filter((finding) => finding.rule === "W4")).toEqual([]);
  });
});

describe("CSN compiled by CAP", () => {
  const SHAPES = `
    namespace x;
    type Status : String(10) enum { open = 'O'; closed; };
    type Money : Decimal(9, 2);
    entity Orders { key ID : Integer; status : Status; }
    service S {
      entity Orders as projection on x.Orders actions {
        action cancel(reason : String) returns Orders;
        function total() returns Money;
      };
      action order(book : Integer, qty : Integer @mandatory) returns many { id : Integer; };
      event OrderEvt : projection on x.Orders { ID };
      type OrderType : projection on x.Orders { ID };
    }
  `;
  let concepts: Concept[];

  beforeAll(() => {
    concepts = mapAll(compile(SHAPES, { docs: true }) as Csn);
  });

  test("a bound action's return type links to the projection it returns", () => {
    expect(find(concepts, "model/x/S/Orders.md").body).toContain(
      "### cancel\n\nAction.\n\n| Parameter | Type | Notes |\n| --- | --- | --- |\n| `reason` | `String` |  |\n\nReturns: [Orders](/model/x/S/Orders.md)",
    );
  });

  test("events and types built as projections name their source", () => {
    const event = find(concepts, "model/x/S/OrderEvt.md");
    expect(event.frontmatter).toMatchObject({ type: "Event" });
    expect(event.body).toContain("Projection on [Orders](/model/x/Orders.md)");
    expect(find(concepts, "model/x/S/OrderType.md").body).toContain(
      "Projection on [Orders](/model/x/Orders.md)",
    );
  });

  test("an element of a model type links to the type", () => {
    expect(find(concepts, "model/x/Orders.md").body).toContain(
      "| `status` | [Status](/model/x/Status.md) |  |",
    );
  });

  test("every link resolves", () => {
    const files = concepts.map((each) => ({ path: each.path, text: serializeConcept(each) }));
    expect(validateBundle(files).filter((finding) => finding.rule === "W4")).toEqual([]);
  });
});
