import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept, type Concept } from "../../src/core/concept";
import { validateBundle } from "../../src/core/validate";
import type { Csn, CsnDefinition } from "../../src/export/csn";
import { exportModel, type ExportOptions } from "../../src/export/exporter";
import { defaultLanguageTexts } from "../../src/export/i18n";

// The exporter turns the whole model into one bundle (task 2.7). Its inputs include the clock and
// the version, so the same inputs always give the same bytes.

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");
const NOW = new Date("2026-11-17T09:30:00.123Z");
const VERSION = "1.2.3";

let model: Csn;

beforeAll(async () => {
  // cds.load's result is CAP's own CSN type; ours names only the parts the mappers read.
  model = (await cds.load(FIXTURE, { docs: true })) as unknown as Csn;
});

function run(options: Partial<Parameters<typeof exportModel>[1]> = {}): Concept[] {
  return exportModel(model, {
    include: "services",
    now: NOW,
    version: VERSION,
    texts: defaultLanguageTexts(cds, model),
    ...options,
  });
}

function isIndex(filePath: string): boolean {
  return filePath === "index.md" || filePath.endsWith("/index.md");
}

function deepFreeze(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const each of Object.values(value)) deepFreeze(each);
}

function files(concepts: Concept[]): { path: string; text: string }[] {
  return concepts.map((concept) => ({ path: concept.path, text: serializeConcept(concept) }));
}

describe("exportModel on the bookshop fixture", () => {
  // Two separate loads, and a frozen model: no run can change the model or leave state behind.
  test("two runs on two separate loads give byte-identical output", async () => {
    const again = (await cds.load(FIXTURE, { docs: true })) as unknown as Csn;
    // CAP caches the i18n bundle on the model, so the texts are built before it is frozen.
    const texts = defaultLanguageTexts(cds, again);
    deepFreeze(again);
    const second = exportModel(again, { include: "services", now: NOW, version: VERSION, texts });
    expect(files(second)).toEqual(files(run()));
  });

  // The order definitions are declared in still shapes a service's member list, on purpose (2.2).
  test("which files there are doesn't depend on the order of definitions", () => {
    const reversed: Csn = {
      definitions: Object.fromEntries(Object.entries(model.definitions).reverse()),
    };
    Object.defineProperty(reversed, "$sources", {
      value: (model as unknown as { $sources: string[] }).$sources,
    });
    const paths = (csn: Csn) =>
      exportModel(csn, { include: "services", now: NOW, version: VERSION }).map(
        (each) => each.path,
      );
    expect(paths(reversed)).toEqual(paths(model));
  });
});

describe("exportModel contents", () => {
  test("gives the exported concepts, an index for model/ and each folder below, and a root index", () => {
    expect(run().map((concept) => concept.path)).toEqual([
      "index.md",
      "model/AdminService.md",
      "model/AdminService/Authors.md",
      "model/AdminService/Books.md",
      "model/AdminService/Genres.md",
      "model/AdminService/index.md",
      "model/CatalogService.md",
      "model/CatalogService/Authors.md",
      "model/CatalogService/BookReserved.md",
      "model/CatalogService/Books.md",
      "model/CatalogService/Genres.md",
      "model/CatalogService/index.md",
      "model/User.md",
      "model/index.md",
    ]);
  });

  // ADR-0012: the database entities under the services' projections only with the option.
  test("with projectionSources, also the entities the projections are built on", () => {
    expect(run({ projectionSources: true }).map((concept) => concept.path)).toEqual(
      expect.arrayContaining([
        "model/sample/bookshop/Authors.md",
        "model/sample/bookshop/Books.md",
        "model/sample/bookshop/Genres.md",
      ]),
    );
  });

  test("every generated concept records who generated it and when, to the second", () => {
    for (const concept of run().filter((each) => !isIndex(each.path))) {
      expect({ path: concept.path, generated: concept.frontmatter?.["generated"] }).toEqual({
        path: concept.path,
        generated: { by: "cap-okf/1.2.3", at: "2026-11-17T09:30:00Z" },
      });
    }
  });
});

