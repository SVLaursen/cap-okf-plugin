import { serializeConcept, type Concept } from "../../src/core/concept";
import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { mapperFor, registryKeyOf } from "../../src/export/mappers/index";
import { selectExported } from "../../src/export/selection";

// Task 2.6. Maintainer decisions: include "services" exports what the services link to,
// transitively; a concept never mentions a definition that isn't exported (as cap-mcp v2 and
// CAP do): references to it are left out, not written as names; @okf: false works on
// definitions, elements, parameters and bound actions.

const MODEL: Csn = {
  definitions: {
    S: { kind: "service", "@requires": "Clerk" },
    "S.Books": {
      kind: "entity",
      projection: { from: { ref: ["db.Books"] } },
      elements: { ID: { key: true, type: "cds.Integer" } },
      actions: {
        report: { kind: "function", returns: { type: "db.Report" } },
        purge: { kind: "action", "@okf": false },
      },
    },
    "S.Secrets": { kind: "entity", "@okf": false, elements: {} },
    "S.Hidden": {
      kind: "entity",
      projection: { from: { ref: ["db.Locked"] } },
      elements: { ID: { key: true, type: "cds.Integer" } },
    },
    "db.Books": {
      kind: "entity",
      doc: "A book.",
      includes: ["cuid"],
      "@okf.tags": ["shop", "catalog"],
      elements: {
        ID: { key: true, type: "cds.Integer" },
        status: { type: "x.Status" },
        author: { type: "cds.Association", target: "db.Authors" },
        secret: { type: "cds.Association", target: "x.Hidden" },
        flag: { type: "x.HiddenType" },
        internal: { type: "cds.String", "@okf": false },
        audit: { type: "cds.Association", target: "db.Audit", "@okf": false },
      },
    },
    "db.Authors": { kind: "entity", elements: { ID: { key: true, type: "cds.Integer" } } },
    "db.Report": { kind: "type", elements: { n: { type: "cds.Integer" } } },
    "db.Audit": { kind: "entity", elements: {} },
    "db.Locked": { kind: "entity", "@okf": false, doc: "Locked away.", elements: {} },
    "db.Unused": { kind: "entity", elements: {} },
    "x.Status": { kind: "type", type: "cds.String", "@okf.tags": "status" },
    "x.Hidden": { kind: "entity", "@okf": false, elements: {} },
    "x.HiddenType": { kind: "type", "@okf": false, type: "cds.String" },
    cuid: { kind: "aspect", elements: { ID: { key: true, type: "cds.UUID" } } },
    "x.ctx": { kind: "context" },
  },
};

const SERVICES = selectExported(MODEL, "services");

function map(name: string, exported = SERVICES): Concept {
  const definition = MODEL.definitions[name]!;
  const context = defaultMapperContext(MODEL, undefined, (each) => exported.has(each));
  return mapperFor(registryKeyOf(definition))!.map(name, definition, context);
}

describe("selectExported", () => {
  test('"services" exports the services and everything they link to, transitively', () => {
    expect([...SERVICES].sort()).toEqual([
      "S",
      "S.Books",
      "S.Hidden",
      "db.Authors",
      "db.Books",
      "db.Report",
      "x.Status",
    ]);
  });

  test('"all" exports every definition with a mapper, except those marked @okf: false', () => {
    expect([...selectExported(MODEL, "all")].sort()).toEqual([
      "S",
      "S.Books",
      "S.Hidden",
      "cuid",
      "db.Audit",
      "db.Authors",
      "db.Books",
      "db.Report",
      "db.Unused",
      "x.Status",
    ]);
  });

  test("a reference from a left-out element or bound action doesn't make anything reachable", () => {
    expect(SERVICES.has("db.Audit")).toBe(false);
  });
});

describe("a concept never mentions what isn't exported", () => {
  const books = map("db.Books");
  const text = serializeConcept(books);

  test("associations and includes of excluded definitions are left out", () => {
    for (const name of ["secret", "x.Hidden", "Hidden", "HiddenType", "cuid", "Includes"]) {
      expect(text).not.toContain(name);
    }
  });

  // Maintainer decision: the element exists on the wire, so it stays, with its built-in type.
  test("an element of an excluded type shows the built-in type instead", () => {
    expect(books.body).toContain("| `flag` | `String` |  |");
  });

  test("elements and associations marked @okf: false are left out", () => {
    expect(text).not.toContain("internal");
    expect(text).not.toContain("audit");
  });

  test("what is exported is still shown and linked", () => {
    expect(books.body).toContain("| `status` | [Status](/model/x/Status.md) |  |");
    expect(books.body).toContain("- `author` → [Authors](/model/db/Authors.md) (to one)");
  });

  test("a bound action marked @okf: false is left out; one returning an exported type stays", () => {
    const body = map("S.Books").body;
    expect(body).not.toContain("purge");
    expect(body).toContain("### report\n\nFunction.\n\nReturns: [Report](/model/db/Report.md)");
  });

  test("a projection on an excluded source names no source and takes nothing from it", () => {
    const hidden = map("S.Hidden");
    expect(hidden.body).toContain("\n# Hidden\n\nProjection\n");
    expect(serializeConcept(hidden)).not.toMatch(/Locked/);
  });

  test("the service lists only exported members", () => {
    const body = map("S").body;
    expect(body).toContain("- [Books](/model/S/Books.md)");
    expect(body).not.toContain("Secrets");
  });

  test("with everything exported, a reference to a reachable definition is a link again", () => {
    const all = selectExported(MODEL, "all");
    expect(map("db.Books", all).body).toContain("Includes: `cuid`");
  });
});

