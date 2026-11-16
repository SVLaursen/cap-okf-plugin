import fs from "node:fs";
import path from "node:path";
import { parseConcept, serializeConcept, type Concept } from "../../src/core/concept";
import { generateIndex, generateIndexes } from "../../src/core/index-md";
import { validateBundle, type BundleFile } from "../../src/core/validate";

// index.md files list a folder's concepts for progressive disclosure (OKF v0.2 §8). The layout
// follows the official samples: one section per type, then the subfolders.

const SAMPLES_DIR = path.join(__dirname, "..", "fixtures", "okf-spec", "bundles");

function concept(conceptPath: string, frontmatter: Concept["frontmatter"]): Concept {
  return { path: conceptPath, id: conceptPath.replace(/\.md$/, ""), frontmatter, body: "" };
}

const BOOKSHOP = [
  concept("model/Books.md", {
    type: "Entity",
    title: "Books",
    description: "Books in the catalog.",
  }),
  concept("model/Authors.md", {
    type: "Entity",
    title: "Authors",
    description: "People who write books.",
  }),
  concept("model/CatalogService.md", {
    type: "Service",
    title: "CatalogService",
    description: "Read-only shop API.",
  }),
  concept("model/admin/Orders.md", { type: "Entity", title: "Orders" }),
  concept("model/admin/AdminService.md", { type: "Service", title: "AdminService" }),
  concept("model/admin/audit/Log.md", { type: "Entity", title: "Audit log" }),
  concept("guides/ordering.md", { type: "Playbook", title: "Placing an order" }),
];

describe("generateIndex layout", () => {
  test("lists a folder's concepts by type, then its subfolders", () => {
    expect(generateIndex("model", BOOKSHOP)).toEqual({
      path: "model/index.md",
      id: "model/index",
      frontmatter: null,
      body: [
        "# Entity",
        "",
        "* [Authors](Authors.md) - People who write books.",
        "* [Books](Books.md) - Books in the catalog.",
        "",
        "# Service",
        "",
        "* [CatalogService](CatalogService.md) - Read-only shop API.",
        "",
        "# Subdirectories",
        "",
        "* [admin](admin/index.md) - 3 concepts: Entity, Service",
        "",
      ].join("\n"),
    });
  });

  test("the bundle root lists only top-level folders, counting everything below them", () => {
    expect(generateIndex("", BOOKSHOP).body).toBe(
      [
        "# Subdirectories",
        "",
        "* [guides](guides/index.md) - 1 concept: Playbook",
        "* [model](model/index.md) - 6 concepts: Entity, Service",
        "",
      ].join("\n"),
    );
  });
});

describe("generateIndex sections", () => {
  test("a folder without subfolders has no Subdirectories section", () => {
    expect(generateIndex("model/admin/audit", BOOKSHOP).body).toBe(
      "# Entity\n\n* [Audit log](Log.md)\n",
    );
  });

  test("the result is the same whatever order the concepts come in", () => {
    const reversed = [...BOOKSHOP].reverse();
    expect(generateIndex("model", reversed)).toEqual(generateIndex("model", BOOKSHOP));
  });

  test("the bundle-root index can declare the OKF version (§12)", () => {
    const index = generateIndex("", BOOKSHOP, { okfVersion: "0.2" });
    expect(index).toMatchObject({
      path: "index.md",
      id: "index",
      frontmatter: { okf_version: "0.2" },
    });
  });
});

