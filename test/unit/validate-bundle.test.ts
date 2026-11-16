import fs from "node:fs";
import path from "node:path";
import * as conceptModule from "../../src/core/concept";
import { validateBundle, type BundleFile, type Finding } from "../../src/core/validate";

// validateBundle checks a bundle against OKF v0.2 §11 (errors R1–R3) and the shapes §5 asks
// for (warnings W1–W3). Each folder in test/fixtures/broken is a tiny bundle with one problem.

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");
const BROKEN_DIR = path.join(FIXTURES_DIR, "broken");
const SAMPLES_DIR = path.join(FIXTURES_DIR, "okf-spec", "bundles");

/**
 * All files under a folder, with paths relative to it, as validateBundle takes them. Not only
 * Markdown: links may point at other files, such as an attester's .py file.
 */
function readBundle(folder: string): BundleFile[] {
  return fs
    .readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((file) => fs.statSync(path.join(folder, file)).isFile())
    .sort()
    .map((file) => ({
      // Bundle paths always use /, also where readdirSync returns \ (Windows).
      path: file.split(path.sep).join("/"),
      text: fs.readFileSync(path.join(folder, file), "utf8"),
    }));
}

function file(filePath: string, text: string): BundleFile {
  return { path: filePath, text };
}

type Expected = Pick<Finding, "file" | "line" | "rule" | "severity"> & { message: RegExp };

const BROKEN_CASES: Record<string, Expected> = {
  "r1-no-frontmatter": {
    file: "ordering.md",
    line: 1,
    rule: "R1",
    severity: "error",
    message: /no frontmatter/,
  },
  "r1-invalid-yaml": {
    file: "ordering.md",
    line: 5,
    rule: "R1",
    severity: "error",
    message: /not valid YAML/,
  },
  "r2-missing-type": {
    file: "ordering.md",
    line: 1,
    rule: "R2",
    severity: "error",
    message: /no "type"/,
  },
  "r2-empty-type": {
    file: "ordering.md",
    line: 2,
    rule: "R2",
    severity: "error",
    message: /"type" is empty/,
  },
  "r3-index-frontmatter-in-folder": {
    file: "guides/index.md",
    line: 1,
    rule: "R3",
    severity: "error",
    message: /only the bundle-root index\.md may have frontmatter/,
  },
  "r3-root-index-extra-key": {
    file: "index.md",
    line: 3,
    rule: "R3",
    severity: "error",
    message: /"title" is not allowed/,
  },
  "r3-index-entry-not-a-link": {
    file: "index.md",
    line: 4,
    rule: "R3",
    severity: "error",
    message: /list entry does not start with a link/,
  },
  "r3-log-invalid-date": {
    file: "log.md",
    line: 3,
    rule: "R3",
    severity: "error",
    message: /"2026-02-30" is not a valid YYYY-MM-DD date/,
  },
  "r3-log-not-newest-first": {
    file: "log.md",
    line: 6,
    rule: "R3",
    severity: "error",
    message: /newest first/,
  },
  "w1-missing-description": {
    file: "ordering.md",
    line: 1,
    rule: "W1",
    severity: "warning",
    message: /recommended "description" is missing/,
  },
  "w2-generated-at-not-iso": {
    file: "ordering.md",
    line: 5,
    rule: "W2",
    severity: "warning",
    message: /"generated\.at" is not an ISO 8601 date and time/,
  },
  "w2-generated-without-by": {
    file: "ordering.md",
    line: 5,
    rule: "W2",
    severity: "warning",
    message: /"generated\.by" is missing/,
  },
  "w2-verified-without-at": {
    file: "ordering.md",
    line: 7,
    rule: "W2",
    severity: "warning",
    message: /"verified\[1\]\.at" is missing/,
  },
  "w2-status-unknown": {
    file: "ordering.md",
    line: 5,
    rule: "W2",
    severity: "warning",
    message: /"status" must be draft, stable or deprecated/,
  },
  "w2-stale-after-not-absolute": {
    file: "ordering.md",
    line: 5,
    rule: "W2",
    severity: "warning",
    message: /"stale_after" is not an absolute instant/,
  },
  "w2-source-without-resource": {
    file: "ordering.md",
    line: 6,
    rule: "W2",
    severity: "warning",
    message: /"sources\[0\]\.resource" is missing/,
  },
  "w2-source-duplicate-id": {
    file: "ordering.md",
    line: 8,
    rule: "W2",
    severity: "warning",
    message: /"sources\[1\]\.id" repeats "shop-handbook"/,
  },
  "w4-broken-link": {
    file: "guides/ordering.md",
    line: 10,
    rule: "W4",
    severity: "warning",
    message: /link target "retuns\.md" does not exist in the bundle/,
  },
  "w3-timestamp": {
    file: "ordering.md",
    line: 5,
    rule: "W3",
    severity: "warning",
    message: /"timestamp" is deprecated/,
  },
};