describe("exportModel output details", () => {
  // Spec §8: index files carry no frontmatter, except okf_version in the root one.
  test("index files below the root have no frontmatter, so no generated stamp", () => {
    const indexes = run().filter((each) => isIndex(each.path) && each.path !== "index.md");
    expect(indexes.length).toBeGreaterThanOrEqual(3);
    for (const index of indexes) expect(index.frontmatter).toBeNull();
  });

  test("the root index declares the OKF version and lists model/", () => {
    const root = run().find((concept) => concept.path === "index.md")!;
    expect(root.frontmatter).toEqual({ okf_version: "0.2" });
    expect(root.body).toContain("* [model](model/index.md) - 10 concepts:");
  });

  test("the whole bundle validates without a single finding", () => {
    expect(validateBundle(files(run()))).toEqual([]);
  });

  test("the clock and version change only the generated field", () => {
    const later = files(run({ now: new Date("2027-01-01T00:00:00Z"), version: "2.0.0" }));
    const normalize = (text: string) => text.replace(/generated:\n {2}by: .*\n {2}at: .*\n/, "");
    expect(later.map((file) => normalize(file.text))).toEqual(
      files(run()).map((file) => normalize(file.text)),
    );
  });

  test('include "all" exports more, still without errors', () => {
    const all = run({ include: "all" });
    expect(all.length).toBeGreaterThan(run().length);
    expect(validateBundle(files(all)).filter((finding) => finding.severity === "error")).toEqual(
      [],
    );
  });

  test("without texts, i18n placeholders fall back to their keys", () => {
    const books = run({ texts: undefined }).find(
      (concept) => concept.path === "model/CatalogService/Books.md",
    )!;
    expect(books.frontmatter?.["description"]).toBe("BooksDescription");
  });
});

// ADR-0007, path rules: two definitions must never end up at the same path, or at paths that
// differ only in letter case (macOS and Windows would treat them as one file).
describe("exportModel and path collisions", () => {
  const OPTIONS: ExportOptions = { include: "all", now: NOW, version: VERSION };

  test.each([
    [
      "the same path",
      {
        "my.index": { kind: "entity", elements: {} },
        "my.index_": { kind: "entity", elements: {} },
      },
      /my\.index_? — its path model\/my\/index_\.md is also the path of my\.index_?/,
    ],
    [
      "paths differing only in case",
      {
        "my.Books": { kind: "entity", elements: {} },
        "my.books": { kind: "entity", elements: {} },
      },
      /my\.books — its path model\/my\/books\.md differs from model\/my\/Books\.md \(my\.Books\) only in letter case/,
    ],
    [
      "folders differing only in case",
      { "my.A.x": { kind: "entity", elements: {} }, "my.a.y": { kind: "entity", elements: {} } },
      /folder model\/my\/a differs from model\/my\/A \(my\.A\.x\) only in letter case/,
    ],
  ])("is refused for %s", (_label, definitions, message) => {
    expect(() => exportModel({ definitions }, OPTIONS)).toThrow(message);
  });
});

const at = (file: string, line: number) => ({ file, line });

/** Hand-written CSN with a non-enumerable $location, as cds.load records it. */
function placed(location?: { file: string; line?: number }): CsnDefinition {
  const definition: CsnDefinition = { kind: "entity", elements: {} };
  if (location !== undefined) Object.defineProperty(definition, "$location", { value: location });
  return definition;
}

