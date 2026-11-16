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

// Shapes the review checked by hand, compiled by CAP so they can't drift from the unit model.
describe("more shapes compiled by CAP", () => {
  const MORE = `
    namespace w;
    entity Countries { key code : String(3); }
    type Country : Association to Countries;
    type Priority : Integer enum { low = 1; high = 2; };
    type Tags : many String;
    type Addr { street : String; country : Country; }
    aspect Line { qty : Integer; }
    aspect Cancellable { status : String; } actions { action cancel(); };
    aspect WithItems { items : Composition of many { key pos : Integer; }; named : Composition of many Line; }
    entity Orders : Cancellable { key ID : Integer; status2 : String default 'open'; }
    service V {
      entity O as projection on w.Orders actions {
        action close(in : $self, reason : String);
        action closeAll(in : many $self);
      };
      action place(c : Country, n : Integer default 1, tags : many String, s : type of Orders:status2)
        returns many O;
      function addresses() returns array of Addr;
      event Placed { order : Association to O; n : Integer; }
    }
  `;
  let concepts: Concept[];

  beforeAll(() => {
    concepts = mapAll(compile(MORE, { docs: true }) as Csn);
  });

  test("an association parameter is shown with its target, and defaults and many are noted", () => {
    const place = find(concepts, "model/w/V/place.md").body;
    expect(place).toContain("| `c` | Association to [Countries](/model/w/Countries.md) |  |");
    expect(place).toContain("| `n` | `Integer` | default: 1 |");
    expect(place).toContain("| `tags` | `many String` |  |");
    expect(place).toContain("Returns: many [O](/model/w/V/O.md)");
  });

  test("a function returning an array of a structured type links to it", () => {
    expect(find(concepts, "model/w/V/addresses.md").body).toContain(
      "Returns: many [Addr](/model/w/Addr.md)",
    );
  });

  test("the binding parameter in is never listed", () => {
    const body = find(concepts, "model/w/V/O.md").body;
    expect(body).toContain("### close");
    expect(body).toContain("| `reason` | `String` |  |");
    expect(body).not.toContain("`in`");
  });

  test("types: an association, numeric values, many items and a structure with an association", () => {
    expect(find(concepts, "model/w/Country.md").body).toContain(
      "Based on: Association to [Countries](/model/w/Countries.md)",
    );
    expect(find(concepts, "model/w/Priority.md").body).toContain(
      "## Values\n\n- `low` = `1`\n- `high` = `2`",
    );
    expect(find(concepts, "model/w/Tags.md").body).toContain("Based on: `many String`");
    expect(find(concepts, "model/w/Addr.md").body).toContain(
      "| `country` | Association to [Countries](/model/w/Countries.md) |  |",
    );
  });

  test("an aspect with actions lists them, and one with compositions shows what they compose", () => {
    expect(find(concepts, "model/w/Cancellable.md").body).toContain("## Actions\n\n### cancel");
    const withItems = find(concepts, "model/w/WithItems.md").body;
    expect(withItems).toContain("| `items` | Composition of many `structured` |  |");
    expect(withItems).toContain("| `named` | Composition of many [Line](/model/w/Line.md) |  |");
  });

  test("an event with an association lists it", () => {
    expect(find(concepts, "model/w/V/Placed.md").body).toContain(
      "- `order` → [O](/model/w/V/O.md) (to one)",
    );
  });

  test("every link resolves", () => {
    const files = concepts.map((each) => ({ path: each.path, text: serializeConcept(each) }));
    expect(validateBundle(files).filter((finding) => finding.rule === "W4")).toEqual([]);
  });
});
