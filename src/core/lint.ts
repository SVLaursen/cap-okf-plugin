// The knowledge lint (ADR-0012): hints that make a bundle more useful to agents. Warnings only,
// never errors. Pure: the bundle's files in, findings out. A curated note is any concept outside
// model/; a generated concept is one in model/.
//
// - K1 a curated note has no tags;
// - K2 a curated note links to no generated concept, so nothing in the model points back at it
//   (no "Business knowledge" entry, no tool note);
// - K3 an entity has elements that look like codes (a short string, a list of values, or a name
//   ending in type, status, code or kind), and no curated note links to the entity, so nothing
//   says what the values mean;
// - K4 a pinned note has no description, so the server instructions list it by title only.
// lintBundle adds what the validator already reports, so it can be used on its own: W1 (a
// curated note without description) and W4 (a broken link).
import { parseConceptLocated, type LocatedConcept } from "./concept";
import { findingAt, findingOnLine, type Finding } from "./finding";
import { extractLinks, resolveLink } from "./links";
import { validateBundle, type BundleFile } from "./validate";
import { isNonEmptyString } from "./values";

const MODEL_PREFIX = "model/";
const RESERVED_NAMES = ["index.md", "log.md"];
const ENTITY_TYPES = ["Entity", "Projection", "View"];
const CODE_NAME = /(type|status|code|kind)$/i;
const SHORT_STRING = /^`String\((\d+)\)`$/;
const MAX_CODE_LENGTH = 10;
// | `status` | `String(1)` | values: … |
const CELL_SEPARATOR = /(?<!\\)\|/;

/** Everything the lint reports: the knowledge rules plus the validator's W1 and W4. */
export function lintBundle(files: readonly BundleFile[]): Finding[] {
  const validator = validateBundle(files).filter(
    (finding) => finding.rule === "W4" || (finding.rule === "W1" && isCurated(finding.file)),
  );
  return [...validator, ...lintKnowledge(files)].sort(
    (a, b) => compare(a.file, b.file) || a.line - b.line,
  );
}

/** Only the knowledge rules (K1–K4), which the validator doesn't check. */
export function lintKnowledge(files: readonly BundleFile[]): Finding[] {
  const concepts = parsedConcepts(files);
  const curated = concepts.filter((each) => isCurated(each.concept.path));
  const linkedFromNotes = new Set(curated.flatMap(linkedPaths));
  return [
    ...curated.flatMap(noteFindings),
    ...concepts
      .filter((each) => isEntity(each) && !linkedFromNotes.has(each.concept.path))
      .flatMap(codeFieldFindings),
  ];
}

function noteFindings(note: LocatedConcept): Finding[] {
  const findings: Finding[] = [];
  const tags = note.concept.frontmatter?.["tags"];
  const hasTags = Array.isArray(tags) ? tags.some(isNonEmptyString) : isNonEmptyString(tags);
  if (!hasTags) {
    findings.push(
      findingOnLine(note, note.lineOf(["tags"]), "K1", {
        message: "this note has no tags, so searchConcepts can only find it by its words",
        fix: "Add tags: […] with the business terms people use for it",
      }),
    );
  }
  if (!linkedPaths(note).some((path) => path.startsWith(MODEL_PREFIX))) {
    findings.push(
      findingAt(note.concept.path, note.bodyLine, "K2", {
        message:
          "this note links to no generated concept, so no entity, action or tool points to it",
        fix: "Link the entities, elements' entities or actions it explains, e.g. [Orders](/model/MyService/Orders.md)",
      }),
    );
  }
  if (
    note.concept.frontmatter?.["pinned"] === true &&
    !isNonEmptyString(note.concept.frontmatter["description"])
  ) {
    findings.push(
      findingOnLine(note, note.lineOf(["pinned"]), "K4", {
        message:
          "this note is pinned but has no description, so the server instructions list it by its title only",
        fix: "Add description: with one sentence that says what every agent must know from it",
      }),
    );
  }
  return findings;
}

function codeFieldFindings(entity: LocatedConcept): Finding[] {
  const lines = entity.concept.body.split("\n");
  const codes: { name: string; line: number }[] = [];
  lines.forEach((text, index) => {
    const row = elementRow(text);
    if (row !== undefined && looksLikeCode(row.name, row.type, row.notes)) {
      codes.push({ name: row.name, line: entity.bodyLine + index });
    }
  });
  if (codes.length === 0) return [];
  const names = codes.map((code) => code.name).join(", ");
  return [
    findingAt(entity.concept.path, codes[0]!.line, "K3", {
      message: `${names} ${codes.length === 1 ? "looks like a code field" : "look like code fields"}, and no curated note links to this entity to say what the values mean`,
      fix: `Write a note in okf/ that explains the values and links to /${entity.concept.path}`,
    }),
  ];
}

// "| `status` | `String(1)` | key; values: … |" → its cells; undefined for any other line.
// Cells are split at pipes that aren't escaped (a description may hold "\|").
function elementRow(line: string): { name: string; type: string; notes: string } | undefined {
  if (!line.startsWith("| `") || !line.endsWith("|")) return undefined;
  const cells = line
    .slice(1, -1)
    .split(CELL_SEPARATOR)
    .map((cell) => cell.trim());
  const name = /^`([^`]+)`$/.exec(cells[0] ?? "")?.[1];
  if (cells.length !== 3 || name === undefined) return undefined;
  return { name, type: cells[1]!, notes: cells[2]! };
}

// The notes cell is "; "-separated; only its own "values: …" part counts, not a description
// that happens to say "values:".
function looksLikeCode(name: string, type: string, notes: string): boolean {
  const hasValues = notes.split("; ").some((note) => note.startsWith("values: "));
  if (CODE_NAME.test(name) || hasValues) return true;
  const short = SHORT_STRING.exec(type);
  return short !== null && Number(short[1]) <= MAX_CODE_LENGTH;
}

// The bundle paths a concept links to.
function linkedPaths(located: LocatedConcept): string[] {
  const { path, body } = located.concept;
  return extractLinks(body, 1).flatMap((link) => {
    const resolved = resolveLink(path, link.target);
    return resolved.kind === "bundle" ? [resolved.path] : [];
  });
}

function isEntity(located: LocatedConcept): boolean {
  const type = located.concept.frontmatter?.["type"];
  return !isCurated(located.concept.path) && ENTITY_TYPES.includes(type as string);
}

function isCurated(path: string): boolean {
  return !path.startsWith(MODEL_PREFIX);
}

// The concepts that parse and have frontmatter; index.md and log.md aren't concepts.
function parsedConcepts(files: readonly BundleFile[]): LocatedConcept[] {
  const concepts: LocatedConcept[] = [];
  for (const file of files) {
    const name = file.path.slice(file.path.lastIndexOf("/") + 1);
    if (!name.endsWith(".md") || RESERVED_NAMES.includes(name)) continue;
    try {
      const located = parseConceptLocated(file.path, file.text);
      if (located.concept.frontmatter !== null) concepts.push(located);
    } catch {
      // The validator reports it (R1).
    }
  }
  return concepts;
}

function compare(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
