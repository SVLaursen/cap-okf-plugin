import { authMarkerFindings } from "../../src/core/auth-markers";
import { AUTH_END, AUTH_START, withoutAuthSections } from "../../src/core/filter";

// Task 4.11: broken authorization markers in a curated file (ADR-0003). The filter fails closed,
// but some mistakes still cost the anonymous reader their file (L3, error) or would show them a
// section (a marker hidden in a list item, L3). Markers written slightly wrong, which the filter
// still understands, are warnings (L4).

const FRONTMATTER = "---\ntype: Guide\ntitle: Ordering\n---\n";
const PATH = "guides/ordering.md";

/** [line, rule] of every finding, in order. */
function found(text: string): [number, string][] {
  return authMarkerFindings(PATH, text).map((finding) => [finding.line, finding.rule]);
}

describe("authMarkerFindings: well-formed files", () => {
  test.each([
    ["no markers", `${FRONTMATTER}# Ordering\n`],
    ["one section", `${FRONTMATTER}# Ordering\n\n${AUTH_START}\nSecret.\n${AUTH_END}\n`],
    [
      "two sections",
      `${FRONTMATTER}A\n${AUTH_START}\nB\n${AUTH_END}\nC\n${AUTH_START}\nD\n${AUTH_END}\n`,
    ],
    ["a mention in a sentence", `${FRONTMATTER}Wrap rules in \`${AUTH_START}\` lines.\n`],
    ["CRLF line endings", `---\r\ntype: Guide\r\n---\r\n${AUTH_START}\r\nB\r\n${AUTH_END}\r\n`],
    ["no frontmatter", `${AUTH_START}\nB\n${AUTH_END}\n`],
  ])("%s: nothing to report", (_, text) => {
    expect(found(text)).toEqual([]);
  });
});

describe("authMarkerFindings: errors (L3)", () => {
  test("an end marker without a start, which would drop the frontmatter", () => {
    const text = `${FRONTMATTER}# Ordering\n${AUTH_END}\nMore.\n`;
    expect(withoutAuthSections(text)).toBe("More.\n"); // what an anonymous reader would get
    expect(found(text)).toEqual([[6, "L3"]]);
  });

  test("a start marker without an end", () => {
    expect(found(`${FRONTMATTER}# Ordering\n${AUTH_START}\nSecret.\n`)).toEqual([[6, "L3"]]);
  });

  test("a marker in the frontmatter", () => {
    const text = `---\ntype: Guide\n${AUTH_START}\nrole: admin\n${AUTH_END}\n---\n# X\n`;
    expect(found(text)).toEqual([
      [3, "L3"],
      [5, "L3"],
    ]);
  });

  test.each([
    ["a list item", `- ${AUTH_START}`, `- ${AUTH_END}`],
    ["a numbered item", `1. ${AUTH_START}`, `2. ${AUTH_END}`],
    ["a heading", `## ${AUTH_START}`, `## ${AUTH_END}`],
  ])("markers hidden in %s, which the filter doesn't see", (_, start, end) => {
    const text = `${FRONTMATTER}# X\n${start}\nSecret.\n${end}\n`;
    expect(withoutAuthSections(text)).toContain("Secret."); // the leak this prevents
    expect(found(text)).toEqual([
      [6, "L3"],
      [8, "L3"],
    ]);
  });

  test("findings name the file and say how to fix it", () => {
    const [finding] = authMarkerFindings(PATH, `${FRONTMATTER}${AUTH_END}\n`);
    expect(finding).toMatchObject({
      file: PATH,
      line: 5,
      rule: "L3",
      severity: "error",
      message: expect.stringContaining("end marker without a start marker"),
      fix: expect.stringContaining(AUTH_START),
    });
  });
});

describe("authMarkerFindings: warnings (L4)", () => {
  test.each([
    ["other case", "<!-- OKF:Auth:Start -->", "<!-- okf:auth:end -->"],
    ["no spaces", "<!--okf:auth:start-->", "<!--okf:auth:end-->"],
    ["in a quote", `> ${AUTH_START}`, `> ${AUTH_END}`],
  ])("a marker the filter understands but written slightly wrong: %s", (_, start, end) => {
    const text = `${FRONTMATTER}# X\n${start}\nSecret.\n${end}\n`;
    expect(withoutAuthSections(text)).not.toContain("Secret.");
    expect(found(text).map(([, rule]) => rule)).not.toContain("L3");
    expect(found(text).length).toBeGreaterThan(0);
  });

  test("markers inside a code block, which the filter still cuts", () => {
    const text = `${FRONTMATTER}# X\n\`\`\`md\n${AUTH_START}\nExample.\n${AUTH_END}\n\`\`\`\nAfter.\n`;
    expect(found(text)).toEqual([
      [7, "L4"],
      [9, "L4"],
    ]);
  });
});
