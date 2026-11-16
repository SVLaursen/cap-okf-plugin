// Bundle validation against OKF v0.2. Pure module: files in, findings out.
import {
  ConceptParseError,
  parseConceptLocated,
  type Frontmatter,
  type LocatedConcept,
} from "./concept";
import { findingAtKey, findingOnLine, type Finding } from "./finding";
import { checkIndexFile, checkLogFile } from "./validate-reserved";
import { checkFieldShapes } from "./validate-shapes";
import { isNonEmptyString } from "./values";

export type { Finding, Rule, Severity } from "./finding";

/**
 * One file of a bundle, as read from disk or produced by the exporter. Files that are not
 * Markdown (e.g. references/attesters/revenue.py, §6.3) may be passed; they are skipped.
 */
export interface BundleFile {
  /** Bundle-relative path with / separators, e.g. "guides/ordering.md". */
  path: string;
  text: string;
}

const RECOMMENDED_KEYS = ["title", "description"];

const RESERVED_FILE_NAMES = ["index.md", "log.md"];

/**
 * Checks every file of a bundle. Rules R1–R3 are errors, W1–W3 warnings (see Rule).
 * Findings are sorted by file, then line, so the result is the same for any input order.
 */
export function validateBundle(files: readonly BundleFile[]): Finding[] {
  // §11 covers only .md files; anything else in a bundle is a reference or an attachment.
  const markdownFiles = files.filter((file) => file.path.endsWith(".md"));
  return markdownFiles.flatMap(validateFile).sort(byFileThenLine);
}

function validateFile(file: BundleFile): Finding[] {
  const name = fileName(file.path);
  let located: LocatedConcept;
  try {
    located = parseConceptLocated(file.path, file.text);
  } catch (error) {
    // A file that can't be parsed is a finding, not a reason to stop checking the bundle.
    if (error instanceof ConceptParseError) return [findingFromParseError(error, name)];
    throw error;
  }
  if (name === "index.md") return checkIndexFile(located);
  if (name === "log.md") return checkLogFile(located);
  return checkConceptFile(located);
}

// R1 is about concept files (§11.1). In index.md or log.md, broken frontmatter breaks the
// structure of a reserved file, which is R3.
function findingFromParseError(error: ConceptParseError, name: string): Finding {
  const { file, line, severity, message, fix } = error;
  const rule = RESERVED_FILE_NAMES.includes(name) ? "R3" : error.rule;
  return { file, line, rule, severity, message, fix };
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function checkConceptFile(located: LocatedConcept): Finding[] {
  const { frontmatter } = located.concept;
  if (frontmatter === null) {
    return [
      findingOnLine(located, 1, "R1", {
        message: "the concept has no frontmatter",
        fix: "Start the file with a --- line, type: <Type name>, and a closing --- line",
      }),
    ];
  }
  return [
    ...checkType(located, frontmatter),
    ...checkRecommendedKeys(located, frontmatter),
    ...checkFieldShapes(located, frontmatter),
    ...checkDeprecatedKeys(located, frontmatter),
  ];
}

// R2: type is the one required key (§4.1).
function checkType(located: LocatedConcept, frontmatter: Frontmatter): Finding[] {
  const type = frontmatter["type"];
  const fix = 'Add a short kind name, e.g. type: Playbook or type: "CDS Entity"';
  if (type === undefined) {
    return [
      findingAtKey(located, ["type"], "R2", { message: 'the frontmatter has no "type"', fix }),
    ];
  }
  if (typeof type !== "string") {
    return [findingAtKey(located, ["type"], "R2", { message: '"type" must be a string', fix })];
  }
  if (type.trim() === "") {
    return [findingAtKey(located, ["type"], "R2", { message: '"type" is empty', fix })];
  }
  return [];
}

// W1: title and description feed index.md entries and search snippets (§4.1, §8).
function checkRecommendedKeys(located: LocatedConcept, frontmatter: Frontmatter): Finding[] {
  return RECOMMENDED_KEYS.filter((key) => !isNonEmptyString(frontmatter[key])).map((key) =>
    findingOnLine(located, 1, "W1", {
      message: `the recommended "${key}" is missing, empty or not text`,
      fix: `Add ${key}: to the frontmatter`,
    }),
  );
}

// W3: v0.2 replaced timestamp with generated.at (§13.1).
function checkDeprecatedKeys(located: LocatedConcept, frontmatter: Frontmatter): Finding[] {
  if (frontmatter["timestamp"] === undefined) return [];
  return [
    findingAtKey(located, ["timestamp"], "W3", {
      message: '"timestamp" is deprecated since OKF v0.2',
      fix: "Replace it with generated: { by: <actor>, at: <the same date and time> }",
    }),
  ];
}

// Plain < comparison, not localeCompare: the order must not depend on the machine's locale.
function byFileThenLine(a: Finding, b: Finding): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return a.line - b.line;
}
