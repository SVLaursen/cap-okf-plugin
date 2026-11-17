import { bundleHash } from "../../src/serve/mcp/bundle-hash";
import { indexRows, type IndexRow } from "../../src/serve/mcp/index-rows";
import { runIndexQuery } from "../../src/serve/mcp/index-query";

// Task 4.5 step 2a (ADR-0010 Contract B): the pure parts of OkfService. The Index rows come from
// the files a reader may see (already filtered); the query runner answers exactly the queries
// @gavdi/cap-mcp's Index tools send (checked in its v2 source, PLAN 4.5).

const concept = (type: string, title: string, description: string, tags: string[], body = "") =>
  `---\ntype: ${type}\ntitle: ${title}\ndescription: ${description}\ntags:\n${tags.map((t) => `  - ${t}`).join("\n")}\n---\n\n${body}`;

const FILES = [
  {
    path: "index.md",
    text: '---\nokf_version: "0.2"\n---\n# Model\n\n* [Model](model/index.md) - M.\n',
  },
  { path: "model/index.md", text: "# Entity\n\n* [Books](x/Books.md) - Books.\n" },
  {
    path: "model/x/Books.md",
    text: concept(
      "Entity",
      "Books",
      "Books for sale.",
      ["cds", "entity"],
      "[Authors](/model/x/Authors.md), [Gone](/model/x/Gone.md), [web](https://x.org)\n",
    ),
  },
  {
    path: "model/x/Authors.md",
    text: concept("Entity", "Authors", "People who write books.", ["cds"]),
  },
  {
    path: "guides/ordering.md",
    text: concept(
      "Guide",
      "Ordering",
      "How an order works.",
      ["ordering", "books"],
      "See [Books](../model/x/Books.md).\n",
    ),
  },
  { path: "log.md", text: "# 2026-11-17\n\n* Started.\n" },
  { path: "broken.md", text: "no frontmatter\n" },
  { path: "bad-yaml.md", text: "---\ntype: [unclosed\n---\n" },
  { path: "refs/q.sql", text: "select 1;\n" },
];

const ROWS = indexRows(FILES);
const INDEX = { ref: ["OkfService.Index"] };
const paths = (rows: unknown) => (rows as IndexRow[]).map((row) => row.path);

describe("indexRows", () => {
  test("one row per concept that parses, sorted by path; reserved files and other files left out", () => {
    expect(paths(ROWS)).toEqual(["guides/ordering.md", "model/x/Authors.md", "model/x/Books.md"]);
  });

  test("a row has the frontmatter's type, title, description and tags, and the concepts it links to", () => {
    expect(ROWS.find((row) => row.path === "model/x/Books.md")).toEqual({
      path: "model/x/Books.md",
      type: "Entity",
      title: "Books",
      description: "Books for sale.",
      tags: "cds,entity",
      links: "model/x/Authors.md",
    });
    expect(ROWS.find((row) => row.path === "guides/ordering.md")?.links).toBe("model/x/Books.md");
  });
});

