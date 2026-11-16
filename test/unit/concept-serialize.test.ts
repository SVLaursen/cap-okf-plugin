import fs from "node:fs";
import path from "node:path";
import { parseConcept, serializeConcept, type Concept } from "../../src/core/concept";

// serializeConcept writes every OKF file cap-okf produces. Its output must parse back to the
// same concept, and the key order must be stable so generated bundles diff cleanly.

const BUNDLES_DIR = path.join(__dirname, "..", "fixtures", "okf-spec", "bundles");

/** Every Markdown file of the official sample bundles, as [bundle-relative path, full path]. */
function sampleFiles(): [string, string][] {
  const files = fs.readdirSync(BUNDLES_DIR, { recursive: true, encoding: "utf8" });
  return files
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => [file, path.join(BUNDLES_DIR, file)]);
}

function concept(frontmatter: Concept["frontmatter"], body = "\n# Body\n"): Concept {
  return { path: "a.md", id: "a", frontmatter, body };
}

/** The frontmatter keys in the order serializeConcept wrote them. */
function writtenKeys(text: string): string[] {
  const { frontmatter } = parseConcept("a.md", text);
  return Object.keys(frontmatter ?? {});
}

describe("serializeConcept round-trip", () => {
  test("the official samples include files to round-trip", () => {
    expect(sampleFiles().length).toBeGreaterThan(50);
  });

  test.each(sampleFiles())("%s parses back to the same concept", (relativePath, fullPath) => {
    const original = parseConcept(relativePath, fs.readFileSync(fullPath, "utf8"));
    expect(parseConcept(relativePath, serializeConcept(original))).toEqual(original);
  });

  test("a concept without frontmatter is written as its body only", () => {
    const index = concept(null, "# Subdirectories\n\n* [tables](tables/index.md)\n");
    expect(serializeConcept(index)).toBe("# Subdirectories\n\n* [tables](tables/index.md)\n");
  });

  test("empty frontmatter is written as an empty block and parses back to {}", () => {
    const text = serializeConcept(concept({}));
    expect(text).toBe("---\n---\n\n# Body\n");
    expect(parseConcept("a.md", text).frontmatter).toEqual({});
  });

  test("a full valid file is written in the expected layout", () => {
    const written = serializeConcept(
      concept({ type: "Playbook", title: "Placing an order", tags: ["shop", "orders"] }),
    );
    expect(written).toBe(
      "---\ntype: Playbook\ntitle: Placing an order\ntags:\n  - shop\n  - orders\n---\n\n# Body\n",
    );
  });
});

describe("serializeConcept values", () => {
  // The yaml library writes such a string as a "|+" block, which keeps every trailing newline.
  test("a last value ending in several newlines keeps all of them", () => {
    const original = concept({ type: "X", notes: "x\n\n" });
    expect(parseConcept("a.md", serializeConcept(original))).toEqual(original);
  });

  test.each([
    ["true"],
    ["null"],
    ["1.0"],
    ["~"],
    ["# x"],
    ["- x"],
    ["*x"],
    ["a: b"],
    ["2026-11-13"],
    [""],
    ["before\n---\nafter"],
  ])("the string %j is written so it parses back as the same string", (value) => {
    const original = concept({ type: "X", value });
    expect(parseConcept("a.md", serializeConcept(original))).toEqual(original);
  });

  test("an object used twice is written out twice, not as a YAML anchor and alias", () => {
    const generated = { by: "human:a", at: "2026-11-13T09:00:00Z" };
    const text = serializeConcept(concept({ type: "X", generated, copied: generated }));
    expect(text).not.toMatch(/[&*]a\d/);
    expect(text).toContain("copied:\n  by: human:a\n");
  });

  test("keys with an undefined value are left out", () => {
    expect(serializeConcept(concept({ type: "X", title: undefined }))).toBe(
      "---\ntype: X\n---\n\n# Body\n",
    );
    expect(serializeConcept(concept({ type: undefined }))).toBe("---\n---\n\n# Body\n");
  });

  test("long values stay on one line, so the output does not depend on a line width", () => {
    const description = "word ".repeat(40).trim();
    expect(serializeConcept(concept({ type: "X", description }))).toContain(
      `description: ${description}\n`,
    );
  });
});

describe("serializeConcept bodies starting with ---", () => {
  // Written as-is, such a body would parse back as frontmatter.
  test("a concept without frontmatter whose body starts with --- is rejected", () => {
    const index = { ...concept(null, "---\nx: 1\n---\n"), path: "guides/index.md" };
    expect(() => serializeConcept(index)).toThrow(
      /^\[okf\] guides\/index\.md:1 — the body starts with a --- line/,
    );
  });

  test("a body may start with --- when the concept has frontmatter", () => {
    const original = concept({ type: "X" }, "---\n\nText under a horizontal rule\n");
    expect(parseConcept("a.md", serializeConcept(original))).toEqual(original);
  });
});

describe("serializeConcept key order", () => {
  test("known keys come first in the OKF order, whatever order they had", () => {
    const text = serializeConcept(
      concept({
        sources: [],
        stale_after: "2026-12-31T00:00:00Z",
        verified: [],
        generated: { by: "human:a", at: "2026-11-13T09:00:00Z" },
        status: "stable",
        tags: [],
        resource: "r",
        description: "d",
        title: "t",
        type: "X",
      }),
    );
    expect(writtenKeys(text)).toEqual([
      "type",
      "title",
      "description",
      "resource",
      "tags",
      "status",
      "generated",
      "verified",
      "stale_after",
      "sources",
    ]);
  });

  test("unknown keys follow the known ones, in their original order", () => {
    const text = serializeConcept(
      concept({ zeta: 1, title: "t", review_owner: "shop-team", type: "X", alpha: true }),
    );
    expect(writtenKeys(text)).toEqual(["type", "title", "zeta", "review_owner", "alpha"]);
  });

  // A plain assignment to obj["__proto__"] changes the prototype instead of adding a key.
  test("an unknown __proto__ key is kept like any other key", () => {
    const original = parseConcept("a.md", "---\ntype: X\n__proto__: kept\n---\n");
    expect(writtenKeys(serializeConcept(original))).toEqual(["type", "__proto__"]);
  });

  test("nested keys keep their original order", () => {
    const text = serializeConcept(concept({ type: "X", generated: { at: "now", by: "me" } }));
    expect(text).toContain("generated:\n  at: now\n  by: me\n");
  });

  test("serializing does not change the concept it is given", () => {
    const input = concept({ title: "t", type: "X" });
    serializeConcept(input);
    expect(Object.keys(input.frontmatter ?? {})).toEqual(["title", "type"]);
  });
});

describe("serializeConcept trailing newline", () => {
  test.each([
    ["no newline", "# Body"],
    ["one newline", "# Body\n"],
    ["several newlines", "# Body\n\n\n"],
  ])("a body with %s gives output ending in exactly one newline", (_label, body) => {
    const text = serializeConcept(concept({ type: "X" }, body));
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  test("an empty body still ends the output with exactly one newline", () => {
    expect(serializeConcept(concept({ type: "X" }, ""))).toBe("---\ntype: X\n---\n");
  });

  test("a concept without frontmatter and without body is a single newline", () => {
    expect(serializeConcept(concept(null, ""))).toBe("\n");
  });
});
