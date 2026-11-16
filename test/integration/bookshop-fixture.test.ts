import path from "node:path";
import cds from "@sap/cds";

// The bookshop fixture is the input for every exporter and golden test in later phases.
// These tests pin down what it contains, so a careless edit to the fixture fails here first.

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");

const MANAGER_ONLY = [{ grant: "*", to: "catalog-manager" }];

/** The parts of a CSN definition these tests read. */
interface Definition {
  kind?: string;
  projection?: { from: { ref: string[] } };
  actions?: Record<string, { kind: string; params?: Record<string, unknown> }>;
  [annotation: `@${string}`]: unknown;
}

type Csn = Awaited<ReturnType<typeof cds.load>>;

let csn: Csn;

beforeAll(async () => {
  csn = await cds.load(FIXTURE);
});

/** A definition by name, typed as these tests read it; undefined when the fixture lacks it. */
function find(name: string): Definition | undefined {
  // CAP types definitions broadly; Definition names the parts these tests rely on.
  return (csn.definitions as unknown as Record<string, Definition | undefined>)[name];
}

function definition(name: string): Definition {
  const found = find(name);
  if (!found) throw new Error(`the fixture has no definition ${name}`);
  return found;
}

function collectI18nKeys(): Set<string> {
  const keys = new Set<string>();
  const text = JSON.stringify(csn.definitions);
  for (const match of text.matchAll(/\{i18n>([^}]+)\}/g)) {
    if (match[1]) keys.add(match[1]);
  }
  return keys;
}

describe("bookshop fixture: definitions", () => {
  test.each([
    ["sample.bookshop.Books", "entity"],
    ["sample.bookshop.Authors", "entity"],
    ["sample.bookshop.Genres", "entity"],
    ["CatalogService", "service"],
    ["CatalogService.Books", "entity"],
    ["CatalogService.Authors", "entity"],
    ["CatalogService.Genres", "entity"],
    ["CatalogService.BookReserved", "event"],
    ["AdminService", "service"],
    ["AdminService.Books", "entity"],
    ["AdminService.Authors", "entity"],
    ["AdminService.Genres", "entity"],
  ])("defines %s as %s", (name, kind) => {
    expect(find(name)?.kind).toBe(kind);
  });

  test("CatalogService.Books is a projection on the domain entity", () => {
    expect(definition("CatalogService.Books").projection?.from.ref).toEqual([
      "sample.bookshop.Books",
    ]);
  });

  test("CatalogService.Books has a bound action reserve", () => {
    const reserve = definition("CatalogService.Books").actions?.["reserve"];
    expect(reserve?.kind).toBe("action");
    expect(Object.keys(reserve?.params ?? {})).toEqual(["copies"]);
  });
});

describe("bookshop fixture: authorization", () => {
  test("AdminService requires an authenticated user", () => {
    expect(definition("AdminService")["@requires"]).toBe("authenticated-user");
  });

  // The authorization section (task 2.4) is rendered from exactly these rules.
  test.each([
    [
      "AdminService.Books",
      [
        { grant: "READ", to: "authenticated-user" },
        { grant: ["CREATE", "UPDATE", "DELETE"], to: "catalog-manager" },
      ],
    ],
    ["AdminService.Authors", MANAGER_ONLY],
    ["AdminService.Genres", MANAGER_ONLY],
  ])("%s carries its @restrict rules", (name, rules) => {
    expect(definition(name)["@restrict"]).toEqual(rules);
  });
});

describe("bookshop fixture: i18n", () => {
  test("sample.bookshop.Books has an i18n title and description", () => {
    const books = definition("sample.bookshop.Books");
    expect(books["@title"]).toBe("{i18n>Books}");
    expect(books["@description"]).toBe("{i18n>BooksDescription}");
  });

  // Resolve through CAP itself, so the test also fails if CAP can no longer find _i18n/.
  test.each([
    ["en", "Books"],
    ["de", "Bücher"],
  ])("CAP resolves every i18n key the model uses in %s", (locale, booksText) => {
    const texts = cds.i18n.bundle4(csn).texts4(locale);
    expect(texts["Books"]).toBe(booksText);
    for (const key of collectI18nKeys()) expect(texts[key]).toBeDefined();
  });
});
