import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { entityMapper } from "../../src/export/mappers/entity";
import { mapperFor } from "../../src/export/mappers/index";

// Titles and descriptions written as "{i18n>key}" are shown in the default language (task 2.5).
// The mappers get the texts as a plain lookup, so they stay free of @sap/cds.

const TEXTS: Record<string, string> = {
  // A text that differs from its key, so a fallback to the key can't pass by accident.
  Books: "Book catalog",
  Empty: "",
  Hidden: "Shows <!-- okf:auth:start --> nothing",
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
    // As CAP's cds.localize does: every placeholder anywhere in a value, each on its own.
    ["a placeholder inside other text", "See {i18n>Books}!", "See Book catalog!"],
    [
      "two placeholders, one without a text",
      "{i18n>Books} and {i18n>Nope}",
      "Book catalog and Nope",
    ],
    ["an empty text counts as missing, as in CAP", "{i18n>Empty}", "Empty"],
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
      title: "Book catalog",
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

  test("a text in a service list can't start HTML or fake a marker", () => {
    const withService: Csn = {
      definitions: {
        S: { kind: "service" },
        "S.E": { kind: "entity", "@description": "{i18n>Hidden}", elements: {} },
      },
    };
    const service = mapperFor("service")!.map(
      "S",
      withService.definitions["S"]!,
      defaultMapperContext(withService, lookup),
    );
    expect(service.body).toContain(
      "- [E](/model/S/E.md) - Shows &lt;!-- okf:auth:start --> nothing",
    );
  });
});
