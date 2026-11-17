import { parseConcept, type Concept } from "../../src/core/concept";
import { validateBundle } from "../../src/core/validate";
import { mergeBundle, type CuratedFile } from "../../src/bundle/merge";

// Task 3.1: the curated okf/ folder merged with the generated model/ (ADR-0007, "What the bundle
// contains" and "Index files").

function concept(path: string, type: string, title: string, body = "\n"): Concept {
  return {
    path,
    id: path.replace(/\.md$/, ""),
    frontmatter: { type, title, description: `${title}.` },
    body,
  };
}

// What exportModel returns: concepts under model/, their indexes, and a root index.
const GENERATED: Concept[] = [
  concept("model/x/Books.md", "Entity", "Books"),
  {
    path: "model/index.md",
    id: "model/index",
    frontmatter: null,
    body: "# Subdirectories\n\n* [x](x/index.md) - 1 concept: Entity\n",
  },
  {
    path: "model/x/index.md",
    id: "model/x/index",
    frontmatter: null,
    body: "# Entity\n\n* [Books](Books.md) - Books.\n",
  },
  {
    path: "index.md",
    id: "index",
    frontmatter: { okf_version: "0.2" },
    body: "# Subdirectories\n\n* [model](model/index.md) - 1 concept: Entity\n",
  },
];

function curated(path: string, text: string): CuratedFile {
  return { path, text };
}

function guide(title: string, body = "\n"): string {
  return `---\ntype: Guide\ntitle: ${title}\ndescription: ${title}.\n---\n${body}`;
}

const paths = (files: { path: string }[]) => files.map((file) => file.path);
const textOf = (files: { path: string; text: string }[], path: string) =>
  files.find((file) => file.path === path)?.text;

describe("mergeBundle: files", () => {
  test("keeps generated and curated files, sorted by path, curated ones at their okf/ path", () => {
    const merged = mergeBundle(
      GENERATED,
      [curated("guides/ordering.md", guide("Ordering"))],
      "0.2",
    );
    expect(paths(merged.files)).toEqual([
      "guides/index.md",
      "guides/ordering.md",
      "index.md",
      "model/index.md",
      "model/x/Books.md",
      "model/x/index.md",
    ]);
    expect(textOf(merged.files, "guides/ordering.md")).toBe(guide("Ordering"));
    expect(merged.findings).toEqual([]);
    expect([...merged.curatedPaths]).toEqual(["guides/ordering.md"]);
  });
  test("without a curated index.md, the root index declares okf_version and lists model/ and the curated folders", () => {
    const merged = mergeBundle(
      GENERATED,
      [curated("guides/ordering.md", guide("Ordering")), curated("faq.md", guide("FAQ"))],
      "0.2",
    );
    const root = parseConcept("index.md", textOf(merged.files, "index.md")!);
    expect(root.frontmatter).toEqual({ okf_version: "0.2" });
    expect(root.body).toContain("* [FAQ](faq.md) - FAQ.");
    expect(root.body).toContain("* [guides](guides/index.md)");
    expect(root.body).toContain("* [model](model/index.md)");
  });

  test("a curated folder without an index.md gets a generated one; a curated index.md is kept", () => {
    const own = "# Notes\n\n* [A](a.md) - A.\n";
    const merged = mergeBundle(
      GENERATED,
      [
        curated("guides/ordering.md", guide("Ordering")),
        curated("notes/a.md", guide("A")),
        curated("notes/index.md", own),
      ],
      "0.2",
    );
    expect(textOf(merged.files, "guides/index.md")).toContain(
      "* [Ordering](ordering.md) - Ordering.",
    );
    expect(textOf(merged.files, "notes/index.md")).toBe(own);
  });
});

describe("mergeBundle: the root index", () => {
  test("a curated root index.md replaces the generated one", () => {
    const own = '---\nokf_version: "0.2"\n---\n# Model\n\n* [Model](model/) - Generated.\n';
    const merged = mergeBundle(GENERATED, [curated("index.md", own)], "0.2");
    expect(textOf(merged.files, "index.md")).toBe(own);
    expect(merged.findings).toEqual([]);
  });

  test.each(["model/index.md", "/model/", "./model/index.md"])(
    "a curated root index.md linking to %s is fine",
    (target) => {
      const own = `# Model\n\n* [Model](${target}) - Generated.\n`;
      expect(mergeBundle(GENERATED, [curated("index.md", own)], "0.2").findings).toEqual([]);
    },
  );

  test("a curated root index.md that doesn't link to model/ gets a warning", () => {
    const own = "# Guides\n\n* [Ordering](guides/ordering.md) - Ordering.\n";
    const merged = mergeBundle(
      GENERATED,
      [curated("index.md", own), curated("guides/ordering.md", guide("Ordering"))],
      "0.2",
    );
    expect(merged.findings).toEqual([
      {
        file: "index.md",
        line: 1,
        rule: "L2",
        severity: "warning",
        message: "the bundle's root index doesn't link to model/, the generated concepts",
        fix: "Add an entry such as * [Model](model/index.md) - Generated from the CDS model",
      },
    ]);
  });
});

