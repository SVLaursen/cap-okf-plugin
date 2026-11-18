import { withBusinessKnowledge } from "../../src/bundle/business-knowledge";
import { parseConcept } from "../../src/core/concept";
import { withoutLinksTo } from "../../src/core/hidden-links";
import { requiresOf, withoutRequiresKey } from "../../src/core/requires";
import { readerView, snapshotOf } from "../../src/serve/reader-view";
import { TOGETHER_END, TOGETHER_START, withReadTogether } from "../../src/serve/related";

// ADR-0012 and ADR-0013: the "Business knowledge" section of generated concepts, the "Read
// together with" line in a concept that is read, and the pure helpers per-role visibility uses.

const note = (path: string, title: string, body: string, extra = "") =>
  parseConcept(
    path,
    `---\ntype: Guide\ntitle: ${title}\ndescription: About ${title}.\n${extra}---\n\n${body}`,
  );

describe("withBusinessKnowledge", () => {
  const entity = parseConcept(
    "model/S/Orders.md",
    "---\ntype: Entity\n---\n# Orders\n\n## Elements\n\nx\n\n<!-- okf:auth:start -->\n## Authorization\n\nRules.\n<!-- okf:auth:end -->\n",
  );
  const plain = parseConcept("model/S/Items.md", "---\ntype: Entity\n---\n# Items\n");

  test("lists the curated notes linking to a concept, before its authorization section", () => {
    const [orders] = withBusinessKnowledge(
      [entity],
      [
        note("guides/b.md", "B note", "See [orders](/model/S/Orders.md)."),
        note(
          "guides/a.md",
          "A note",
          "See [orders](../model/S/Orders.md) and [again](/model/S/Orders.md).",
        ),
      ],
    );
    expect(orders!.body).toBe(
      "# Orders\n\n## Elements\n\nx\n\n## Business knowledge\n\n" +
        "- [A note](/guides/a.md) - About A note.\n- [B note](/guides/b.md) - About B note.\n\n" +
        "<!-- okf:auth:start -->\n## Authorization\n\nRules.\n<!-- okf:auth:end -->\n",
    );
  });

  test("at the end without an authorization section; untouched without backlinks", () => {
    const [items, orders] = withBusinessKnowledge(
      [plain, entity],
      [note("guides/a.md", "A", "[items](/model/S/Items.md)")],
    );
    expect(items!.body).toBe(
      "# Items\n\n## Business knowledge\n\n- [A](/guides/a.md) - About A.\n",
    );
    expect(orders).toBe(entity);
  });

  test("a link inside a note's authorization section doesn't count", () => {
    const secret = note(
      "guides/s.md",
      "S",
      "<!-- okf:auth:start -->\n[orders](/model/S/Orders.md)\n<!-- okf:auth:end -->\n",
    );
    expect(withBusinessKnowledge([entity], [secret])[0]).toBe(entity);
  });
});

describe("withReadTogether", () => {
  const files = [
    {
      path: "guides/a.md",
      text: "---\ntype: Guide\ntitle: A\n---\n# A\n\n[B](b.md), [model](/model/S/Orders.md), [C](/guides/c.md), [B again](/guides/b.md), [web](https://x.org), [index](/index.md)\n",
    },
    {
      path: "guides/b.md",
      text: "---\ntype: Guide\ntitle: B\ndescription: The b note.\n---\nB.\n",
    },
    { path: "guides/c.md", text: "---\ntype: Guide\n---\nC.\n" },
    { path: "model/S/Orders.md", text: "---\ntype: Entity\n---\nOrders.\n" },
    { path: "index.md", text: "# Guides\n" },
  ];
  const view = readerView(snapshotOf(files), { isAuthenticated: true, is: () => true });

  test("names the curated notes it links to under the title, each once, in a marked line", () => {
    expect(withReadTogether(view, "guides/a.md", view.read("guides/a.md")!)).toBe(
      "---\ntype: Guide\ntitle: A\n---\n# A\n" +
        `${TOGETHER_START}\nRead together with: B (guides/b.md), c.md (guides/c.md)\n${TOGETHER_END}\n` +
        "\n[B](b.md), [model](/model/S/Orders.md), [C](/guides/c.md), [B again](/guides/b.md), [web](https://x.org), [index](/index.md)\n",
    );
  });

  test("without a title, at the start of the body; a heading in code doesn't count", () => {
    const untitled = [
      { path: "n.md", text: "---\ntype: Note\n---\n```\n# not a title\n```\n[b](b.md)\n" },
      { path: "b.md", text: "---\ntype: Note\ntitle: B\n---\nB.\n" },
    ];
    const small = readerView(snapshotOf(untitled), { isAuthenticated: true, is: () => true });
    expect(withReadTogether(small, "n.md", small.read("n.md")!)).toBe(
      `---\ntype: Note\n---\n${TOGETHER_START}\nRead together with: B (b.md)\n${TOGETHER_END}\n` +
        "```\n# not a title\n```\n[b](b.md)\n",
    );
  });

  test("nothing for a concept that links to no curated note, or a file that isn't a concept", () => {
    expect(withReadTogether(view, "guides/b.md", "B")).toBe("B");
    expect(withReadTogether(view, "index.md", "# Guides\n")).toBe("# Guides\n");
    const onlyModel = readerView(
      snapshotOf([
        { path: "n.md", text: "---\ntype: Note\n---\n[o](/model/S/Orders.md)\n" },
        files[3]!,
      ]),
      { isAuthenticated: true, is: () => true },
    );
    expect(withReadTogether(onlyModel, "n.md", "x")).toBe("x");
  });
});

