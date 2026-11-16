// OKF concept files: Markdown with optional YAML frontmatter (OKF v0.2 §4).
// Pure module: text in, values out. No file system, no clock, no CAP.
import YAML from "yaml";

/** Frontmatter keys and values as written; unknown keys are kept (OKF v0.2 §4.1). */
export type Frontmatter = Record<string, unknown>;

/** One OKF file, split into its parts. */
export interface Concept {
  /** Bundle-relative path, e.g. "guides/ordering.md". */
  path: string;
  /** The concept ID: the path without its .md suffix (OKF v0.2 §2). */
  id: string;
  /** Null when the file has none; reserved files (index.md, log.md) may legitimately lack it. */
  frontmatter: Frontmatter | null;
  /** Everything after the frontmatter. */
  body: string;
}

const DELIMITER = "---";
// Written as a char code, not a literal: the character itself is invisible in editors.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/**
 * A file that breaks conformance rule R1 (frontmatter must be valid YAML).
 * Carries the same fields as a validation finding, so callers can report both the same way.
 */
export class ConceptParseError extends Error {
  readonly file: string;
  readonly line: number;
  readonly rule = "R1";
  readonly severity = "error";
  readonly fix: string;

  constructor(details: { file: string; line: number; message: string; fix: string }) {
    super(details.message);
    this.name = "ConceptParseError";
    this.file = details.file;
    this.line = details.line;
    this.fix = details.fix;
  }
}

/**
 * Splits an OKF file into its parts.
 *
 * Known limit: frontmatter is a plain JS object, and JS lists integer-like keys ("1", "2")
 * before all other keys. Such keys don't keep their written order.
 */
export function parseConcept(path: string, text: string): Concept {
  const lines = normalize(text).split("\n");
  const id = conceptId(path);
  const closingLine = findClosingDelimiter(path, lines);
  if (closingLine === undefined) {
    return { path, id, frontmatter: null, body: lines.join("\n") };
  }
  // The trailing "\n" ends the last YAML line. Without it, a "|+" block value at the end would
  // lose one of the newlines it keeps.
  const yamlText = lines.slice(1, closingLine).join("\n") + "\n";
  return {
    path,
    id,
    frontmatter: parseFrontmatter(path, yamlText),
    body: lines.slice(closingLine + 1).join("\n"),
  };
}

/**
 * Frontmatter keys that cap-okf writes first, in this order. The first five are the fields
 * OKF v0.2 §4.1 lists; the full order is cap-okf's choice (docs/PLAN.md, task 1.2).
 * A fixed order keeps generated bundles stable, so a regenerated file only diffs where it changed.
 */
const KNOWN_KEY_ORDER: readonly string[] = [
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
];

/**
 * Writes a concept back to OKF text.
 *
 * Known keys come first in KNOWN_KEY_ORDER, then the other keys in their original order.
 * Keys whose value is undefined are left out. The output always ends with exactly one newline.
 *
 * `parseConcept(path, serializeConcept(c))` equals `c` when the body ends with exactly one
 * newline and the frontmatter holds only JSON-like values (a Date, for example, comes back
 * as a string). Every concept that parseConcept returns for a file ending in one newline
 * meets this.
 */
export function serializeConcept(concept: Concept): string {
  if (concept.frontmatter === null) {
    rejectDelimiterAtStart(concept);
    return endWithOneNewline(concept.body);
  }
  return endWithOneNewline(frontmatterBlock(concept.frontmatter) + concept.body);
}

// Without frontmatter, a first line of --- would be read back as the start of frontmatter.
function rejectDelimiterAtStart(concept: Concept): void {
  const firstLine = concept.body.split("\n")[0];
  if (isDelimiter(firstLine)) {
    throw new Error(
      `[okf] ${concept.path}:1 — the body starts with a --- line, which would be read back as frontmatter.\n` +
        "  Give the concept frontmatter, or start the body with another line.",
    );
  }
}

function frontmatterBlock(frontmatter: Frontmatter): string {
  const ordered = orderKeys(frontmatter);
  // YAML.stringify writes an empty object as "{}"; an empty block is just the two delimiters.
  const yamlText = Object.keys(ordered).length === 0 ? "" : stringifyYaml(ordered);
  return `${DELIMITER}\n${yamlText}${DELIMITER}\n`;
}

