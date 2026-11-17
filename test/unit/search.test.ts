import {
  foldPlural,
  queryWords,
  searchConcepts,
  type Searchable,
} from "../../src/serve/mcp/search";

// ADR-0012: searchConcepts matches any word, in title, tags, aliases, description, text and path,
// ranks title over tags and aliases over description over text, and is never empty for a text.

const concept = (
  path: string,
  frontmatter: Record<string, unknown>,
  body = "",
  curated = !path.startsWith("model/"),
): Searchable => ({ path, frontmatter: { type: "Guide", ...frontmatter }, body, curated });

const CONCEPTS: Searchable[] = [
  concept("guides/kpis.md", { title: "Shipping KPIs", description: "On-time rate." }),
  concept("guides/codes.md", { title: "Status codes", tags: ["orders"], aliases: ["state"] }),
  concept("guides/returns.md", { title: "Returns", description: "Taking orders back." }),
  concept("guides/notes.md", { title: "Notes" }, "The parcel leaves within two days."),
  concept("model/S/Orders.md", { type: "Entity", title: "Orders" }),
  concept("model/S/OrderItems.md", { type: "Entity", title: "Order items" }),
];

const paths = (hits: { path: string }[]) => hits.map((hit) => hit.path);

describe("searchConcepts: matching", () => {
  test("any word of a long question is enough", () => {
    const hits = searchConcepts(CONCEPTS, { text: "what is the on-time shipping rate" });
    expect(hits[0]).toEqual(expect.objectContaining({ path: "guides/kpis.md", matched: true }));
  });

  test("a word only in the text is found", () => {
    expect(paths(searchConcepts(CONCEPTS, { text: "parcel" }))).toEqual(["guides/notes.md"]);
  });

  test("an alias is found", () => {
    expect(paths(searchConcepts(CONCEPTS, { text: "state" }))).toEqual(["guides/codes.md"]);
  });

  test("plurals fold, and a word of four letters or more matches the start of a longer one", () => {
    expect(paths(searchConcepts(CONCEPTS, { text: "kpi" }))).toEqual(["guides/kpis.md"]);
    expect(paths(searchConcepts(CONCEPTS, { text: "ship" }))).toEqual(["guides/kpis.md"]);
    expect(searchConcepts(CONCEPTS, { text: "shi" }).every((hit) => !hit.matched)).toBe(true);
  });

  test("CamelCase paths count as words", () => {
    expect(paths(searchConcepts(CONCEPTS, { text: "items" }))).toEqual(["model/S/OrderItems.md"]);
  });
});

describe("searchConcepts: ranking", () => {
  test("title, then tags and aliases, then description; curated before generated on ties", () => {
    expect(paths(searchConcepts(CONCEPTS, { text: "orders" }))).toEqual([
      "model/S/OrderItems.md",
      "model/S/Orders.md",
      "guides/codes.md",
      "guides/returns.md",
    ]);
    const tie = [
      concept("model/A.md", { title: "Rate" }),
      concept("guides/z.md", { title: "Rate" }),
    ];
    expect(paths(searchConcepts(tie, { text: "rate" }))).toEqual(["guides/z.md", "model/A.md"]);
  });

  test("a whole word ranks above the start of a longer one", () => {
    const words = [
      concept("guides/a.md", { title: "Shipping" }),
      concept("guides/b.md", { title: "Ship" }),
    ];
    expect(paths(searchConcepts(words, { text: "ship" }))).toEqual(["guides/b.md", "guides/a.md"]);
  });

  test("more words found rank higher within the same field", () => {
    const hits = searchConcepts(CONCEPTS, { text: "order items" });
    expect(paths(hits).slice(0, 2)).toEqual(["model/S/OrderItems.md", "model/S/Orders.md"]);
  });
});

describe("searchConcepts: never empty", () => {
  test("no word found: the curated notes in index order, flagged matched = false", () => {
    const hits = searchConcepts(CONCEPTS, { text: "xylophone" });
    expect(paths(hits)).toEqual([
      "guides/codes.md",
      "guides/kpis.md",
      "guides/notes.md",
      "guides/returns.md",
    ]);
    expect(hits.every((hit) => !hit.matched)).toBe(true);
  });

  test("the type and tag filters and top still apply; with no curated note, every concept", () => {
    expect(paths(searchConcepts(CONCEPTS, { text: "xylophone", top: 1 }))).toEqual([
      "guides/codes.md",
    ]);
    const generatedOnly = CONCEPTS.filter((each) => !each.curated);
    expect(paths(searchConcepts(generatedOnly, { text: "xylophone" }))).toEqual([
      "model/S/OrderItems.md",
      "model/S/Orders.md",
    ]);
  });

  test("without text: the concepts of the type or tag, in index order", () => {
    expect(paths(searchConcepts(CONCEPTS, { type: "entity" }))).toEqual([
      "model/S/OrderItems.md",
      "model/S/Orders.md",
    ]);
    expect(paths(searchConcepts(CONCEPTS, { tag: "ORDERS" }))).toEqual(["guides/codes.md"]);
  });

  test("20 by default, at most 100; top 0, negative or fractional is handled", () => {
    const many = Array.from({ length: 150 }, (_, i) =>
      concept(`p${String(i).padStart(3, "0")}.md`, { title: "Shipping" }),
    );
    expect(searchConcepts(many, { text: "shipping" })).toHaveLength(20);
    expect(searchConcepts(many, { text: "shipping", top: 500 })).toHaveLength(100);
    expect(searchConcepts(many, { text: "shipping", top: 0 })).toHaveLength(20);
    expect(searchConcepts(many, { text: "shipping", top: -3 })).toHaveLength(20);
    expect(searchConcepts(many, { text: "shipping", top: 1.9 })).toHaveLength(1);
  });

  test("a hit carries title, description and tags as text, nulls where missing", () => {
    expect(searchConcepts(CONCEPTS, { text: "status" })[0]).toEqual({
      path: "guides/codes.md",
      type: "Guide",
      title: "Status codes",
      description: null,
      tags: "orders",
      matched: true,
    });
  });
});

describe("query words", () => {
  test("stop words go unless nothing else is left; words are folded and unique", () => {
    expect(queryWords("How are the Orders shipped?")).toEqual(["order", "shipped"]);
    expect(queryWords("the how")).toEqual(["the", "how"]);
  });

  test.each([
    ["categories", "category"],
    ["boxes", "box"],
    ["kpis", "kpi"],
    ["class", "class"],
    ["bus", "bus"],
  ])("foldPlural(%j) → %j", (word, folded) => {
    expect(foldPlural(word)).toBe(folded);
  });
});