// Every where shape the query tool sends, and the rows it should select.
const WHERE_CASES: [unknown[], string[]][] = [
  [[{ ref: ["type"] }, "=", { val: "Guide" }], ["guides/ordering.md"]],
  [
    [{ ref: ["type"] }, "!=", { val: "Guide" }],
    ["model/x/Authors.md", "model/x/Books.md"],
  ],
  [
    [{ ref: ["title"] }, ">=", { val: "Books" }],
    ["guides/ordering.md", "model/x/Books.md"],
  ],
  [[{ ref: ["title"] }, "<", { val: "Books" }], ["model/x/Authors.md"]],
  [
    [{ ref: ["type"] }, "in", { list: [{ val: "Guide" }, { val: "Nope" }] }],
    ["guides/ordering.md"],
  ],
  [[{ ref: ["links"] }, "is", { val: null }], ["model/x/Authors.md"]],
  [
    [{ ref: ["links"] }, "is not", { val: null }],
    ["guides/ordering.md", "model/x/Books.md"],
  ],
  [
    [{ func: "contains", args: [{ ref: ["description"] }, { val: "BOOKS" }] }],
    ["model/x/Authors.md", "model/x/Books.md"],
  ],
  [
    [{ func: "startswith", args: [{ ref: ["path"] }, { val: "model/" }] }],
    ["model/x/Authors.md", "model/x/Books.md"],
  ],
  [[{ func: "endswith", args: [{ ref: ["title"] }, { val: "ing" }] }], ["guides/ordering.md"]],
  [
    [
      {
        func: "search",
        args: [{ list: [{ ref: ["title"] }, { ref: ["tags"] }] }, { val: "order" }],
      },
    ],
    ["guides/ordering.md"],
  ],
  [[{ func: "search", args: [{ ref: ["tags"] }, { val: "books" }] }], ["guides/ordering.md"]],
  [
    [
      { xpr: [{ ref: ["type"] }, "=", { val: "Entity" }] },
      "and",
      { xpr: [{ ref: ["title"] }, "=", { val: "Books" }] },
    ],
    ["model/x/Books.md"],
  ],
];

describe("runIndexQuery: what the query tool sends", () => {
  test("columns, orderBy with the key last, and paging", () => {
    const result = runIndexQuery(ROWS, {
      SELECT: {
        from: INDEX,
        columns: [{ ref: ["path"] }, { ref: ["title"] }],
        orderBy: [
          { ref: ["type"], sort: "desc" },
          { ref: ["path"], sort: "asc" },
        ],
        limit: { rows: { val: 2 }, offset: { val: 1 } },
      },
    });
    expect(result).toEqual([
      { path: "model/x/Authors.md", title: "Authors" },
      { path: "model/x/Books.md", title: "Books" },
    ]);
  });

  test.each(WHERE_CASES)("where %j", (where, expected) => {
    expect(paths(runIndexQuery(ROWS, { SELECT: { from: INDEX, where } }))).toEqual(expected);
  });
});

describe("runIndexQuery: the count query and the get tool", () => {
  test("the count query answers { total }", () => {
    const query = {
      SELECT: {
        one: true,
        from: INDEX,
        columns: [{ func: "count", args: ["*"], as: "total" }],
        where: [{ ref: ["type"] }, "=", { val: "Entity" }],
      },
    };
    expect(runIndexQuery(ROWS, query)).toEqual({ total: 2 });
  });

  test("the get tool reads one row by key, or nothing", () => {
    const get = (path: string) =>
      runIndexQuery(ROWS, {
        SELECT: {
          one: true,
          from: {
            ref: [{ id: "OkfService.Index", where: [{ ref: ["path"] }, "=", { val: path }] }],
          },
          columns: [{ ref: ["path"] }, { ref: ["type"] }],
        },
      });
    expect(get("guides/ordering.md")).toEqual({ path: "guides/ordering.md", type: "Guide" });
    expect(get("nope.md")).toBeUndefined();
  });
});

describe("runIndexQuery: anything else is refused with a clear message", () => {
  test.each([
    [
      "or",
      {
        where: [
          { xpr: [{ ref: ["type"] }, "=", { val: "A" }] },
          "or",
          { xpr: [{ ref: ["type"] }, "=", { val: "B" }] },
        ],
      },
    ],
    ["groupBy", { groupBy: [{ ref: ["type"] }] }],
    ["an unknown column", { columns: [{ ref: ["body"] }] }],
    ["an expand", { columns: [{ ref: ["links"], expand: ["*"] }] }],
    [
      "an unknown function",
      { where: [{ func: "matchesPattern", args: [{ ref: ["path"] }, { val: "x" }] }] },
    ],
    ["a where that isn't a list", { where: "type = 'A'" }],
    ["in without a list", { where: [{ ref: ["type"] }, "in", { val: "A" }] }],
    ["an orderBy that isn't a list", { orderBy: "path" }],
    ["is with a value", { where: [{ ref: ["type"] }, "is", { val: "A" }] }],
    ["a value that isn't a literal", { where: [{ ref: ["type"] }, "=", { ref: ["title"] }] }],
  ])("%s", (_label, extra) => {
    expect(() => runIndexQuery(ROWS, { SELECT: { from: INDEX, ...extra } })).toThrow(
      /^\[okf\] OkfService\.Index — .* isn't supported\.\n {2}/,
    );
  });
});

