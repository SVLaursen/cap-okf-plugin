import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept, type Concept } from "../../src/core/concept";
import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { mapperFor, registryKeyOf } from "../../src/export/mappers/index";
import { outsideAuthSection } from "../helpers/auth";

// Task 2.4's acceptance tests on the bookshop fixture: AdminService renders its authorization
// section, and nothing about authorization appears anywhere outside the markers (ADR-0003).

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");

let concepts: Concept[];

beforeAll(async () => {
  // cds.load's result is CAP's own CSN type; ours names only the parts the mappers read.
  const model = (await cds.load(FIXTURE, { docs: true })) as unknown as Csn;
  const context = defaultMapperContext(model);
  concepts = Object.entries(model.definitions).flatMap(([name, definition]) => {
    const mapper = mapperFor(registryKeyOf(definition));
    return mapper === undefined ? [] : [mapper.map(name, definition, context)];
  });
});

function text(path: string): string {
  const concept = concepts.find((each) => each.path === path);
  if (concept === undefined) throw new Error(`no concept at ${path}`);
  return serializeConcept(concept);
}

describe("AdminService's authorization section", () => {
  test("AdminService.Books shows its privileges and the service's requirement", () => {
    expect(text("model/AdminService/Books.md")).toContain(
      [
        "<!-- okf:auth:start -->",
        "## Authorization",
        "",
        "| Grant | To | Where |",
        "| --- | --- | --- |",
        "| `READ` | `authenticated-user` |  |",
        "| `CREATE`, `UPDATE`, `DELETE` | `catalog-manager` |  |",
        "",
        "### From service [AdminService](/model/AdminService.md)",
        "",
        "Requires: `authenticated-user`",
        "<!-- okf:auth:end -->",
      ].join("\n"),
    );
  });

  test("the service itself shows its requirement", () => {
    expect(text("model/AdminService.md")).toContain(
      "<!-- okf:auth:start -->\n## Authorization\n\nRequires: `authenticated-user`\n<!-- okf:auth:end -->",
    );
  });

  test("a read-only projection of CatalogService says so inside the section", () => {
    expect(text("model/CatalogService/Books.md")).toContain(
      "<!-- okf:auth:start -->\n## Authorization\n\nRead-only for every user.\n<!-- okf:auth:end -->",
    );
  });
});

describe("no authorization content outside the markers, in any fixture concept", () => {
  test("a scan of every concept finds none", () => {
    const leaks = concepts
      .map((concept) => ({
        path: concept.path,
        outside: outsideAuthSection(serializeConcept(concept)),
      }))
      .filter(({ outside }) =>
        // Only rendered rules count: "Read-only catalog" in a doc comment is the developer's prose.
        /@restrict|@requires|## Authorization|grant|Read-only for every user|catalog-manager|authenticated-user/i.test(
          outside,
        ),
      )
      .map(({ path }) => path);
    expect(leaks).toEqual([]);
  });

  test("the scan isn't vacuous: some concepts do have a section", () => {
    const withSection = concepts.filter((concept) =>
      concept.body.includes("<!-- okf:auth:start -->"),
    );
    expect(withSection.length).toBeGreaterThan(3);
  });
});
