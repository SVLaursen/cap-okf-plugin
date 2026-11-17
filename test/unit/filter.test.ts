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
    expect(withoutAuthSections(text)).toBe("Open.\r\n\r\nAfter.\r\n");
  });

  test("a start marker without an end removes everything after it, so nothing leaks", () => {
    const text = `Open.\n\n${START}\nSecret.\nMore secret.\n`;
    expect(withoutAuthSections(text)).toBe("Open.\n");
  });

  test("a start marker inside a section doesn't end it; the first end marker does", () => {
    const text = `A.\n${START}\nx\n${START}\ny\n${END}\nB.\n`;
    expect(withoutAuthSections(text)).toBe("A.\nB.\n");
  });

  test("an end marker without a start is removed, and the text around it stays", () => {
    const text = `A.\n${END}\nB.\n`;
    expect(withoutAuthSections(text)).toBe("A.\nB.\n");
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
