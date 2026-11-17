import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { describedOf } from "../../src/export/mappers/shared";

// Task 4.12: CAP generates a ".texts" entity for every entity with localized elements. It has no
// doc comment or @description of its own, so its concept had none (a W1 warning in every app
// with localized data). It now gets one from its parent entity.

const MODEL: Csn = {
  definitions: {
    "shop.Genres": {
      kind: "entity",
      "@title": "Book genres",
      elements: {
        name: { type: "cds.String", localized: true },
        texts: { type: "cds.Composition", target: "shop.Genres.texts" },
      },
    },
    "shop.Genres.texts": {
      kind: "entity",
      elements: { locale: { key: true, type: "cds.String" } },
    },
    "S.Genres": {
      kind: "entity",
      projection: { from: { ref: ["shop.Genres"] } },
      elements: { texts: { type: "cds.Composition", target: "S.Genres.texts" } },
    },
    "S.Genres.texts": {
      kind: "entity",
      projection: { from: { ref: ["shop.Genres.texts"] } },
      elements: {},
    },
    // Named like a texts entity, but no parent composition points at it: left alone.
    "shop.Notes.texts": { kind: "entity", elements: {} },
    "shop.Described.texts": { kind: "entity", "@description": "Own words.", elements: {} },
    "shop.Described": {
      kind: "entity",
      elements: { texts: { type: "cds.Composition", target: "shop.Described.texts" } },
    },
  },
};

const context = defaultMapperContext(MODEL);
const describe_ = (name: string) => describedOf(name, MODEL.definitions[name]!, context);

describe("describedOf: generated .texts entities (task 4.12)", () => {
  test("get a description from their parent's title", () => {
    expect(describe_("shop.Genres.texts")).toBe(
      "Translated texts of Book genres, one row per language.",
    );
  });

  test("also as a service's projection, named after the service's entity", () => {
    expect(describe_("S.Genres.texts")).toBe("Translated texts of Genres, one row per language.");
  });

  test("keep a description of their own", () => {
    expect(describe_("shop.Described.texts")).toBe("Own words.");
  });

  test("an entity merely named .texts gets none", () => {
    expect(describe_("shop.Notes.texts")).toBeUndefined();
  });
});