describe("validateBundle broken fixtures", () => {
  test("every fixture folder has an expected finding, and every expected finding a folder", () => {
    const folders = fs.readdirSync(BROKEN_DIR).sort();
    expect(folders).toEqual(Object.keys(BROKEN_CASES).sort());
  });

  test.each(Object.entries(BROKEN_CASES))("%s gives exactly its finding", (folder, expected) => {
    const findings = validateBundle(readBundle(path.join(BROKEN_DIR, folder)));
    expect(findings).toEqual([
      { ...expected, message: expect.stringMatching(expected.message), fix: expect.any(String) },
    ]);
  });

  // A printer adds "[okf] <file>:<line> — " and the final periods (CLAUDE.md, Style).
  test("messages start lowercase and fixes start uppercase, neither ends with a period", () => {
    for (const folder of Object.keys(BROKEN_CASES)) {
      for (const finding of validateBundle(readBundle(path.join(BROKEN_DIR, folder)))) {
        expect(finding.message).toMatch(/^[a-z"].*[^.]$/s);
        expect(finding.fix).toMatch(/^[A-Z].*[^.]$/s);
      }
    }
  });
});

describe("validateBundle valid bundles", () => {
  test.each(["acme_retail", "crypto_bitcoin", "ga4", "stackoverflow"])(
    "the official %s sample has no findings",
    (bundle) => {
      // No warnings either: in particular, footnote citations (§5.1) are not broken links.
      expect(validateBundle(readBundle(path.join(SAMPLES_DIR, bundle)))).toEqual([]);
    },
  );

  // The curated guides link into model/, which the exporter generates (Phase 2). Until the
  // two are merged into one bundle, those links are the only findings.
  test("the demo app's curated bundle has no findings except links into model/", () => {
    const findings = validateBundle(readBundle(path.join(__dirname, "..", "..", "demo", "okf")));
    const unexpected = findings.filter(
      (finding) => !(finding.rule === "W4" && /link target "\/?model\//.test(finding.message)),
    );
    expect(unexpected).toEqual([]);
    // A tripwire, meant to fail once model/ is merged in: then expect no findings at all.
    expect(findings.length).toBeGreaterThan(0);
  });

  test("a concept using every v0.2 family correctly has no findings", () => {
    const text = [
      "---",
      "type: Metric",
      "title: Revenue",
      "description: Recognized revenue for a period.",
      "status: deprecated",
      "generated: { by: reference_agent/v1, at: 2026-06-30T14:00:00.250+02:00 }",
      "verified: { by: human:a, at: 2026-07-01T09:00-05:30 }",
      "stale_after: 2026-12-31T00:00:00Z",
      "sources:",
      "  - { id: a, resource: policies/a.md }",
      "  - { resource: all queries in project X }",
      "---",
    ].join("\n");
    expect(validateBundle([file("metrics/revenue.md", text)])).toEqual([]);
  });

  test("an empty bundle has no findings", () => {
    expect(validateBundle([])).toEqual([]);
  });
});

describe("validateBundle general behaviour", () => {
  test("findings are sorted by file, then line", () => {
    const findings = validateBundle([
      file("b.md", "---\ntype: X\n---\n"),
      file("a.md", "---\ntitle: t\ndescription: d\nstatus: odd\n---\n"),
      file("c.md", "# no frontmatter\n"),
    ]);
    expect(findings.map(({ file, line, rule }) => [file, line, rule])).toEqual([
      ["a.md", 1, "R2"],
      ["a.md", 4, "W2"],
      ["b.md", 1, "W1"],
      ["b.md", 1, "W1"],
      ["c.md", 1, "R1"],
    ]);
  });

  test("a type that is not a string is an R2 error", () => {
    const findings = validateBundle([
      file("a.md", "---\ntype: [X]\ntitle: t\ndescription: d\n---\n"),
    ]);
    expect(findings).toMatchObject([
      { rule: "R2", line: 2, message: expect.stringMatching(/must be a string/) },
    ]);
  });

  // parseConceptLocated throws only ConceptParseError today; the spy stands in for a future bug,
  // which must surface instead of being reported as a finding about the user's file.
  test("an error other than a parse error is not swallowed", () => {
    const spy = jest.spyOn(conceptModule, "parseConceptLocated").mockImplementation(() => {
      throw new TypeError("unexpected");
    });
    try {
      expect(() => validateBundle([file("a.md", "")])).toThrow(TypeError);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("validateBundle links", () => {
  test("a broken link suggests the closest bundle path", () => {
    const findings = validateBundle(readBundle(path.join(BROKEN_DIR, "w4-broken-link")));
    expect(findings).toMatchObject([
      {
        rule: "W4",
        fix: 'Change the link to "/guides/returns.md", the closest path in the bundle',
      },
    ]);
  });

  test("without a close path, the fix says to create the concept or correct the link", () => {
    const findings = validateBundle([file("index.md", "* [Orders](tables/orders.md)\n")]);
    expect(findings).toMatchObject([
      {
        file: "index.md",
        line: 1,
        rule: "W4",
        fix: "Create /tables/orders.md, or correct the link",
      },
    ]);
  });

  test("a link to a non-Markdown file in the bundle is fine", () => {
    const findings = validateBundle([
      file("index.md", "See the [attester](references/attesters/revenue.py).\n"),
      file("references/attesters/revenue.py", "def attest(): pass\n"),
    ]);
    expect(findings).toEqual([]);
  });

  test("a link to a folder is fine when the folder has files", () => {
    const findings = validateBundle([
      file("index.md", "* [Tables](tables/) - All tables.\n* [Root](/)\n"),
      file("tables/orders.md", "---\ntype: X\ntitle: t\ndescription: d\n---\n"),
    ]);
    expect(findings).toEqual([]);
  });

  test("a link above the bundle root is broken", () => {
    const findings = validateBundle([file("index.md", "[up](../other-bundle/a.md)\n")]);
    expect(findings).toMatchObject([
      { rule: "W4", message: expect.stringMatching(/points outside the bundle/) },
    ]);
  });

  // One suggestion per distinct missing path, and short-cuts in the distance search, keep
  // large bundles fast. The time limit is generous; before the fix this took over 10 seconds.
  test("a large bundle with many broken links is validated quickly", () => {
    const files = Array.from({ length: 2000 }, (_, index) =>
      file(
        `model/n${index}/Entity${index}.md`,
        `---\ntype: X\ntitle: t\ndescription: d\n---\n[a](Missing${index}.md) [b](/gone/x${index}.md)\n`,
      ),
    );
    const started = performance.now();
    expect(validateBundle(files)).toHaveLength(4000);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  test("links in a file with broken frontmatter are not checked: its R1 comes first", () => {
    const findings = validateBundle([file("a.md", "---\ntype: [\n---\n[b](b.md)\n")]);
    expect(findings.map((finding) => finding.rule)).toEqual(["R1"]);
  });
});

describe("validateBundle file kinds", () => {
  test("files that are not Markdown are skipped, as §11 covers only .md files", () => {
    const attester = file("references/attesters/revenue.py", "def attest(): pass\n");
    expect(validateBundle([attester])).toEqual([]);
  });

  test.each(["index.md", "guides/log.md"])(
    "broken YAML in reserved %s is an R3 error, not R1",
    (reservedPath) => {
      const findings = validateBundle([file(reservedPath, "---\nokf_version: [\n---\n")]);
      expect(findings).toMatchObject([{ file: reservedPath, rule: "R3", severity: "error" }]);
    },
  );

  test("a title that is not text is reported as such", () => {
    const findings = validateBundle([
      file("a.md", "---\ntype: X\ntitle: 42\ndescription: d\n---\n"),
    ]);
    expect(findings).toMatchObject([
      { rule: "W1", message: expect.stringMatching(/"title" is missing, empty or not text/) },
    ]);
  });
});

describe("validateBundle reserved files", () => {
  test("index.md and log.md may lack frontmatter, at any level", () => {
    const findings = validateBundle([
      file("index.md", "# Guides\n"),
      file("guides/log.md", "# Log\n\n## 2026-11-13\n* Added.\n"),
    ]);
    expect(findings).toEqual([]);
  });

  test("log.md may have frontmatter, as the acme_retail sample does", () => {
    const log = "---\ntype: Log\n---\n\n# History\n\n## 2026-07-01\n- Verified.\n";
    expect(validateBundle([file("log.md", log)])).toEqual([]);
  });

  test("log heading lines count the frontmatter above the body", () => {
    const log = "---\ntype: Log\n---\n\n## 2026-7-1\n";
    expect(validateBundle([file("log.md", log)])).toMatchObject([{ rule: "R3", line: 5 }]);
  });

  test("headings and list items inside a code block are not checked", () => {
    const index = "# Guides\n\n```\n* not a link\n## not a date\n```\n";
    expect(validateBundle([file("index.md", index), file("log.md", index)])).toEqual([]);
  });

  test.each([
    ["a ``` fence inside a ~~~ block", "~~~\n```\n* example\n~~~\n"],
    ["a longer closing fence", "```\n* example\n`````\n"],
    ["an indented fence", "   ```\n* example\n   ```\n"],
  ])("a code block stays open across %s", (_label, body) => {
    expect(validateBundle([file("index.md", `# Guides\n\n${body}`)])).toEqual([]);
  });

  test.each([
    ["a shorter fence", "````\n```\n````\n* not a link\n"],
    ["a fence of the other kind", "~~~\n```\n~~~\n* not a link\n"],
  ])("the code block ends at its own closing fence, despite %s", (_label, body) => {
    const findings = validateBundle([file("index.md", `# Guides\n\n${body}`)]);
    expect(findings).toMatchObject([{ rule: "R3", line: 6 }]);
  });
});

describe("validateBundle index.md entries", () => {
  test.each([
    ["a thematic break", "* * *"],
    ["a nested detail under an entry", "* [Orders](orders.md) - All orders.\n  * detail"],
    ["an indented code line", "    * code"],
    ["brackets in the link text", "* [Orders [beta]](orders.md) - All orders."],
    ["a reference-style link", "* [Orders][orders]\n\n[orders]: orders.md"],
    ["a bold link", "* **[Orders](orders.md)** - All orders."],
  ])("an index.md with %s has no findings", (_label, body) => {
    const orders = file("orders.md", "---\ntype: X\ntitle: t\ndescription: d\n---\n");
    expect(validateBundle([file("index.md", `# Guides\n\n${body}\n`), orders])).toEqual([]);
  });
});

describe("validateBundle log.md headings", () => {
  test.each([
    ["closing hashes", "## 2026-05-22 ##"],
    ["an indent of up to three spaces", "   ## 2026-05-22"],
  ])("a log heading with %s is read as its date", (_label, heading) => {
    expect(validateBundle([file("log.md", `${heading}\n`)])).toEqual([]);
    const invalid = heading.replace("05-22", "05-32");
    expect(validateBundle([file("log.md", `${invalid}\n`)])).toMatchObject([{ rule: "R3" }]);
  });

  test("the same date twice in log.md is reported: one heading per date", () => {
    const log = "## 2026-11-13\n* a\n\n## 2026-11-13\n* b\n";
    expect(validateBundle([file("log.md", log)])).toMatchObject([
      {
        rule: "R3",
        line: 4,
        message: expect.stringMatching(
          /2026-11-13 repeats an earlier heading; one heading per date/,
        ),
      },
    ]);
  });

  test.each([
    ["2028-02-29", true],
    ["2000-02-29", true],
    ["2027-02-29", false],
    ["2100-02-29", false],
    ["2026-11-00", false],
    ["2026-11-31", false],
  ])("log date %s is valid: %s", (date, valid) => {
    const findings = validateBundle([file("log.md", `## ${date}\n`)]);
    expect(findings).toHaveLength(valid ? 0 : 1);
  });
});

describe("validateBundle field shapes", () => {
  test.each([
    ["a date without time", "2026-11-13"],
    ["an hour of 24", "2026-11-13T24:00:00Z"],
    ["a 13th month", "2026-13-01T00:00:00Z"],
    ["a number", "1731488400"],
    ["a lowercase z", "2026-11-13T09:00:00z"],
    ["no UTC offset (§5 requires one)", "2026-11-13T09:00:00"],
    ["an offset hour of 24", "2026-11-13T09:00:00+24:00"],
    ["an offset minute of 60", "2026-11-13T09:00:00+01:60"],
    ["a basic-format offset", "2026-11-13T09:00:00+0200"],
  ])("generated.at with %s is a W2 warning", (_label, at) => {
    const text = `---\ntype: X\ntitle: t\ndescription: d\ngenerated: { by: human:a, at: ${at} }\n---\n`;
    expect(validateBundle([file("a.md", text)])).toMatchObject([{ rule: "W2" }]);
  });

  test.each([
    ["generated", "generated: human:a", /"generated" must be a mapping/],
    ["verified", "verified: [human:a]", /"verified\[0\]" must be a mapping/],
    ["sources", "sources: { resource: x }", /"sources" must be a list/],
    ["a sources entry", "sources: [x]", /"sources\[0\]" must be a mapping/],
  ])("%s with the wrong shape is a W2 warning", (_label, line, message) => {
    const text = `---\ntype: X\ntitle: t\ndescription: d\n${line}\n---\n`;
    expect(validateBundle([file("a.md", text)])).toMatchObject([
      { rule: "W2", line: 5, message: expect.stringMatching(message) },
    ]);
  });
});