describe("authorization section and excluded definitions", () => {
  test("a composition child whose restricted root isn't exported shows the root's rules unnamed", () => {
    const model: Csn = {
      definitions: {
        Orders: { kind: "entity", "@okf": false, "@requires": "Clerk", elements: {} },
        "Orders.items": {
          kind: "entity",
          elements: { up_: { key: true, type: "cds.Association", target: "Orders" } },
        },
      },
    };
    const context = defaultMapperContext(model, undefined, (name) => name !== "Orders");
    const body = mapperFor("entity")!.map(
      "Orders.items",
      model.definitions["Orders.items"]!,
      context,
    ).body;
    expect(body).toContain("### From the composition it is part of\n\nRequires: `Clerk`");
    expect(body).not.toMatch(/\[Orders\]|`Orders`/);
  });

  test("a member of an excluded service keeps the service's rules, without naming it", () => {
    const withoutService = new Set([...SERVICES].filter((name) => name !== "S"));
    const section = map("S.Books", withoutService).body;
    expect(section).toContain("### From its service\n\nRequires: `Clerk`");
    expect(section).not.toContain("[S]");
  });
});

describe("@okf.tags", () => {
  test("skips tags that aren't text or are empty", () => {
    const model: Csn = {
      definitions: {
        E: { kind: "entity", "@okf.tags": ["ok", "", { a: 1 }, 7, "  "], elements: {} },
      },
    };
    const concept = mapperFor("entity")!.map(
      "E",
      model.definitions["E"]!,
      defaultMapperContext(model),
    );
    expect(concept.frontmatter?.["tags"]).toEqual(["cds", "entity", "ok"]);
  });

  test("adds tags after the generated ones, as a list or a single tag", () => {
    expect(map("db.Books").frontmatter?.["tags"]).toEqual([
      "cds",
      "entity",
      "db",
      "shop",
      "catalog",
    ]);
    expect(map("x.Status").frontmatter?.["tags"]).toEqual(["cds", "type", "x", "status"]);
  });
});

// Shapes CAP never compiles, handled without crashing and without naming anything.
describe("selection and rendering on incomplete models", () => {
  const ODD: Csn = {
    definitions: {
      S: { kind: "service" },
      "S.E": {
        kind: "entity",
        elements: {
          gone: { type: { ref: ["x.Missing", "status"] } },
          deep: { type: { ref: ["S.E", "nope", "deeper"] } },
          outside: { type: "cds.Association", target: "other.Thing" },
          list: { items: { type: "x.Listed" } },
        },
      },
      "S.op": {
        kind: "action",
        returns: { "@okf": false, type: "x.Result" },
      },
      "x.Result": { kind: "type", type: "cds.String" },
      "x.Listed": { kind: "type", type: "cds.String" },
    },
  };

  test("references outside the model reach nothing; many of a model type reaches it", () => {
    expect([...selectExported(ODD, "services")].sort()).toEqual(["S", "S.E", "S.op", "x.Listed"]);
  });

  test("a type of something that isn't there is shown as unknown", () => {
    const exported = selectExported(ODD, "services");
    const context = defaultMapperContext(ODD, undefined, (name) => exported.has(name));
    const body = mapperFor("entity")!.map("S.E", ODD.definitions["S.E"]!, context).body;
    expect(body).toContain("| `gone` | `unknown` |  |");
    expect(body).toContain("| `deep` | `unknown` |  |");
  });

  test("a return value marked @okf: false is neither followed nor shown", () => {
    const exported = selectExported(ODD, "services");
    expect(exported.has("x.Result")).toBe(false);
    const context = defaultMapperContext(ODD, undefined, (name) => exported.has(name));
    expect(mapperFor("action")!.map("S.op", ODD.definitions["S.op"]!, context).body).toBe(
      "\n# op\n",
    );
  });
});
