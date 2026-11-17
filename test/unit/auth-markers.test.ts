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
    ["a * item", `* ${AUTH_START}`, `* ${AUTH_END}`],
    ["a + item", `+ ${AUTH_START}`, `+ ${AUTH_END}`],
    ["a numbered item", `1. ${AUTH_START}`, `2. ${AUTH_END}`],
    ["a 1) item", `1) ${AUTH_START}`, `2) ${AUTH_END}`],
    ["a tab after the bullet", `-\t${AUTH_START}`, `-\t${AUTH_END}`],
    ["a nested item", `  - ${AUTH_START}`, `  - ${AUTH_END}`],
    ["a heading", `## ${AUTH_START}`, `## ${AUTH_END}`],
    ["a heading with closing hashes", `## ${AUTH_START} ##`, `## ${AUTH_END} ##`],
    ["a task item", `- [ ] ${AUTH_START}`, `- [x] ${AUTH_END}`],
    ["a quote and a list", `> - ${AUTH_START}`, `> - ${AUTH_END}`],
    ["a list and a quote", `- > ${AUTH_START}`, `- > ${AUTH_END}`],
    ["a quoted heading", `> ## ${AUTH_START}`, `> ## ${AUTH_END}`],
    ["a zero-width space after the bullet", `- \u200B${AUTH_START}`, `- \u200B${AUTH_END}`],
    ["a zero-width space before the bullet", `\u200B- ${AUTH_START}`, `\u200B- ${AUTH_END}`],
    ["trailing text", `${AUTH_START} x`, `${AUTH_END} x`],
    ["bold", `**${AUTH_START}**`, `**${AUTH_END}**`],
    ["a table cell", `| ${AUTH_START} |`, `| ${AUTH_END} |`],
  ])("markers hidden in %s, which the filter doesn't see", (_, start, end) => {
    const text = `${FRONTMATTER}# X\n${start}\nSecret.\n${end}\n`;
    expect(withoutAuthSections(text)).toContain("Secret."); // the leak this prevents
    expect(found(text)).toEqual([
      [6, "L3"],
      [8, "L3"],
    ]);
  });
});

describe("authMarkerFindings: messages", () => {
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
    ["other case", "<!-- OKF:Auth:Start -->", "<!-- OKF:AUTH:END -->"],
    ["no spaces", "<!--okf:auth:start-->", "<!--okf:auth:end-->"],
    ["in a quote", `> ${AUTH_START}`, `> ${AUTH_END}`],
    ["a zero-width space around it", `\u200B${AUTH_START}`, `${AUTH_END}\u200B`],
  ])("a marker the filter understands but written slightly wrong: %s", (_, start, end) => {
    const text = `${FRONTMATTER}# X\n${start}\nSecret.\n${end}\n`;
    expect(withoutAuthSections(text)).not.toContain("Secret.");
    expect(found(text)).toEqual([
      [6, "L4"],
      [8, "L4"],
    ]);
  });

  test.each([["a start and an end on one line", `${AUTH_START} Secret. ${AUTH_END}`]])(
    "%s is an error: nothing on that line is hidden",
    (_, line) => {
      const text = `${FRONTMATTER}${line}\n`;
      expect(withoutAuthSections(text)).toContain("Secret.");
      expect(found(text)).toEqual([[5, "L3"]]);
    },
  );

  test.each([
    ["an underscore spelling in prose", "Mark it with okf_auth_start."],
    ["a line that is only inline code", `\`${AUTH_START}\``],
  ])("marker-like text outside a comment is a warning: %s", (_, line) => {
    expect(found(`${FRONTMATTER}${line}\nText.\n`)).toEqual([[5, "L4"]]);
  });
});

describe("authMarkerFindings: markers in fenced code blocks (L4)", () => {
  test("a ~~~ fence counts as a code block too", () => {
    const text = `${FRONTMATTER}~~~\n${AUTH_START}\nExample.\n${AUTH_END}\n~~~\n`;
    expect(found(text)).toEqual([
      [6, "L4"],
      [8, "L4"],
    ]);
  });

  test("a fence closes only on the same character, at least as long, with nothing after it", () => {
    const text = `${FRONTMATTER}\`\`\`\`\n~~~\n\`\`\` x\n${AUTH_START}\nE.\n${AUTH_END}\n\`\`\`\`\n${AUTH_START}\nS.\n${AUTH_END}\n`;
    // Lines 8 and 10 are still in the block; 12 and 14 are after it, written exactly.
    expect(found(text)).toEqual([
      [8, "L4"],
      [10, "L4"],
    ]);
  });

  test("markers inside a code block, which the filter still cuts", () => {
    const text = `${FRONTMATTER}# X\n\`\`\`md\n${AUTH_START}\nExample.\n${AUTH_END}\n\`\`\`\nAfter.\n`;
    expect(found(text)).toEqual([
      [7, "L4"],
      [9, "L4"],
    ]);
  });
});

