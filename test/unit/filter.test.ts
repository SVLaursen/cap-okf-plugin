import fs from "node:fs";
import path from "node:path";
import { forReader, withoutAuthSections } from "../../src/core/filter";

// Task 4.2: the auth filter (ADR-0003). Every server removes the marked authorization sections,
// markers included, unless the requester is authenticated. Contract from 2.4: a marker counts
// only as a whole line, and marker-like text elsewhere must not cut anything. Where the contract
// says nothing, the filter fails closed: it never leaves marked text in.

const START = "<!-- okf:auth:start -->";
const END = "<!-- okf:auth:end -->";

describe("withoutAuthSections", () => {
  test("removes a section at the end of a body, with the blank lines before it", () => {
    const text = `---\ntype: Entity\n---\n\n# Books\n\nA book.\n\n${START}\n## Authorization\n\nRequires: \`admin\`\n${END}\n`;
    expect(withoutAuthSections(text)).toBe("---\ntype: Entity\n---\n\n# Books\n\nA book.\n");
  });

  test("removes a section in the middle, keeping one blank line between the text around it", () => {
    const text = `Intro.\n\n${START}\nSecret.\n${END}\n\nOutro.\n`;
    expect(withoutAuthSections(text)).toBe("Intro.\n\nOutro.\n");
  });

  test("removes every section, as curated files may have several", () => {
    const text = `A.\n${START}\nx\n${END}\nB.\n${START}\ny\n${END}\nC.\n`;
    expect(withoutAuthSections(text)).toBe("A.\nB.\nC.\n");
  });

  test("a text without sections comes back unchanged", () => {
    const text = "# Title\n\nNothing secret here.\n";
    expect(withoutAuthSections(text)).toBe(text);
  });

  test("marker-like text that isn't a whole line cuts nothing", () => {
    const text = `# How ${START} works\n\nWrite \`${START}\` and ${END} on their own lines.\n`;
    expect(withoutAuthSections(text)).toBe(text);
  });

  test("a marker with spaces around it, or a Windows line ending, still counts", () => {
    const text = `Open.\r\n\r\n  ${START}  \r\nSecret.\r\n\t${END}\r\nAfter.\r\n`;
    expect(withoutAuthSections(text)).toBe("Open.\r\nAfter.\r\n");
  });
});

describe("withoutAuthSections, unbalanced and nested markers fail closed", () => {
  test("a start marker without an end removes everything after it, so nothing leaks", () => {
    const text = `Open.\n\n${START}\nSecret.\nMore secret.\n`;
    expect(withoutAuthSections(text)).toBe("Open.\n");
  });

  test("with Windows line endings, an unclosed section leaves the final \\r\\n in place", () => {
    expect(withoutAuthSections(`Open.\r\n${START}\r\nSecret.\r\n`)).toBe("Open.\r\n");
  });

  test("sections nest: a section ends only at its own end marker", () => {
    const text = `A.\n${START}\nx\n${START}\ny\n${END}\nouter secret\n${END}\nB.\n`;
    expect(withoutAuthSections(text)).toBe("A.\nB.\n");
  });

  test("an inner section left open keeps the outer one open to the end of the file", () => {
    const text = `A.\n${START}\nx\n${START}\ny\n${END}\nB.\n`;
    expect(withoutAuthSections(text)).toBe("A.\n");
  });

  test("an end marker without a start withholds everything before it: its start was broken", () => {
    const text = `A.\nsecret\n${END}\nB.\n`;
    expect(withoutAuthSections(text)).toBe("B.\n");
  });

  test("markers inside a code block still count: the filter fails closed", () => {
    const text = `Example:\n\n\`\`\`\n${START}\nsecret\n${END}\n\`\`\`\n`;
    expect(withoutAuthSections(text)).toBe("Example:\n\n```\n```\n");
  });

  test("a text without a final newline keeps having none", () => {
    expect(withoutAuthSections(`A.\n${START}\nx\n${END}`)).toBe("A.");
    expect(withoutAuthSections("A.")).toBe("A.");
  });
});

describe("withoutAuthSections, markers written slightly wrong still count", () => {
  test.each([
    "<!--okf:auth:start-->",
    "<!-- OKF:Auth:Start -->",
    "<!--   okf:auth:start   -->",
    "> <!-- okf:auth:start -->",
    "\u200B<!-- okf:auth:start -->\u2060",
    "\uFEFF<!-- okf:auth:start -->",
  ])("start marker %j", (marker) => {
    expect(withoutAuthSections(`Open.\n${marker}\nSecret.\n${END}\nAfter.\n`)).toBe(
      "Open.\nAfter.\n",
    );
  });

  test("an end marker written slightly wrong still ends the section", () => {
    expect(withoutAuthSections(`Open.\n${START}\nSecret.\n<!--okf:auth:END-->\nAfter.\n`)).toBe(
      "Open.\nAfter.\n",
    );
  });

  test("old Mac line endings (a lone \\r) separate lines too", () => {
    expect(withoutAuthSections(`Open.\r${START}\rSecret.\r${END}\rAfter.\r`)).toBe(
      "Open.\rAfter.\r",
    );
  });

  test("a start marker in the frontmatter removes the rest, so nothing leaks", () => {
    expect(withoutAuthSections(`---\ntype: X\n${START}\nrole: admin\n---\nBody.\n`)).toBe(
      "---\ntype: X\n",
    );
  });
});

describe("forReader", () => {
  const text = `A.\n\n${START}\nRequires: \`admin\`\n${END}\n`;

  test("an authenticated reader gets the text as it is", () => {
    expect(forReader(text, { isAuthenticated: true })).toBe(text);
  });

  test("an unauthenticated reader gets it without the sections", () => {
    expect(forReader(text, { isAuthenticated: false })).toBe("A.\n");
  });
});

describe("withoutAuthSections on real bundles", () => {
  test("the demo's curated guide loses only its section", () => {
    const file = path.join(__dirname, "..", "..", "demo", "okf", "guides", "ordering.md");
    const text = fs.readFileSync(file, "utf8");
    const filtered = withoutAuthSections(text);
    expect(filtered).not.toMatch(/okf:auth|only see orders/);
    expect(filtered).toContain(
      "Shop staff look orders up in [AdminService](/model/AdminService.md).",
    );
  });

  const GOLDEN = path.join(__dirname, "..", "golden", "bookshop");

  test("the golden bundle: no marker and no role left, everything else unchanged", () => {
    const files = fs
      .readdirSync(GOLDEN, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".md"));
    let sections = 0;
    for (const file of files) {
      const text = fs.readFileSync(path.join(GOLDEN, file), "utf8");
      const filtered = withoutAuthSections(text);
      if (filtered !== text) sections += 1;
      expect({ file, markers: /okf:auth/.test(filtered) }).toEqual({ file, markers: false });
      expect({ file, roles: /catalog-manager|authenticated-user/.test(filtered) }).toEqual({
        file,
        roles: false,
      });
      // What stays is exactly the text before the section.
      expect(text.startsWith(filtered.replace(/\n$/, ""))).toBe(true);
    }
    expect(sections).toBe(7);
  });
});
