import { ConceptParseError, parseConcept, type Frontmatter } from "../../src/core/concept";

// parseConcept is the entry point for every OKF file cap-okf reads: curated concepts,
// the official sample bundles and, later, its own generated output.

// Written as a char code: the byte order mark is invisible, so a literal could vanish unnoticed.
const BOM = String.fromCharCode(0xfeff);

const VALID = [
  "---",
  "type: Playbook",
  "title: Placing an order",
  'generated: { by: "human:demo-author", at: 2026-11-13T09:00:00Z }',
  "---",
  "",
  "# Steps",
  "",
].join("\n");

/** The frontmatter of a file that must have one. */
function frontmatterOf(path: string, text: string): Frontmatter {
  const { frontmatter } = parseConcept(path, text);
  if (frontmatter === null) throw new Error(`expected ${path} to have frontmatter`);
  return frontmatter;
}

function parseError(path: string, text: string): ConceptParseError {
  try {
    parseConcept(path, text);
  } catch (error) {
    if (error instanceof ConceptParseError) return error;
    throw error;
  }
  throw new Error("expected parseConcept to throw");
}

describe("parseConcept structure", () => {
  test("splits a valid file into path, id, frontmatter and body", () => {
    expect(parseConcept("guides/ordering.md", VALID)).toEqual({
      path: "guides/ordering.md",
      id: "guides/ordering",
      frontmatter: {
        type: "Playbook",
        title: "Placing an order",
        generated: { by: "human:demo-author", at: "2026-11-13T09:00:00Z" },
      },
      body: "\n# Steps\n",
    });
  });

  test("keeps dates as the strings they were written as", () => {
    expect(frontmatterOf("a.md", VALID)).toMatchObject({ generated: { at: expect.any(String) } });
  });

  test("a file without frontmatter has frontmatter null and the whole text as body", () => {
    const text = "# Subdirectories\n\n* [tables](tables/index.md) - Tables.\n";
    expect(parseConcept("index.md", text)).toEqual({
      path: "index.md",
      id: "index",
      frontmatter: null,
      body: text,
    });
  });

  test("an empty frontmatter block gives an empty object, not null", () => {
    expect(parseConcept("a.md", "---\n---\nbody\n").frontmatter).toEqual({});
  });

  test("frontmatter must start on the first line", () => {
    const text = "\n---\ntype: X\n---\n";
    expect(parseConcept("a.md", text).frontmatter).toBeNull();
  });

  test("keeps unknown keys, nested values and their order", () => {
    const text =
      "---\ntype: X\nreview_owner: shop-team\nzeta: { b: 1, a: [x, y] }\nalpha: true\n---\n";
    const frontmatter = frontmatterOf("a.md", text);
    expect(frontmatter).toEqual({
      type: "X",
      review_owner: "shop-team",
      zeta: { b: 1, a: ["x", "y"] },
      alpha: true,
    });
    expect(Object.keys(frontmatter)).toEqual(["type", "review_owner", "zeta", "alpha"]);
    expect(Object.keys(frontmatter["zeta"] as object)).toEqual(["b", "a"]);
  });
});

describe("parseConcept input variations", () => {
  test("CRLF line endings give the same result as LF", () => {
    const crlf = VALID.replace(/\n/g, "\r\n");
    expect(parseConcept("guides/ordering.md", crlf)).toEqual(
      parseConcept("guides/ordering.md", VALID),
    );
  });

  test("a UTF-8 byte order mark is ignored", () => {
    const withBom = BOM + VALID;
    expect(parseConcept("guides/ordering.md", withBom)).toEqual(
      parseConcept("guides/ordering.md", VALID),
    );
  });

  test("a delimiter line may have trailing spaces or tabs", () => {
    expect(frontmatterOf("a.md", "--- \ntype: X\n---\t\nbody")).toEqual({ type: "X" });
  });

  // A known limit of plain JS objects, pinned so tasks 1.2 and 1.7 can document it.
  test("integer-like keys come first, whatever order they were written in", () => {
    const frontmatter = frontmatterOf("a.md", "---\ntype: X\n2: two\n1: one\n---\n");
    expect(Object.keys(frontmatter)).toEqual(["1", "2", "type"]);
  });

  test("the id drops only a trailing .md", () => {
    expect(parseConcept("model/demo.md/Books.md", VALID).id).toBe("model/demo.md/Books");
  });
});

describe("parseConcept errors", () => {
  test("invalid YAML names the file line of the problem, counting the opening ---", () => {
    const text = "---\ntype: X\ntags: [a,\n---\nbody\n";
    const error = parseError("guides/bad.md", text);
    // Line 3 is "tags: [a," where the unclosed list starts.
    expect(error).toMatchObject({ file: "guides/bad.md", line: 3, rule: "R1", severity: "error" });
    expect(error.message).toMatch(/^frontmatter is not valid YAML/);
    expect(error.fix).toEqual(expect.any(String));
  });

  test("a duplicate key is invalid YAML on the line of the second key", () => {
    const error = parseError("a.md", "---\ntype: X\ntype: Y\n---\n");
    expect(error).toMatchObject({ file: "a.md", line: 3, rule: "R1" });
    // Only yaml's reason is kept: no " at line N, column M:" and no code excerpt.
    expect(error.message).toBe("frontmatter is not valid YAML: Map keys must be unique");
  });

  test("an opening --- without a closing one is an error on line 1", () => {
    const error = parseError("a.md", "---\ntype: X\n\n# Body\n");
    expect(error).toMatchObject({ file: "a.md", line: 1, rule: "R1" });
    expect(error.message).toMatch(/not closed/);
  });

  test("frontmatter that is not a mapping is an error", () => {
    const error = parseError("a.md", "---\n- type\n- X\n---\n");
    expect(error).toMatchObject({ file: "a.md", line: 2, rule: "R1" });
    expect(error.message).toMatch(/mapping/);
  });

  test("a list after blank lines and comments is reported on its own line", () => {
    const error = parseError("a.md", "---\n\n# note\n- a\n---\n");
    expect(error).toMatchObject({ line: 4, rule: "R1" });
  });

  test("a special YAML type such as !!binary is not a mapping", () => {
    expect(parseError("a.md", "---\n!!binary aGVsbG8=\n---\n").message).toMatch(/mapping/);
  });

  test("line numbers stay right with CRLF and a byte order mark", () => {
    const text = BOM + "---\r\ntype: X\r\ntags: [a,\r\n---\r\n";
    expect(parseError("a.md", text)).toMatchObject({ line: 3 });
  });
});
