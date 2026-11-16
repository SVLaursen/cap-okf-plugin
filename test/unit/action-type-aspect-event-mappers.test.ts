import { serializeConcept } from "../../src/core/concept";
import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { mapperFor, registryKeyOf } from "../../src/export/mappers/index";

// Actions, functions, types, aspects and events, plus actions bound to an entity. The model
// mirrors what CAP compiles (checked in test/integration/action-type-aspect-event-mappers.test.ts).

const MODEL: Csn = {
  definitions: {
    "x.Status": {
      kind: "type",
      doc: "Order status.",
      type: "cds.String",
      length: 10,
      enum: { open: { val: "O" }, closed: {} },
    },
    "x.Address": {
      kind: "type",
      doc: "A postal address.",
      elements: { street: { type: "cds.String" }, city: { type: "cds.String" } },
    },
    "x.Money": { kind: "type", type: "cds.Decimal", precision: 9, scale: 2 },
    "x.ToOrder": { kind: "type", type: "cds.Association", target: "x.S.Orders" },
    "x.WithItems": {
      kind: "aspect",
      elements: {
        lines: {
          type: "cds.Composition",
          cardinality: { max: "*" },
          targetAspect: { elements: {} },
        },
        named: { type: "cds.Composition", cardinality: { max: "*" }, targetAspect: "x.Titled" },
      },
    },
    "x.Titled": {
      kind: "aspect",
      doc: "Has a title.",
      elements: { title: { type: "cds.String" } },
    },
    "x.S": { kind: "service" },
    "x.S.Orders": {
      kind: "entity",
      elements: {
        ID: { key: true, type: "cds.Integer" },
        status: { type: "x.Status", length: 10 },
        ship: { type: "x.Address" },
        kind: { type: "cds.String", enum: { retail: {}, wholesale: { val: "W" } } },
        history: { items: { type: "x.Status" } },
      },
      actions: {
        cancel: {
          kind: "action",
          doc: "Cancels it.",
          "@requires": "admin",
          "@restrict": [{ grant: "cancel", to: "clerk" }],
          // The binding parameter: the bound instance, never passed by a caller.
          params: { in: { type: "$self" }, reason: { type: "cds.String" } },
          returns: { type: "x.S.Orders" },
        },
        total: {
          kind: "function",
          params: { in: { items: { type: "$self" } } },
          returns: { type: "x.Money", precision: 9, scale: 2 },
        },
      },
    },
    "x.S.order": {
      kind: "action",
      doc: "Places an order.",
      "@requires": "shopper",
      "@restrict": [{ grant: "*", to: "buyer" }],
      params: { book: { type: "cds.Integer" }, qty: { "@mandatory": true, type: "cds.Integer" } },
      returns: { items: { elements: { id: { type: "cds.Integer" } } } },
    },
    "x.S.price": {
      kind: "function",
      params: { id: { type: "cds.Integer" } },
      returns: { type: "cds.Decimal", precision: 9, scale: 2 },
    },
    "x.S.ping": { kind: "action", doc: "Checks the line.\n## Authorization\nAnyone may ping." },
    "x.S.ship": {
      kind: "action",
      params: { to: { type: "x.ToOrder", target: "x.S.Orders" }, n: { type: "cds.Integer" } },
      returns: { elements: { order: { type: "cds.Association", target: "x.S.Orders" } } },
    },
    "x.S.Shipped": {
      kind: "event",
      doc: "Something happened.",
      elements: { order: { type: "cds.Integer" }, at: { type: "cds.Timestamp" } },
    },
  },
};

function map(name: string) {
  const definition = MODEL.definitions[name]!;
  const mapper = mapperFor(registryKeyOf(definition));
  if (mapper === undefined) throw new Error(`no mapper for ${name}`);
  return mapper.map(name, definition, defaultMapperContext(MODEL));
}