describe("withReadTogether: where the line goes (review)", () => {
  const linked = { path: "b.md", text: "---\ntype: Note\ntitle: B\n---\nB.\n" };
  const placed = (text: string) => {
    const small = readerView(snapshotOf([{ path: "n.md", text }, linked]), {
      isAuthenticated: true,
      is: () => true,
    });
    return withReadTogether(small, "n.md", small.read("n.md")!);
  };
  const LINE = `${TOGETHER_START}\nRead together with: B (b.md)\n${TOGETHER_END}\n`;

  test("never inside an authorization section at the top: before it", () => {
    const body =
      "<!-- okf:auth:start -->\n# Authorization\n\nRules.\n<!-- okf:auth:end -->\n# A\n[b](b.md)\n";
    expect(placed(`---\ntype: Note\n---\n${body}`)).toBe(`---\ntype: Note\n---\n${LINE}${body}`);
  });

  test("never under a later section: without a title first, at the start of the body", () => {
    const body = "Intro [b](b.md).\n\n# Later section\n\ntext\n";
    expect(placed(`---\ntype: Note\n---\n${body}`)).toBe(`---\ntype: Note\n---\n${LINE}${body}`);
  });

  test("after blank lines, still under the title", () => {
    expect(placed("---\ntype: Note\n---\n\n# A\n[b](b.md)\n")).toBe(
      `---\ntype: Note\n---\n\n# A\n${LINE}[b](b.md)\n`,
    );
  });

  test("a CRLF file gets CRLF on the added lines", () => {
    const text = placed("---\r\ntype: Note\r\n---\r\n# A\r\n[b](b.md)\r\n");
    expect(text).toBe(
      "---\r\ntype: Note\r\n---\r\n# A\r\n" +
        `${TOGETHER_START}\r\nRead together with: B (b.md)\r\n${TOGETHER_END}\r\n[b](b.md)\r\n`,
    );
  });
});

describe("withReadTogether: at most ten", () => {
  test("at most ten", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      path: `n${String(i).padStart(2, "0")}.md`,
      text: "---\ntype: Note\n---\nx\n",
    }));
    const hub = {
      path: "hub.md",
      text: `---\ntype: Note\n---\n${many.map((each) => `[x](${each.path})`).join(" ")}\n`,
    };
    const big = readerView(snapshotOf([hub, ...many]), { isAuthenticated: true, is: () => true });
    const line = withReadTogether(big, "hub.md", big.read("hub.md")!).split("\n")[4]!;
    expect(line.match(/\(n\d\d\.md\)/g)).toHaveLength(10);
  });
});

describe("withoutLinksTo", () => {
  const hidden = (path: string) => path === "secret.md";

  test("in code blocks too, autolinks, and a removed item's continuation lines (review)", () => {
    const text =
      "Intro <secret.md> and <https://x.org>.\n\n- [S](secret.md) - first line\n  goes on here\n  - nested\n- [Kept](kept.md)\n\n```\nsee [s](secret.md)\n```\n";
    expect(withoutLinksTo("a.md", text, hidden)).toBe(
      "Intro  and <https://x.org>.\n\n- [Kept](kept.md)\n\n```\nsee s\n```\n",
    );
  });

  test("drops reference definitions", () => {
    const text = "[s][ref]\n\n[ref]: secret.md\n";
    expect(withoutLinksTo("a.md", text, hidden)).toBe("[s][ref]\n");
  });

  test("an emptied last section goes, and the file keeps one final line ending", () => {
    const text = "# A\n\nText.\n\n## See also\n\n- [S](secret.md)\n";
    expect(withoutLinksTo("a.md", text, hidden)).toBe("# A\n\nText.\n");
  });
});

describe("requires helpers", () => {
  test.each([
    [{ requires: "a" }, ["a"]],
    [{ requires: [" a ", "b"] }, ["a", "b"]],
    [{ requires: [] }, []],
    [{ requires: ["a", 1] }, []],
    [{ requires: null }, []],
    [{ title: "x" }, undefined],
  ])("requiresOf(%j) → %j", (frontmatter, roles) => {
    expect(requiresOf(frontmatter)).toEqual(roles);
  });

  test("withoutRequiresKey removes the key and a block list, nothing else", () => {
    expect(
      withoutRequiresKey("---\ntype: G\nrequires:\n  - a\n- b\ntitle: T\n---\nrequires: body\n"),
    ).toBe("---\ntype: G\ntitle: T\n---\nrequires: body\n");
    expect(withoutRequiresKey("no frontmatter\n")).toBe("no frontmatter\n");
    expect(withoutRequiresKey("---\ntype: G\n---\n")).toBe("---\ntype: G\n---\n");
  });
});
