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

  test("exports the services, what they expose and the types they use, not the projections' sources", () => {
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

describe("the bookshop fixture with projectionSources (ADR-0012)", () => {
  test("also exports the entities the projections are built on", async () => {
    const model = (await cds.load(FIXTURE, { docs: true })) as unknown as Csn;
    const withSources = selectExported(model, "services", { projectionSources: true });
    expect([...withSources].filter((name) => name.startsWith("sample.")).sort()).toEqual([
      "sample.bookshop.Authors",
      "sample.bookshop.Books",
      "sample.bookshop.Genres",
    ]);
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
    exported = selectExported(model, "services", { projectionSources: true });
    concepts = mapSelected(model, exported);
  });

  test("the annotations arrive as CAP compiles them", () => {
    expect([...exported].sort()).toEqual(["x.Orders", "x.S", "x.S.Orders"]);
    const orders = concepts.find((each) => each.path === "model/x/Orders.md")!;
    expect(orders.frontmatter?.["tags"]).toEqual(["cds", "entity", "x", "sales"]);
    expect(orders.body).not.toMatch(/note|audit|Audit/);
  });
});

// Every shape the review found, compiled by CAP: @okf: false copied from an aspect, a type and a
// source; a type of an excluded entity; an excluded service; generated composition children.
const SHAPES = `
  namespace z;
  @okf: false aspect Tracked { trackedAt : Timestamp; }
  @okf: false type Money : Decimal(9, 2);
  @okf: false entity Secret { key ID : Integer; status : String(10); owner : String; }
  aspect Line { qty : Integer; }
  entity Orders {
    key ID : Integer;
    amount : Money;
    stat   : type of Secret:status;
    secret : Association to Secret;
    title  : localized String;
    lines  : Composition of many Line;
    items  : Composition of many { key pos : Integer; };
  }
  entity Base : Tracked { key ID : Integer; }
  @okf: false service Internal { entity A as projection on z.Orders; action purge(); }
  service S {
    @(restrict: [{ grant: 'READ', where: (secret.owner = $user) }])
    entity Orders as projection on z.Orders actions { action charge(amount : Money) returns Money; };
    entity Bases as projection on z.Base;
    entity OnSecret as projection on z.Secret;
  }
`;
const EXCLUDED = [
  "z.Tracked",
  "z.Money",
  "z.Secret",
  "z.Base",
  "z.Internal",
  "z.S.Bases",
  "z.S.OnSecret",
];
let model: Csn;

beforeAll(() => {
  model = cds.compile(SHAPES) as unknown as Csn;
});

/** Every exported concept's whole text, frontmatter included. */
function texts(include: "services" | "all"): { path: string; text: string }[] {
  return mapSelected(model, selectExported(model, include)).map((concept) => ({
    path: concept.path,
    text: serializeConcept(concept),
  }));
}

describe("excluded definitions on CSN compiled by CAP", () => {
  test.each(["services", "all"] as const)(
    "with include %s, no concept names an excluded definition anywhere",
    (include) => {
      const words = [
        ...EXCLUDED,
        ...EXCLUDED.map((name) => name.replace(/\./g, "/")),
        "Money",
        "Tracked",
        "Secret",
        "Internal",
      ];
      for (const { path, text } of texts(include)) {
        for (const word of words) {
          const asToken = new RegExp(`(^|[^\\w.])${word.replace(/[./]/g, "\\$&")}($|[^\\w])`);
          expect({ path, word, named: asToken.test(text) }).toEqual({ path, word, named: false });
        }
      }
    },
  );

  test("definitions under an excluded one are excluded too, in both modes", () => {
    for (const include of ["services", "all"] as const) {
      const exported = selectExported(model, include);
      expect([...exported].filter((name) => name.startsWith("z.Internal"))).toEqual([]);
    }
  });
});

describe("excluded definitions on CSN compiled by CAP: what stays visible", () => {
  test("an element of an excluded type, or a type of an excluded entity, shows its built-in type", () => {
    const orders = texts("all").find((each) => each.path === "model/z/Orders.md")!.text;
    expect(orders).toContain("| `amount` | `Decimal(9, 2)` |  |");
    expect(orders).toContain("| `stat` | `String(10)` |  |");
  });

  test("a bound action keeps its parameter and return value, with their built-in types", () => {
    const projection = texts("services").find((each) => each.path === "model/z/S/Orders.md")!.text;
    expect(projection).toContain(
      "### charge\n\nAction.\n\n| Parameter | Type | Notes |\n| --- | --- | --- |\n| `amount` | `Decimal(9, 2)` |  |\n\nReturns: `Decimal(9, 2)`",
    );
  });

  // Maintainer decision: the one exception to "never mention". The rule is shown as CAP applies
  // it, path included; the section is only for authenticated readers (ADR-0003).
  test("an auth where-condition is kept as CAP applies it, hidden association path included", () => {
    const projection = texts("services").find((each) => each.path === "model/z/S/Orders.md")!.text;
    expect(projection).toContain("`secret.owner = $user.id`");
  });

  test("a named aspect composition reaches its generated target, not the aspect", () => {
    const exported = selectExported(model, "services", { projectionSources: true });
    expect(exported.has("z.Orders.lines")).toBe(true);
    expect(exported.has("z.Line")).toBe(false);
    const byDefault = selectExported(model, "services");
    expect([...byDefault].some((name) => name.endsWith("Orders.lines"))).toBe(true);
    expect(byDefault.has("z.Line")).toBe(false);
  });
});