describe("generateIndex entries", () => {
  test("without a title, the file name is the link text (§4.1)", () => {
    const body = generateIndex("", [concept("Orders.md", { type: "Entity" })]).body;
    expect(body).toContain("* [Orders](Orders.md)\n");
  });

  test("a description is written on one line", () => {
    const multiLine = concept("a.md", {
      type: "X",
      title: "A",
      description: "First line\n  second\tline. ",
    });
    expect(generateIndex("", [multiLine]).body).toContain(
      "* [A](a.md) - First line second line.\n",
    );
  });

  test("brackets and backslashes in a title are escaped, so the link stays a link", () => {
    const beta = concept("orders.md", { type: "X", title: "Orders [beta] \\ v2" });
    expect(generateIndex("", [beta]).body).toContain("* [Orders \\[beta\\] \\\\ v2](orders.md)\n");
  });

  test("link paths are percent-encoded per segment (ADR-0007)", () => {
    const encoded = concept("model/a%3Ab/my notes.md", { type: "X", title: "Notes" });
    expect(generateIndex("model", [encoded]).body).toContain(
      "* [a%3Ab](a%253Ab/index.md) - 1 concept: X\n",
    );
    expect(generateIndex("model/a%3Ab", [encoded]).body).toContain("* [Notes](my%20notes.md)\n");
  });
});

describe("generateIndex special cases", () => {
  test("concepts without a type are listed under Other, after the typed sections", () => {
    const concepts = [
      concept("a.md", { title: "A" }),
      concept("b.md", { type: "Zebra", title: "B" }),
    ];
    expect(generateIndex("", concepts).body).toBe(
      "# Zebra\n\n* [B](b.md)\n\n# Other\n\n* [A](a.md)\n",
    );
  });

  // R1 reports such a file; the index still lists it, so nothing silently disappears.
  test("a concept without frontmatter is listed under Other, by its file name", () => {
    expect(generateIndex("", [concept("notes.md", null)]).body).toBe(
      "# Other\n\n* [notes](notes.md)\n",
    );
  });

  test("reserved files are not listed: an old index.md, a log.md", () => {
    const concepts = [
      concept("index.md", null),
      concept("log.md", null),
      concept("a.md", { type: "X" }),
    ];
    expect(generateIndex("", concepts).body).toBe("# X\n\n* [a](a.md)\n");
  });

  test("an empty folder gets an index with an empty body", () => {
    expect(generateIndex("nothing", BOOKSHOP).body).toBe("");
  });
});

describe("generateIndex with awkward input", () => {
  test.each([
    ["a title on several lines", { type: "X", title: "A\n# boom" }, "* [A # boom](a.md)\n"],
    ["a padded title", { type: "X", title: "  spaced\ttitle  " }, "* [spaced title](a.md)\n"],
    [
      "HTML in a description",
      { type: "X", title: "A", description: "Hides <!-- the rest" },
      "* [A](a.md) - Hides &lt;!-- the rest\n",
    ],
  ])("handles %s", (_label, frontmatter, line) => {
    expect(generateIndex("", [concept("a.md", frontmatter)]).body).toContain(line);
  });

  test("a type on several lines or with padding is one heading", () => {
    const concepts = [
      concept("a.md", { type: "Entity\n* x", title: "A" }),
      concept("b.md", { type: "  Entity * x  ", title: "B" }),
    ];
    expect(generateIndex("", concepts).body).toBe("# Entity * x\n\n* [A](a.md)\n* [B](b.md)\n");
  });

  test("parentheses in a path are percent-encoded, so the link ends where it should", () => {
    const body = generateIndex("", [concept("a).md", { type: "X", title: "A" })]).body;
    expect(body).toContain("* [A](a%29.md)\n");
  });
});