describe("mergeBundle: layout errors (L1)", () => {
  test.each(["model/notes.md", "model/x/Books.md", "Model/notes.md", "model/index.md"])(
    "a curated file at okf/%s is an error and left out: model/ belongs to the generator",
    (path) => {
      const merged = mergeBundle(GENERATED, [curated(path, guide("Notes"))], "0.2");
      expect(merged.findings).toEqual([
        expect.objectContaining({
          file: path,
          line: 1,
          rule: "L1",
          severity: "error",
          message: "model/ belongs to the generator; a curated file can't be there",
          fix: expect.stringMatching(/^Move it out of okf\/model\//i),
        }),
      ]);
      expect(textOf(merged.files, path) ?? "").not.toContain("Notes");
      expect(merged.curatedPaths.has(path)).toBe(false);
    },
  );

  test("a curated path that differs from another only in letter case is an error and left out", () => {
    const merged = mergeBundle(
      GENERATED,
      [
        curated("Guides/b.md", guide("B")),
        curated("guides/a.md", guide("A")),
        curated("Index.md", guide("I")),
      ],
      "0.2",
    );
    expect(merged.findings).toEqual([
      expect.objectContaining({ file: "Index.md", rule: "L1", severity: "error" }),
      expect.objectContaining({ file: "guides/a.md", rule: "L1", severity: "error" }),
    ]);
    expect(paths(merged.files)).not.toContain("Index.md");
    expect(paths(merged.files)).not.toContain("guides/a.md");
    expect(paths(merged.files)).toContain("Guides/b.md");
  });
});

describe("mergeBundle: other files and the validator", () => {
  test("other curated files and log.md are kept as they are, and never listed", () => {
    const merged = mergeBundle(
      GENERATED,
      [curated("log.md", "# 2026-11-17\n\n* Started.\n"), curated("references/q.py", "print(1)\n")],
      "0.2",
    );
    expect(textOf(merged.files, "references/q.py")).toBe("print(1)\n");
    expect(textOf(merged.files, "log.md")).toBe("# 2026-11-17\n\n* Started.\n");
    expect(paths(merged.files)).not.toContain("references/index.md");
    expect(textOf(merged.files, "index.md")).not.toContain("references");
  });

  test("a curated Markdown file that can't be parsed is kept for the validator to report", () => {
    const merged = mergeBundle(GENERATED, [curated("guides/broken.md", "no frontmatter\n")], "0.2");
    expect(textOf(merged.files, "guides/broken.md")).toBe("no frontmatter\n");
    expect(validateBundle(merged.files).map((finding) => [finding.file, finding.rule])).toEqual([
      ["guides/broken.md", "R1"],
    ]);
  });

  test("a merged bundle of valid parts validates without findings", () => {
    const merged = mergeBundle(
      GENERATED,
      [curated("guides/ordering.md", guide("Ordering", "\nSee [Books](/model/x/Books.md).\n"))],
      "0.2",
    );
    expect(validateBundle(merged.files)).toEqual([]);
  });

  test("the output doesn't depend on the order of the curated files", () => {
    const files = [curated("b.md", guide("B")), curated("guides/a.md", guide("A"))];
    const forward = mergeBundle(GENERATED, files, "0.2").files;
    const backward = mergeBundle(GENERATED, [...files].reverse(), "0.2").files;
    expect(backward).toEqual(forward);
  });
});

// Review of 3.1: names that differ from a reserved file name only in case, and a path that is a
// file in one place and a folder in another, would overwrite each other on macOS and Windows.
describe("mergeBundle: reserved names and file/folder clashes", () => {
  test.each(["guides/INDEX.md", "guides/Index.md", "guides/LOG.md"])(
    "a curated %s is an error and left out: OKF reserves the name in lower case",
    (path) => {
      const merged = mergeBundle(
        GENERATED,
        [curated(path, guide("I")), curated("guides/a.md", guide("A"))],
        "0.2",
      );
      expect(merged.findings).toEqual([
        expect.objectContaining({ file: path, rule: "L1", severity: "error" }),
      ]);
      expect(
        paths(merged.files).filter((each) => each.toLowerCase() === path.toLowerCase()),
      ).toEqual(path.toLowerCase().endsWith("index.md") ? [path.toLowerCase()] : []);
    },
  );

  test("with Index.md and index.md at the root, index.md is the root index and Index.md is left out", () => {
    const own = "# Model\n\n* [Model](model/index.md) - Generated.\n";
    const merged = mergeBundle(
      GENERATED,
      [curated("Index.md", guide("I")), curated("index.md", own)],
      "0.2",
    );
    expect(merged.findings.map((each) => [each.file, each.rule])).toEqual([["Index.md", "L1"]]);
    expect(textOf(merged.files, "index.md")).toBe(own);
    expect(paths(merged.files)).not.toContain("Index.md");
  });

  test("a curated folder named like a file the bundle has is an error and left out", () => {
    const merged = mergeBundle(GENERATED, [curated("index.md/x.md", guide("X"))], "0.2");
    expect(merged.findings.map((each) => [each.file, each.rule])).toEqual([
      ["index.md/x.md", "L1"],
    ]);
    expect(paths(merged.files)).not.toContain("index.md/x.md");
  });

  test("a curated folder named like the generated index of its parent is an error and left out", () => {
    const merged = mergeBundle(
      GENERATED,
      [curated("guides/a.md", guide("A")), curated("guides/index.md/x.md", guide("X"))],
      "0.2",
    );
    expect(merged.findings.map((each) => [each.file, each.rule])).toEqual([
      ["guides/index.md/x.md", "L1"],
    ]);
  });
});

describe("mergeBundle: other clashes, empty folders and order", () => {
  test("paths that differ only in Unicode form clash", () => {
    const composed = "café.md";
    const decomposed = "café.md";
    const merged = mergeBundle(
      GENERATED,
      [curated(decomposed, guide("D")), curated(composed, guide("C"))],
      "0.2",
    );
    expect(merged.findings).toHaveLength(1);
    expect(merged.findings[0]).toMatchObject({ rule: "L1" });
  });

  test("the L1 fix names the model folder as the file spells it", () => {
    const merged = mergeBundle(GENERATED, [curated("MODEL/x.md", guide("X"))], "0.2");
    expect(merged.findings[0]?.fix).toMatch(/^Move it out of okf\/MODEL\//);
  });

  test("a folder with only log.md gets no index, and none links to it", () => {
    const merged = mergeBundle(
      GENERATED,
      [curated("notes/log.md", "# 2026-11-17\n\n* x\n")],
      "0.2",
    );
    expect(paths(merged.files)).not.toContain("notes/index.md");
    expect(textOf(merged.files, "index.md")).not.toContain("notes");
  });

  test("findings don't depend on the order of the curated files either", () => {
    const files = [
      curated("model/a.md", guide("A")),
      curated("Guides/b.md", guide("B")),
      curated("guides/c.md", guide("C")),
    ];
    const forward = mergeBundle(GENERATED, files, "0.2").findings;
    expect(mergeBundle(GENERATED, [...files].reverse(), "0.2").findings).toEqual(forward);
  });
});

describe("mergeBundle: links to model/ in a curated root index", () => {
  test.each([
    ["a reference definition", "* [Model][m]\n\n[m]: model/\n", false],
    ["a link with a fragment", "* [Model](model/index.md#top) - Generated.\n", false],
    ["a link only inside a code block", "```\n[Model](model/index.md)\n```\n", true],
  ])("%s", (_label, body, warns) => {
    const merged = mergeBundle(GENERATED, [curated("index.md", `# Model\n\n${body}`)], "0.2");
    expect(merged.findings.some((each) => each.rule === "L2")).toBe(warns);
  });
});

describe("mergeBundle: authorization markers in curated files (L3, L4; task 4.11)", () => {
  const START = "<!-- okf:auth:start -->";
  const END = "<!-- okf:auth:end -->";

  test("a file with a broken marker is an error (L3) and left out", () => {
    const text = `---\ntype: Guide\ntitle: Broken\n---\n# Broken\n${END}\nMore.\n`;
    const merged = mergeBundle(GENERATED, [curated("guides/broken.md", text)], "0.2");
    expect(merged.findings).toEqual([
      expect.objectContaining({ file: "guides/broken.md", line: 6, rule: "L3", severity: "error" }),
    ]);
    expect(paths(merged.files)).not.toContain("guides/broken.md");
    expect(merged.curatedPaths.has("guides/broken.md")).toBe(false);
  });

  test("a marker written slightly wrong is a warning (L4) and the file stays", () => {
    const text = `---\ntype: Guide\ntitle: Loose\n---\n# Loose\n<!--okf:auth:start-->\nS.\n${END}\n`;
    const merged = mergeBundle(GENERATED, [curated("guides/loose.md", text)], "0.2");
    expect(merged.findings).toEqual([
      expect.objectContaining({
        file: "guides/loose.md",
        line: 6,
        rule: "L4",
        severity: "warning",
      }),
    ]);
    expect(paths(merged.files)).toContain("guides/loose.md");
  });

  test("well-formed sections and files that aren't Markdown give no finding", () => {
    const good = `---\ntype: Guide\ntitle: Good\n---\n# Good\n${START}\nS.\n${END}\n`;
    const merged = mergeBundle(
      GENERATED,
      [curated("guides/good.md", good), curated("notes.txt", `${END}\n`)],
      "0.2",
    );
    expect(merged.findings).toEqual([]);
  });
});