/** The message of the clash error exportModel throws for `definitions`. */
function messageOf(
  definitions: Record<string, CsnDefinition>,
  sourceFile?: (f: string) => string,
): string {
  const options: ExportOptions = { include: "all", now: NOW, version: VERSION };
  try {
    exportModel({ definitions }, { ...options, ...(sourceFile && { sourceFile }) });
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("no clash");
}

describe("exportModel and path collisions, messages", () => {
  test("without $location, names the definitions, the rule and the fix", () => {
    expect(messageOf({ "my.Books": placed(), "my.books": placed() })).toBe(
      "[okf] my.books — its path model/my/books.md differs from model/my/Books.md (my.Books) " +
        "only in letter case or Unicode form (M1).\n" +
        "  Rename one of the definitions, or leave one out with @okf: false.",
    );
  });

  test("the same path names both definitions' files and lines", () => {
    const message = messageOf({
      "my.index": placed(at("db/a.cds", 2)),
      "my.index_": placed(at("db/b.cds", 7)),
    });
    expect(message).toMatch(
      /^\[okf\] db\/b\.cds:7 — my\.index_: its path model\/my\/index_\.md is also the path of my\.index, db\/a\.cds:2 \(M1\)\.\n/,
    );
  });

  test("a folder clash names the definition with the new spelling and the one that first used the folder", () => {
    const message = messageOf({
      "my.A.x": placed(at("db/a.cds", 1)),
      "my.a.y": placed(at("db/b.cds", 4)),
    });
    expect(message).toMatch(
      /^\[okf\] db\/b\.cds:4 — my\.a\.y: the folder model\/my\/a differs from model\/my\/A \(my\.A\.x, db\/a\.cds:1\)/,
    );
  });

  test("sourceFile names the files, and Windows separators become /", () => {
    const message = messageOf(
      { "my.Books": placed(at("db\\a.cds", 2)), "my.books": placed(at("db\\a.cds", 3)) },
      (file) => `app\\${file}`,
    );
    expect(message).toMatch(
      /^\[okf\] app\/db\/a\.cds:3 — my\.books: .*\(my\.Books, app\/db\/a\.cds:2\)/,
    );
  });

  test("a $location without a line names the file alone", () => {
    const message = messageOf({
      "my.Books": placed({ file: "db/a.cds" }),
      "my.books": placed({ file: "db/a.cds" }),
    });
    expect(message).toMatch(/^\[okf\] db\/a\.cds — my\.books: /);
  });
});

// Task 3.2: a clash in a model loaded from files names the .cds file and line of the definition
// that clashes, and the earlier one, with rule M1 and a fix; no stack trace in the CLI.
describe("exportModel and path collisions, located", () => {
  const OPTIONS: ExportOptions = { include: "all", now: NOW, version: VERSION };

  test("names the .cds file and line of both definitions, the rule and the fix", async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-clash-"));
    try {
      fs.writeFileSync(
        path.join(folder, "clash.cds"),
        "namespace my;\nentity Books { key ID : Integer; }\nentity books { key ID : Integer; }\n",
      );
      const model = (await cds.load(path.join(folder, "clash.cds"))) as unknown as Csn;
      let thrown: unknown;
      try {
        exportModel(model, OPTIONS);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        name: "ModelClashError",
        message: expect.stringMatching(
          /^\[okf\] \S*clash\.cds:3 — my\.books: its path model\/my\/books\.md differs from model\/my\/Books\.md \(my\.Books, \S*clash\.cds:2\) only in letter case or Unicode form \(M1\)\.\n {2}Rename one of the definitions, or leave one out with @okf: false\.$/,
        ),
      });
      expect((thrown as Error).stack).toBe((thrown as Error).message);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("exportModel input checks", () => {
  const EMPTY: Csn = { definitions: {} };

  test("a version that isn't a non-empty text is refused", () => {
    expect(() => exportModel(EMPTY, { include: "all", now: NOW, version: "" })).toThrow(
      /\[okf\] version — /,
    );
  });

  test("a clock that isn't a valid date is refused", () => {
    expect(() =>
      exportModel(EMPTY, { include: "all", now: new Date("nope"), version: VERSION }),
    ).toThrow(/\[okf\] now — /);
  });

  test("each concept gets its own generated stamp, so changing one changes no other", () => {
    const concepts = run().filter((each) => each.frontmatter?.["generated"] !== undefined);
    expect(concepts[0]!.frontmatter!["generated"]).not.toBe(concepts[1]!.frontmatter!["generated"]);
  });
});