describe("generateIndex with awkward input, continued", () => {
  test("a folder given with slashes around it is the same folder", () => {
    expect(generateIndex("/model/", BOOKSHOP)).toEqual(generateIndex("model", BOOKSHOP));
  });

  test("files that are not Markdown are not listed or counted", () => {
    const concepts = [concept("refs/q.py", null), concept("refs/a.md", { type: "X" })];
    expect(generateIndex("", concepts).body).toContain("* [refs](refs/index.md) - 1 concept: X\n");
    expect(generateIndex("refs", concepts).body).toBe("# X\n\n* [a](a.md)\n");
  });

  // Duplicate paths are invalid, but a merge could produce them; the order must still be fixed.
  test("concepts with the same path are ordered by title, whatever order they come in", () => {
    const concepts = [
      concept("a.md", { type: "X", title: "two" }),
      concept("a.md", { type: "X", title: "one" }),
    ];
    const expected = "# X\n\n* [one](a.md)\n* [two](a.md)\n";
    expect(generateIndex("", concepts).body).toBe(expected);
    expect(generateIndex("", [...concepts].reverse()).body).toBe(expected);
  });

  // A real type named like a heading of our own shares that heading, on purpose: this pins it.
  test("a type named Other shares the section of the concepts without a type", () => {
    const concepts = [
      concept("a.md", { type: "Other", title: "A" }),
      concept("b.md", { title: "B" }),
    ];
    expect(generateIndex("", concepts).body).toBe("# Other\n\n* [A](a.md)\n* [B](b.md)\n");
  });

  // Everything above must still give index files that our own validator accepts (R3 and W4).
  test("index files of awkward titles, types and paths pass validateBundle", () => {
    const description = "A concept with an awkward name.";
    const awkward = [
      concept("a ] b.md", { type: "Entity\n* x", title: "a ] b", description }),
      concept("a [ b.md", { type: "X", title: "a [ b", description: "<!-- c" }),
      concept("nest.md", { type: "X", title: "a [b [c]] d \\ e", description }),
      concept("p(1).md", { type: "X", title: "Paren", description: "See [nest](nest.md)." }),
      concept("c)(.md", { type: "X", title: "c)(", description }),
      concept("sub/ä #?%.md", { type: "X", title: "A\n# boom", description }),
    ];
    const files = [...awkward, ...generateIndexes(awkward, "")].map((file) => ({
      path: file.path,
      text: serializeConcept(file),
    }));
    expect(validateBundle(files)).toEqual([]);
  });
});

describe("generateIndexes", () => {
  test("writes an index for a folder and every folder below it, sorted by path", () => {
    expect(generateIndexes(BOOKSHOP, "model").map((index) => index.path)).toEqual([
      "model/admin/audit/index.md",
      "model/admin/index.md",
      "model/index.md",
    ]);
  });

  test("from the bundle root, writes the root index and every folder's", () => {
    expect(generateIndexes(BOOKSHOP, "").map((index) => index.path)).toEqual([
      "guides/index.md",
      "index.md",
      "model/admin/audit/index.md",
      "model/admin/index.md",
      "model/index.md",
    ]);
  });

  test("passes the OKF version only to the bundle-root index", () => {
    const indexes = generateIndexes(BOOKSHOP, "", { okfVersion: "0.2" });
    expect(
      indexes.filter((index) => index.frontmatter !== null).map((index) => index.path),
    ).toEqual(["index.md"]);
  });
});

describe("generated index files in the official samples", () => {
  function readSample(bundle: string): BundleFile[] {
    const folder = path.join(SAMPLES_DIR, bundle);
    return fs
      .readdirSync(folder, { recursive: true, encoding: "utf8" })
      .filter((file) => fs.statSync(path.join(folder, file)).isFile())
      .map((file) => ({ path: file, text: fs.readFileSync(path.join(folder, file), "utf8") }));
  }

  // Replacing every hand-written index.md with a generated one must keep the bundle clean:
  // valid R3 structure, and every link pointing at a file that exists.
  test.each(["acme_retail", "crypto_bitcoin", "ga4", "stackoverflow"])(
    "%s stays free of findings with generated index files",
    (bundle) => {
      const files = readSample(bundle).filter((file) => !file.path.endsWith("index.md"));
      const concepts = files
        .filter((file) => file.path.endsWith(".md"))
        .map((file) => parseConcept(file.path, file.text));
      const indexes = generateIndexes(concepts, "", { okfVersion: "0.2" }).map((index) => ({
        path: index.path,
        text: serializeConcept(index),
      }));
      expect(validateBundle([...files, ...indexes])).toEqual([]);
    },
  );
});
