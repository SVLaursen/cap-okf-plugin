import { lintBundle, lintKnowledge } from "../../src/core/lint";

// ADR-0012: the knowledge lint, warnings only.

const entity = (rows: string) =>
  "---\ntype: Projection\ntitle: Orders\ndescription: Orders.\n---\n# Orders\n\n## Elements\n\n" +
  "| Element | Type | Notes |\n| --- | --- | --- |\n" +
  rows;

const ROWS =
  "| `ID` | `UUID` | key |\n" +
  "| `status` | [Status](/model/S/Status.md) |  |\n" +
  "| `country` | `String(2)` |  |\n" +
  "| `title` | `String(150)` |  |\n" +
  "| `priority` | `Integer` | values: `low` = `1`, `high` = `2` |\n" +
  "| `orderKind` | `Integer` |  |\n";

const note = (frontmatter: string, body: string) =>
  `---\ntype: Guide\ntitle: N\n${frontmatter}---\n\n${body}`;

const rules = (findings: { rule: string; file: string; line: number }[]) =>
  findings.map((finding) => `${finding.rule} ${finding.file}:${finding.line}`);

describe("lintKnowledge", () => {
  test("an entity with code-like elements and no curated note linking to it: one K3", () => {
    const findings = lintKnowledge([{ path: "model/S/Orders.md", text: entity(ROWS) }]);
    expect(rules(findings)).toEqual(["K3 model/S/Orders.md:13"]);
    expect(findings[0]!.message).toBe(
      "status, country, priority, orderKind look like code fields, and no curated note links to this entity to say what the values mean",
    );
    expect(findings[0]!.severity).toBe("warning");
  });

  test("no K3 once a curated note links to the entity; a View or Entity counts too", () => {
    const files = [
      { path: "model/S/Orders.md", text: entity(ROWS) },
      {
        path: "guides/codes.md",
        text: note("description: D.\ntags: [x]\n", "[orders](/model/S/Orders.md)\n"),
      },
    ];
    expect(lintKnowledge(files)).toEqual([]);
    const plainEntity = entity("| `title` | `String(150)` |  |\n").replace("Projection", "Entity");
    expect(lintKnowledge([{ path: "model/S/Books.md", text: plainEntity }])).toEqual([]);
  });

  test("a curated note without tags (K1) or without a link into model/ (K2)", () => {
    const findings = lintKnowledge([
      { path: "guides/a.md", text: note("description: D.\n", "No links.\n") },
      { path: "guides/b.md", text: note("tags: [x]\n", "[web](https://x.org)\n") },
      { path: "index.md", text: "# Guides\n" },
    ]);
    expect(rules(findings)).toEqual(["K1 guides/a.md:1", "K2 guides/a.md:6", "K2 guides/b.md:6"]);
  });
});

describe("lintBundle", () => {
  test("adds the validator's W1 for curated notes and W4 for broken links", () => {
    const findings = lintBundle([
      { path: "guides/a.md", text: note("tags: [x]\n", "[Gone](/model/S/Gone.md)\n") },
      { path: "model/S/Orders.md", text: "---\ntype: Entity\ntitle: Orders\n---\n# Orders\n" },
    ]);
    expect(rules(findings)).toEqual(["W1 guides/a.md:1", "W4 guides/a.md:7"]);
  });
});