describe("action and function mappers", () => {
  test("an action has its parameters and a structured return", () => {
    const order = map("x.S.order");
    expect(order.frontmatter).toEqual({
      type: "Action",
      title: "order",
      description: "Places an order.",
      resource: "cds:x.S.order",
      tags: ["cds", "action", "x.S"],
    });
    expect(order.body).toBe(
      [
        "",
        "# order",
        "",
        "Places an order.",
        "",
        "| Parameter | Type | Notes |",
        "| --- | --- | --- |",
        "| `book` | `Integer` |  |",
        "| `qty` | `Integer` | mandatory |",
        "",
        "Returns: `many structured`",
        "",
        "| Returned element | Type | Notes |",
        "| --- | --- | --- |",
        "| `id` | `Integer` |  |",
        "",
      ].join("\n"),
    );
  });

  test("a function is type Function and returns a built-in type", () => {
    const price = map("x.S.price");
    expect(price.frontmatter?.["type"]).toBe("Function");
    expect(price.body).toContain("| `id` | `Integer` |  |\n\nReturns: `Decimal(9, 2)`\n");
  });

  test("an action without parameters or return has only its heading and doc comment", () => {
    // A doc comment can't start a heading, so it can't fake an "## Authorization" section.
    expect(map("x.S.ping").body).toBe(
      "\n# ping\n\nChecks the line.\n\\## Authorization\nAnyone may ping.\n",
    );
  });

  test("association parameters and returned associations stay in their tables", () => {
    const ship = map("x.S.ship").body;
    expect(ship).toContain("| `to` | Association to [Orders](/model/x/S/Orders.md) |  |");
    expect(ship).toContain("| `order` | Association to [Orders](/model/x/S/Orders.md) |  |");
  });

  test("an unbound action's @requires and @restrict appear nowhere (ADR-0003)", () => {
    expect(serializeConcept(map("x.S.order"))).not.toMatch(/requires|restrict|shopper|buyer/);
  });
});

describe("bound actions on their entity", () => {
  test("each gets a subsection with its kind, doc, parameters and a linked return type", () => {
    expect(map("x.S.Orders").body).toContain(
      [
        "## Actions",
        "",
        "### cancel",
        "",
        "Action. Cancels it.",
        "",
        "| Parameter | Type | Notes |",
        "| --- | --- | --- |",
        "| `reason` | `String` |  |",
        "",
        "Returns: [Orders](/model/x/S/Orders.md)",
        "",
        "### total",
        "",
        "Function.",
        "",
        "Returns: [Money](/model/x/Money.md)",
        "",
      ].join("\n"),
    );
  });

  test("a bound action's @requires and @restrict appear nowhere (ADR-0003)", () => {
    expect(serializeConcept(map("x.S.Orders"))).not.toMatch(/requires|restrict|admin|clerk/);
  });

  test("the binding parameter in is left out: callers never pass it", () => {
    expect(map("x.S.Orders").body).not.toContain("`in`");
  });
});

describe("type mapper", () => {
  test("a type with values shows what it is based on and its values", () => {
    const status = map("x.Status");
    expect(status.frontmatter).toMatchObject({ type: "Type", description: "Order status." });
    expect(status.body).toBe(
      '\n# Status\n\nOrder status.\n\nBased on: `String(10)`\n\n## Values\n\n- `open` = `"O"`\n- `closed`\n',
    );
  });

  test("a structured type lists its elements", () => {
    expect(map("x.Address").body).toContain(
      "## Elements\n\n| Element | Type | Notes |\n| --- | --- | --- |\n| `street` | `String` |  |\n| `city` | `String` |  |\n",
    );
  });

  test("a type that is an association names its target", () => {
    expect(map("x.ToOrder").body).toBe(
      "\n# ToOrder\n\nBased on: Association to [Orders](/model/x/S/Orders.md)\n",
    );
  });

  test("a type based on a built-in type with a precision", () => {
    expect(map("x.Money").body).toBe("\n# Money\n\nBased on: `Decimal(9, 2)`\n");
  });
});

describe("aspect and event mappers", () => {
  test("an aspect is type Aspect with its elements", () => {
    const titled = map("x.Titled");
    expect(titled.frontmatter).toMatchObject({ type: "Aspect", tags: ["cds", "aspect", "x"] });
    expect(titled.body).toContain("| `title` | `String` |  |");
  });

  test("an aspect's compositions of aspects show what they compose", () => {
    const body = map("x.WithItems").body;
    expect(body).toContain("| `lines` | Composition of many `structured` |  |");
    expect(body).toContain("| `named` | Composition of many [Titled](/model/x/Titled.md) |  |");
  });

  test("an event is type Event with its payload elements", () => {
    const shipped = map("x.S.Shipped");
    expect(shipped.frontmatter).toMatchObject({
      type: "Event",
      description: "Something happened.",
    });
    expect(shipped.body).toContain("| `order` | `Integer` |  |\n| `at` | `Timestamp` |  |");
  });
});

describe("types in tables (maintainer decision for task 2.3)", () => {
  test("a type defined in the model links to its concept; sizes copied onto it are dropped", () => {
    const body = map("x.S.Orders").body;
    expect(body).toContain("| `status` | [Status](/model/x/Status.md) |  |");
    expect(body).toContain("| `ship` | [Address](/model/x/Address.md) |  |");
  });

  test('many of a model type is "many" and a link', () => {
    expect(map("x.S.Orders").body).toContain(
      "| `history` | many [Status](/model/x/Status.md) |  |",
    );
  });

  test("an element with its own enum lists its values in the notes", () => {
    expect(map("x.S.Orders").body).toContain(
      '| `kind` | `String` | values: `retail`, `wholesale` = `"W"` |',
    );
  });
});
