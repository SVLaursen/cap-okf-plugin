import path from "node:path";
import cds from "@sap/cds";
import type { Csn } from "../../src/export/csn";
import { defaultLanguageTexts } from "../../src/export/i18n";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { mapperFor, registryKeyOf } from "../../src/export/mappers/index";

// Task 2.5 on the bookshop fixture: CAP's own i18n bundle, in the default language.

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");

let capModel: Awaited<ReturnType<typeof cds.load>>;
let model: Csn;

beforeAll(async () => {
  capModel = await cds.load(FIXTURE, { docs: true });
  // cds.load's result is CAP's own CSN type; ours names only the parts the mappers read.
  model = capModel as unknown as Csn;
});

function map(name: string, language?: string) {
  const definition = model.definitions[name]!;
  const context = defaultMapperContext(model, defaultLanguageTexts(cds, model, language));
  return mapperFor(registryKeyOf(definition))!.map(name, definition, context);
}

describe("texts from the fixture's _i18n folder", () => {
  test("Books gets its description in the default language", () => {
    expect(map("sample.bookshop.Books").frontmatter).toMatchObject({
      title: "Books",
      description: "Books that the shop sells, with stock and authors",
    });
  });

  test("a projection shows its source's text too", () => {
    expect(map("CatalogService.Books").frontmatter?.["description"]).toBe(
      "Books that the shop sells, with stock and authors",
    );
  });

  test("the service list shows the text", () => {
    expect(map("CatalogService").body).toContain(
      "- [Books](/model/CatalogService/Books.md) - Books that the shop sells, with stock and authors",
    );
  });

  // The type User has @title: '{i18n>UserID}'; the key differs from the text, so a fallback to
  // the key can't pass by accident.
  test("texts from @sap/cds/common come from CAP's own bundle", () => {
    expect(map("User").frontmatter?.["title"]).toBe("User ID");
  });

  test("another language can be chosen", () => {
    expect(map("sample.bookshop.Books", "de").frontmatter).toMatchObject({
      title: "Bücher",
      description: "Bücher, die der Laden verkauft, mit Bestand und Autoren",
    });
  });

  test("the default is the app's configured default language", () => {
    expect(defaultLanguageTexts(cds, model)("Books")).toBe(
      cds.i18n.bundle4(capModel).at("Books", cds.env.i18n.default_language),
    );
  });
});
