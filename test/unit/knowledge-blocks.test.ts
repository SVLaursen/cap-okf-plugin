import { withBusinessKnowledge } from "../../src/bundle/business-knowledge";
import { parseConcept } from "../../src/core/concept";
import { withoutLinksTo } from "../../src/core/hidden-links";
import { requiresOf, withoutRequiresKey } from "../../src/core/requires";
import { readerView, snapshotOf } from "../../src/serve/reader-view";
import { RELATED_END, RELATED_START, withRelated } from "../../src/serve/related";

// ADR-0012: the "Business knowledge" section of generated concepts, the related-concepts block
// after a concept that is read, and the pure helpers per-role visibility uses.

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

describe("withRelated", () => {
  const files = [
    {
      path: "guides/a.md",
      text: "---\ntype: Guide\ntitle: A\n---\n[B](b.md), [model](/model/S/Orders.md), [B again](/guides/b.md), [web](https://x.org), [index](/index.md)\n",
    },
    {
      path: "guides/b.md",
      text: "---\ntype: Guide\ntitle: B\ndescription: The b note.\n---\nB.\n",
    },
    { path: "model/S/Orders.md", text: "---\ntype: Entity\n---\nOrders.\n" },
    { path: "index.md", text: "# Guides\n" },
  ];
  const view = readerView(snapshotOf(files), { isAuthenticated: true, is: () => true });

  test("appends the linked concepts, curated first, each once, in a marked block", () => {
    expect(withRelated(view, "guides/a.md", view.read("guides/a.md")!)).toBe(
      `${files[0]!.text}\n${RELATED_START}\n## Related concepts\n\n` +
        "- [B](/guides/b.md) - The b note.\n- [Orders.md](/model/S/Orders.md)\n" +
        `${RELATED_END}\n`,
    );
  });

  test("nothing for a concept without links, or a file that isn't a concept", () => {
    expect(withRelated(view, "guides/b.md", "B")).toBe("B");
    expect(withRelated(view, "index.md", "# Guides\n")).toBe("# Guides\n");
  });

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
    const block = withRelated(big, "hub.md", big.read("hub.md")!);
    expect(block.match(/^- \[/gm)).toHaveLength(10);
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