describe("authMarkerFindings: code examples and frontmatter as concept.ts reads it", () => {
  test("a broken marker shown in a code block is an example, not an error", () => {
    const text = `${FRONTMATTER}Don't write:\n\`\`\`md\n- ${AUTH_START}\n\`\`\`\n`;
    expect(found(text)).toEqual([]);
  });

  test("a sentence with the marker in backticks is fine", () => {
    expect(found(`${FRONTMATTER}Write \`${AUTH_END}\` to end a section.\n`)).toEqual([]);
  });

  test("an indented opening --- isn't frontmatter, so paired markers below it are fine", () => {
    const text = `  ---\ntype: Guide\n${AUTH_START}\nS.\n${AUTH_END}\n---\n`;
    expect(found(text)).toEqual([]);
  });

  test("an indented --- doesn't close the frontmatter", () => {
    const text = `---\ntype: Guide\n  ---\n${AUTH_START}\nx\n${AUTH_END}\n---\n# X\n`;
    expect(found(text)).toEqual([
      [4, "L3"],
      [6, "L3"],
    ]);
  });

  test("a BOM and CRLF frontmatter with a marker inside", () => {
    const text = `\uFEFF---\r\ntype: Guide\r\n${AUTH_START}\r\n---\r\n# X\r\n`;
    expect(found(text)).toEqual([[3, "L3"]]);
  });
});

describe("authMarkerFindings: HTML comments meant as markers (L3)", () => {
  test.each([
    ["an underscore spelling", "<!-- okf_auth_start -->", "<!-- okf_auth_end -->"],
    ["three dashes", "<!--- okf:auth:start --->", "<!--- okf:auth:end --->"],
    ["a space after a colon", "<!-- okf: auth:start -->", "<!-- okf:auth: end -->"],
    ["spaces around both colons", "<!-- okf : auth : start -->", "<!-- okf : auth : end -->"],
    ["a longer closing", "<!-- okf:auth:start ---->", "<!-- okf:auth:end ---->"],
    ["a space in the closing", "<!--okf:auth:start -- >", "<!--okf:auth:end -- >"],
  ])("%s: the filter hides nothing, so it is an error", (_, start, end) => {
    const text = `${FRONTMATTER}# X\n${start}\nSecret.\n${end}\n`;
    expect(withoutAuthSections(text)).toContain("Secret.");
    expect(found(text)).toEqual([
      [6, "L3"],
      [8, "L3"],
    ]);
  });

  test("a comment split over lines", () => {
    const text = `${FRONTMATTER}<!--\nokf:auth:start\n-->\nSecret.\n<!--\nokf:auth:end\n-->\n`;
    expect(withoutAuthSections(text)).toContain("Secret.");
    expect(found(text)).toEqual([
      [6, "L3"],
      [10, "L3"],
    ]);
  });
});

describe("authMarkerFindings: what counts as a fenced code block", () => {
  const HIDDEN = `- ${AUTH_START}\nSecret.\n- ${AUTH_END}\n`;

  test("a one-line ```snippet``` is inline code, not a fence: markers after it are checked", () => {
    const text = `${FRONTMATTER}\`\`\`npm install\`\`\`\n${HIDDEN}`;
    expect(found(text)).toEqual([
      [6, "L3"],
      [8, "L3"],
    ]);
  });

  test("a fence that never closes isn't one: markers after it are checked", () => {
    const text = `${FRONTMATTER}\`\`\`md\nexample\n${HIDDEN}`;
    expect(found(text)).toEqual([
      [7, "L3"],
      [9, "L3"],
    ]);
  });

  test.each([
    ["in a list item", "1. Example:\n\n    ```md\n    - <!-- okf:auth:start -->\n    ```\n"],
    ["in a quote", "> ```md\n> - <!-- okf:auth:start -->\n> ```\n"],
  ])("an example %s is fine", (_, body) => {
    expect(found(`${FRONTMATTER}${body}`)).toEqual([]);
  });
});
