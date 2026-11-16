import fs from "node:fs";
import path from "node:path";
import { validateBundle, type BundleFile, type Finding } from "../../src/core/validate";

// validateBundle checks a bundle against OKF v0.2 §11 (errors R1–R3) and the shapes §5 asks
// for (warnings W1–W3). Each folder in test/fixtures/broken is a tiny bundle with one problem.

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");
const BROKEN_DIR = path.join(FIXTURES_DIR, "broken");
const SAMPLES_DIR = path.join(FIXTURES_DIR, "okf-spec", "bundles");

/** All Markdown files under a folder, with paths relative to it, as validateBundle takes them. */
function readBundle(folder: string): BundleFile[] {
  return fs
    .readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => ({ path: file, text: fs.readFileSync(path.join(folder, file), "utf8") }));
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
    expect(findings).toEqual([{ ...expected, message: expect.stringMatching(expected.message) }]);
  });

  test("every finding says how to fix it", () => {
    for (const folder of Object.keys(BROKEN_CASES)) {
      for (const finding of validateBundle(readBundle(path.join(BROKEN_DIR, folder)))) {
        expect(finding.fix).toEqual(expect.any(String));
        expect(finding.fix.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("validateBundle valid bundles", () => {
  test.each(["acme_retail", "crypto_bitcoin", "ga4", "stackoverflow"])(
    "the official %s sample has no errors",
    (bundle) => {
      const errors = validateBundle(readBundle(path.join(SAMPLES_DIR, bundle))).filter(
        (finding) => finding.severity === "error",
      );
      expect(errors).toEqual([]);
    },
  );

  test("the demo app's curated bundle has no findings at all", () => {
    expect(validateBundle(readBundle(path.join(__dirname, "..", "..", "demo", "okf")))).toEqual([]);
  });

  test("a concept using every v0.2 family correctly has no findings", () => {
    const text = [
      "---",
      "type: Metric",
      "title: Revenue",
      "description: Recognized revenue for a period.",
      "status: deprecated",
      "generated: { by: reference_agent/v1, at: 2026-06-30T14:00:00.250+02:00 }",
      "verified: { by: human:a, at: 2026-07-01T09:00Z }",
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

describe("validateBundle details", () => {
  test("findings are sorted by file, then line", () => {
    const findings = validateBundle([
      file("b.md", "---\ntype: X\n---\n"),
      file("a.md", "---\ntitle: t\ndescription: d\nstatus: odd\n---\n"),
    ]);
    expect(findings.map(({ file, line, rule }) => [file, line, rule])).toEqual([
      ["a.md", 1, "R2"],
      ["a.md", 4, "W2"],
      ["b.md", 1, "W1"],
      ["b.md", 1, "W1"],
    ]);
  });

  test("a type that is not a string is an R2 error", () => {
    const findings = validateBundle([file("a.md", "---\ntype: [X]\ntitle: t\ndescription: d\n---\n")]);
    expect(findings).toMatchObject([{ rule: "R2", line: 2, message: /must be a string/ }]);
  });

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

  test("the same date twice in log.md is reported: one heading per date", () => {
    const log = "## 2026-11-13\n* a\n\n## 2026-11-13\n* b\n";
    expect(validateBundle([file("log.md", log)])).toMatchObject([{ rule: "R3", line: 4 }]);
  });

  test("29 February is a valid log date only in a leap year", () => {
    const leap = validateBundle([file("log.md", "## 2028-02-29\n")]);
    const notLeap = validateBundle([file("log.md", "## 2027-02-29\n")]);
    expect(leap).toEqual([]);
    expect(notLeap).toMatchObject([{ rule: "R3", line: 1 }]);
  });

  test.each([
    ["a date without time", "2026-11-13"],
    ["an hour of 24", "2026-11-13T24:00:00Z"],
    ["a 13th month", "2026-13-01T00:00:00Z"],
    ["a number", "1731488400"],
    ["a lowercase z", "2026-11-13T09:00:00z"],
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
    expect(validateBundle([file("a.md", text)])).toMatchObject([{ rule: "W2", line: 5, message }]);
  });
});
