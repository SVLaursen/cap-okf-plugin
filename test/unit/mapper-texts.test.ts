import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { entityMapper } from "../../src/export/mappers/entity";

// Titles and descriptions written as "{i18n>key}" are shown in the default language (task 2.5).
// The mappers get the texts as a plain lookup, so they stay free of @sap/cds.

const TEXTS: Record<string, string> = {
  Books: "Books",
  BooksDescription: "Books that the shop sells.",
  Weird: "A <b> | text",
};

const lookup = (key: string) => TEXTS[key];

describe("the mapper context's text function", () => {
  const context = defaultMapperContext({ definitions: {} }, lookup);

  test.each([
    ["a placeholder with a text", "{i18n>BooksDescription}", "Books that the shop sells."],
    ["a placeholder without a text falls back to its key", "{i18n>NoSuchKey}", "NoSuchKey"],
    ["plain text stays as it is", "Plain title", "Plain title"],
    ["a placeholder inside other text is not one", "See {i18n>Books}", "See {i18n>Books}"],
  ])("%s", (_label, value, text) => {
    expect(context.text(value)).toBe(text);
  });

  test("without a lookup, every placeholder falls back to its key", () => {
    expect(defaultMapperContext({ definitions: {} }).text("{i18n>Books}")).toBe("Books");
  });
});

describe("mapped concepts use the texts", () => {
  const model: Csn = {
    definitions: {
      Books: {
        kind: "entity",
        "@title": "{i18n>Books}",
        "@description": "{i18n>BooksDescription}",
        elements: {},
      },
      Odd: { kind: "entity", "@title": "{i18n>Weird}", elements: {} },
    },
  };

  test("title and description come from the texts", () => {
    const books = entityMapper.map(
      "Books",
      model.definitions["Books"]!,
      defaultMapperContext(model, lookup),
    );
    expect(books.frontmatter).toMatchObject({
      title: "Books",
      description: "Books that the shop sells.",
    });
  });

  test("a text is escaped like any other model text", () => {
    const odd = entityMapper.map(
      "Odd",
      model.definitions["Odd"]!,
      defaultMapperContext(model, lookup),
    );
    expect(odd.body).toContain("\n# A &lt;b> | text\n");
  });
});
