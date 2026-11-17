import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept, type Concept } from "../../src/core/concept";
import { validateBundle } from "../../src/core/validate";
import type { Csn } from "../../src/export/csn";
import { exportModel } from "../../src/export/exporter";
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

function files(concepts: Concept[]): { path: string; text: string }[] {
  return concepts.map((concept) => ({ path: concept.path, text: serializeConcept(concept) }));
}

describe("exportModel on the bookshop fixture", () => {
  test("two runs with the same inputs give byte-identical output", () => {
    expect(files(run())).toEqual(files(run()));
  });

  test("the output is sorted by path", () => {
    const paths = run().map((concept) => concept.path);
    expect(paths).toEqual([...paths].sort());
  });

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
      "model/sample/bookshop/Authors.md",
      "model/sample/bookshop/Books.md",
      "model/sample/bookshop/Genres.md",
      "model/sample/bookshop/index.md",
      "model/sample/index.md",
    ]);
  });

  test("every generated concept records who generated it and when, to the second", () => {
    for (const concept of run().filter((each) => !each.path.endsWith("index.md"))) {
      expect({ path: concept.path, generated: concept.frontmatter?.["generated"] }).toEqual({
        path: concept.path,
        generated: { by: "cap-okf/1.2.3", at: "2026-11-17T09:30:00Z" },
      });
    }
  });
});

describe("exportModel output details", () => {
  test("the root index declares the OKF version and lists model/", () => {
    const root = run().find((concept) => concept.path === "index.md")!;
    expect(root.frontmatter).toEqual({ okf_version: "0.2" });
    expect(root.body).toContain("* [model](model/index.md) - 13 concepts:");
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

  test('include "all" exports more, still without a single finding', () => {
    const all = run({ include: "all" });
    expect(all.length).toBeGreaterThan(run().length);
    expect(validateBundle(files(all)).filter((finding) => finding.severity === "error")).toEqual(
      [],
    );
  });

  test("without texts, i18n placeholders fall back to their keys", () => {
    const books = run({ texts: undefined }).find(
      (concept) => concept.path === "model/sample/bookshop/Books.md",
    )!;
    expect(books.frontmatter?.["description"]).toBe("BooksDescription");
  });
});