describe("bundleHash", () => {
  const files = [
    { path: "a.md", text: "A" },
    { path: "b.md", text: "B" },
  ];

  test("is the same for the same files in any order, and changes with any path or text", () => {
    const hash = bundleHash(files);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(bundleHash([...files].reverse())).toBe(hash);
    expect(bundleHash([{ path: "a.md", text: "A!" }, files[1]!])).not.toBe(hash);
    expect(bundleHash([{ path: "a2.md", text: "A" }, files[1]!])).not.toBe(hash);
  });

  test("can't be fooled by moving text between path and content", () => {
    expect(bundleHash([{ path: "ab", text: "" }])).not.toBe(bundleHash([{ path: "a", text: "b" }]));
  });
});

// Review of 4.5 step 2a.
describe("runIndexQuery: review cases", () => {
  const withNullType: IndexRow[] = [
    ...ROWS,
    { path: "untyped.md", type: null, title: null, description: null, tags: "solo", links: null },
  ];

  test("!= is true when exactly one side is null, as CAP's databases do; <> is refused", () => {
    const where = (op: string) => [{ ref: ["type"] }, op, { val: "Guide" }];
    expect(
      paths(runIndexQuery(withNullType, { SELECT: { from: INDEX, where: where("!=") } })),
    ).toContain("untyped.md");
    expect(() =>
      runIndexQuery(withNullType, { SELECT: { from: INDEX, where: where("<>") } }),
    ).toThrow(/the operator "<>" isn't supported/);
  });

  test("a query as CAP hands it over: a limit without offset, implicit key orderBy", () => {
    const result = runIndexQuery(ROWS, {
      SELECT: {
        from: INDEX,
        limit: { rows: { val: 1000 } },
        orderBy: [{ ref: ["path"], sort: "asc", implicit: true }],
      },
    });
    expect(paths(result)).toEqual(["guides/ordering.md", "model/x/Authors.md", "model/x/Books.md"]);
  });

  test.each([
    [{ SELECT: { from: "OkfService.Index" } }],
    [{ SELECT: { from: { SELECT: { from: INDEX } } } }],
    [{ SELECT: { from: { ref: ["OkfService.Index", "links"] } } }],
  ])("a from clause that isn't the entity, alone or with its key, is refused: %j", (query) => {
    expect(() => runIndexQuery(ROWS, query as never)).toThrow(/this from clause isn't supported/);
  });

  test("the refusal is a 400 error", () => {
    try {
      runIndexQuery(ROWS, { SELECT: { from: INDEX, groupBy: [] } });
    } catch (error) {
      expect((error as { status?: number }).status).toBe(400);
    }
    expect.assertions(1);
  });
});

describe("indexRows: review cases", () => {
  test("an empty frontmatter gives a row with null values; a YAML list as frontmatter gives none", () => {
    const rows = indexRows([
      { path: "empty.md", text: "---\n---\nBody.\n" },
      { path: "list.md", text: "---\n- a\n- b\n---\n" },
      { path: "solo.md", text: "---\ntype: Note\ntags: solo\n---\n" },
    ]);
    expect(rows.map((row) => [row.path, row.type, row.tags])).toEqual([
      ["empty.md", null, null],
      ["solo.md", "Note", "solo"],
    ]);
  });
});
