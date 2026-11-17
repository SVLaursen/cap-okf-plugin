import type { Finding } from "../../src/core/finding";
import { formatFinding } from "../../src/core/finding";
import { buildMessagesOf } from "../../src/build/findings";

// Task 2.9: the build runs the validator and fails only on errors; warnings are reported.

const WARNING: Finding = {
  file: "model/x/A.md",
  line: 2,
  rule: "W1",
  severity: "warning",
  message: "the frontmatter has no description",
  fix: "Add a description",
};

const ERROR: Finding = {
  file: "model/x/B.md",
  line: 1,
  rule: "R2",
  severity: "error",
  message: "the frontmatter has no type",
  fix: "Add a non-empty type",
};

describe("formatFinding", () => {
  test("follows the [okf] message style: file, line, what is wrong, then how to fix it", () => {
    expect(formatFinding(ERROR)).toBe(
      "[okf] model/x/B.md:1 — the frontmatter has no type (R2).\n  Add a non-empty type.",
    );
  });
});

describe("buildMessagesOf", () => {
  test("no findings: nothing to report, nothing fails", () => {
    expect(buildMessagesOf([])).toEqual({ errors: [], warnings: [] });
  });

  test("warnings are reported but don't fail the build", () => {
    expect(buildMessagesOf([WARNING])).toEqual({
      errors: [],
      warnings: [formatFinding(WARNING)],
    });
  });

  test("errors are kept apart, so the build can fail on them", () => {
    expect(buildMessagesOf([WARNING, ERROR])).toEqual({
      errors: [formatFinding(ERROR)],
      warnings: [formatFinding(WARNING)],
    });
  });
});