function orderKeys(frontmatter: Frontmatter): Frontmatter {
  // YAML can't write undefined, so such keys are dropped here rather than by the yaml library.
  const defined = Object.keys(frontmatter).filter((key) => frontmatter[key] !== undefined);
  const known = KNOWN_KEY_ORDER.filter((key) => defined.includes(key));
  const unknown = defined.filter((key) => !KNOWN_KEY_ORDER.includes(key));
  // Object.fromEntries, not ordered[key] = …: an assignment to "__proto__" would change the
  // object's prototype instead of keeping the key, and unknown keys must be kept (OKF v0.2 §4.1).
  return Object.fromEntries([...known, ...unknown].map((key) => [key, frontmatter[key]]));
}

function stringifyYaml(value: Frontmatter): string {
  return YAML.stringify(value, {
    // Never fold long values over several lines, so the output does not depend on an
    // arbitrary line width and long descriptions stay greppable.
    lineWidth: 0,
    // An object used twice is written out twice: anchors and aliases (&a1, *a1) are valid YAML
    // but hard to read in a generated bundle.
    aliasDuplicateObjects: false,
  });
}

function endWithOneNewline(text: string): string {
  return text.replace(/\n*$/, "\n");
}

// Line numbers and comparisons below assume LF only and no byte order mark.
function normalize(text: string): string {
  const withoutBom = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  return withoutBom.replace(/\r\n/g, "\n");
}

function conceptId(path: string): string {
  return path.replace(/\.md$/, "");
}

// Trailing spaces after --- are invisible in editors, so they don't make a line "not a delimiter".
function isDelimiter(line: string | undefined): boolean {
  return line?.trimEnd() === DELIMITER;
}

/** Index of the closing `---`, or undefined when the file has no frontmatter. */
function findClosingDelimiter(path: string, lines: string[]): number | undefined {
  if (!isDelimiter(lines[0])) return undefined;
  const closing = lines.findIndex((line, index) => index > 0 && isDelimiter(line));
  if (closing === -1) {
    throw new ConceptParseError({
      file: path,
      line: 1,
      message: "frontmatter is not closed: the opening --- has no matching --- line",
      fix: "Add a line with only --- after the last frontmatter key",
    });
  }
  return closing;
}

function parseFrontmatter(path: string, yamlText: string): Frontmatter {
  const lineCounter = new YAML.LineCounter();
  // logLevel 'error': yaml would otherwise print warnings (e.g. for an unknown !tag) to stderr,
  // and src/core must not have side effects. Such values are kept as plain strings.
  const document = YAML.parseDocument(yamlText, { lineCounter, logLevel: "error" });
  // An error at the very end of the text (such as an unclosed list) would point after the final
  // newline, i.e. at the closing ---. Clamping keeps it on the last frontmatter line.
  const lastCharacter = Math.max(yamlText.length - 1, 0);
  const fileLine = (offset: number) =>
    lineCounter.linePos(Math.min(offset, lastCharacter)).line + 1; // +1: the opening ---

  const firstError = document.errors[0];
  if (firstError) throw yamlError(path, firstError, fileLine);

  const value: unknown = document.toJS();
  // An empty block (--- directly followed by ---) is valid and has no keys.
  if (value === null) return {};
  if (!isPlainObject(value)) {
    throw new ConceptParseError({
      file: path,
      // contents is null only for an empty block, which returned above.
      line: fileLine(document.contents!.range[0]),
      message: "frontmatter is not a YAML mapping of keys to values",
      fix: 'Write the frontmatter as "key: value" lines, starting with "type: <Type name>"',
    });
  }
  return value;
}

// Lists, plain values and special types such as !!binary are not frontmatter.
function isPlainObject(value: unknown): value is Frontmatter {
  return typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function yamlError(
  path: string,
  error: YAML.YAMLError,
  fileLine: (offset: number) => number,
): ConceptParseError {
  // yaml's message continues with " at line N, column M:" and a code excerpt; keep the reason.
  const reason = error.message.replace(/ at line \d+, column \d+:[\s\S]*$/, "");
  return new ConceptParseError({
    file: path,
    line: fileLine(error.pos[0]),
    message: `frontmatter is not valid YAML: ${reason}`,
    fix: 'Correct the YAML between the two --- lines; quote values that contain ": " or start with [, {, * or #',
  });
}
