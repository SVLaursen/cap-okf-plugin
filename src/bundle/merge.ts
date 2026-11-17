// Merging the curated okf/ folder with the generated model/ (task 3.1, ADR-0007: "What the bundle
// contains" and "Index files"). Pure: files in, files and findings out.
//
// - Curated files keep their path relative to okf/; generated concepts live under model/.
// - model/ belongs to the generator: a curated file there is an error (L1) and left out.
// - A curated path that differs from another path only in letter case or Unicode form is an
//   error (L1) and left out: macOS and Windows would store the two as one file.
// - The bundle-root index.md is the curated okf/index.md if there is one (a warning, L2, when it
//   doesn't link to model/); otherwise a generated one with okf_version, listing model/ and the
//   curated concepts and folders.
// - A curated folder without its own index.md gets a generated one, so every folder the root
//   index links to has an index.
// - log.md and files that aren't Markdown are kept as they are and never listed.
import { parseConcept, serializeConcept, type Concept } from "../core/concept";
import { findingAt, type Finding } from "../core/finding";
import { compareText, generateIndex } from "../core/index-md";
import { extractLinks, resolveLink } from "../core/links";
import { MODEL_FOLDER } from "../export/paths";

/** One file from the curated okf/ folder, at its bundle path. */
export interface CuratedFile {
  /** Bundle path, relative to okf/, e.g. "guides/ordering.md". */
  path: string;
  /** The text of a Markdown file; for other files whatever the caller can show (may be ""). */
  text: string;
  /** The exact bytes of a file that isn't Markdown, to be written as they are. */
  bytes?: Uint8Array;
}

/** One file of the merged bundle. */
export interface MergedFile {
  path: string;
  text: string;
  /** Present for curated files that aren't Markdown: write these bytes, not `text`. */
  bytes?: Uint8Array;
}

export interface MergedBundle {
  /** Every file of the bundle, sorted by path. */
  files: MergedFile[];
  /** Layout problems (L1, L2), sorted by file. Files with an L1 error are left out. */
  findings: Finding[];
  /** The bundle paths that came from okf/, so messages can name okf/<path>. */
  curatedPaths: ReadonlySet<string>;
}

/**
 * The bundle made of `generated` (exportModel's output, its root index.md included) and the
 * `curated` files. `okfVersion` goes into a generated root index.md.
 */
export function mergeBundle(
  generated: readonly Concept[],
  curated: readonly CuratedFile[],
  okfVersion: string,
): MergedBundle {
  const findings: Finding[] = [];
  const generatedFiles = generated.filter((concept) => concept.path !== "index.md");
  const kept = keptCuratedFiles(curated, generatedFiles, findings);
  const curatedConcepts = parsedConcepts(kept);
  const allConcepts = [...generatedFiles, ...curatedConcepts];

  const files: MergedFile[] = [
    ...generatedFiles.map((concept) => ({ path: concept.path, text: serializeConcept(concept) })),
    ...kept.map(asMergedFile),
    ...curatedFolderIndexes(kept, allConcepts),
  ];
  const curatedRoot = kept.find((file) => file.path === "index.md");
  if (curatedRoot === undefined) {
    files.push(asFile(generateIndex("", allConcepts, { okfVersion })));
  } else if (!linksToModel(curatedRoot.text)) {
    findings.push(missingModelLink());
  }

  return {
    files: files.sort((a, b) => compareText(a.path, b.path)),
    findings: findings.sort((a, b) => compareText(a.file, b.file)),
    curatedPaths: new Set(kept.map((file) => file.path)),
  };
}

/**
 * The curated files that may go into the bundle, in path order; an L1 finding for each one left
 * out. Generated paths always win a clash, and among curated files the first in path order.
 */
function keptCuratedFiles(
  curated: readonly CuratedFile[],
  generated: readonly Concept[],
  findings: Finding[],
): CuratedFile[] {
  const taken = new Map<string, string>();
  for (const concept of generated) rememberPathAndFolders(concept.path, taken);
  // The generated root index.md, unless okf/ has its own: reserved before the curated files.
  if (!curated.some((file) => file.path === "index.md")) rememberPathAndFolders("index.md", taken);

  const kept: CuratedFile[] = [];
  for (const file of [...curated].sort((a, b) => compareText(a.path, b.path))) {
    if (fold(firstSegment(file.path)) === fold(MODEL_FOLDER)) {
      findings.push(inModelFolder(file.path));
    } else if (clashingSpelling(file.path, taken) !== undefined) {
      findings.push(caseClash(file.path, clashingSpelling(file.path, taken)!));
    } else {
      rememberPathAndFolders(file.path, taken);
      kept.push(file);
    }
  }
  return kept;
}

/** The earlier spelling that `path` or one of its folders clashes with, if any. */
function clashingSpelling(path: string, taken: ReadonlyMap<string, string>): string | undefined {
  for (const prefix of pathAndFolders(path)) {
    const earlier = taken.get(fold(prefix));
    if (earlier !== undefined && earlier !== prefix) return earlier;
  }
  return undefined;
}

function rememberPathAndFolders(path: string, taken: Map<string, string>): void {
  for (const prefix of pathAndFolders(path)) {
    if (!taken.has(fold(prefix))) taken.set(fold(prefix), prefix);
  }
}

// The curated Markdown files that parse, for the index entries. A file that doesn't parse is
// still in the bundle; the validator reports it (R1).
function parsedConcepts(files: readonly CuratedFile[]): Concept[] {
  const concepts: Concept[] = [];
  for (const file of files.filter((each) => each.path.endsWith(".md"))) {
    try {
      concepts.push(parseConcept(file.path, file.text));
    } catch {
      // Left to the validator.
    }
  }
  return concepts;
}

/** A generated index.md for each curated folder (at any depth) that has no index.md of its own. */
function curatedFolderIndexes(
  curated: readonly CuratedFile[],
  concepts: readonly Concept[],
): MergedFile[] {
  const own = new Set(curated.map((file) => file.path));
  const folders = new Set<string>();
  for (const file of curated.filter((each) => each.path.endsWith(".md"))) {
    for (const folder of pathAndFolders(file.path).slice(0, -1)) folders.add(folder);
  }
  return [...folders]
    .filter((folder) => !own.has(`${folder}/index.md`))
    .map((folder) => asFile(generateIndex(folder, concepts)));
}

// Whether the curated root index links to model/ or model/index.md, in any form §6.1 allows.
function linksToModel(text: string): boolean {
  let body: string;
  let firstLine: number;
  try {
    const parsed = parseConcept("index.md", text);
    body = parsed.body;
    firstLine = text.split("\n").length - body.split("\n").length + 1;
  } catch {
    body = text;
    firstLine = 1;
  }
  return extractLinks(body, firstLine).some((link) => {
    const resolved = resolveLink("index.md", link.target);
    return (
      resolved.kind === "bundle" &&
      (resolved.path === MODEL_FOLDER || resolved.path === `${MODEL_FOLDER}/index.md`)
    );
  });
}

function asMergedFile(file: CuratedFile): MergedFile {
  return file.bytes === undefined
    ? { path: file.path, text: file.text }
    : { path: file.path, text: file.text, bytes: file.bytes };
}

function asFile(concept: Concept): MergedFile {
  return { path: concept.path, text: serializeConcept(concept) };
}

function inModelFolder(path: string): Finding {
  return findingAt(path, 1, "L1", {
    message: `${MODEL_FOLDER}/ belongs to the generator; a curated file can't be there`,
    fix: `Move it out of okf/${MODEL_FOLDER}/, e.g. to okf/notes/${path.slice(path.indexOf("/") + 1)}`,
  });
}

function caseClash(path: string, earlier: string): Finding {
  return findingAt(path, 1, "L1", {
    message: `its path differs from ${earlier} only in letter case or Unicode form`,
    fix: "Rename the file or folder so that no two paths differ only in letter case",
  });
}

function missingModelLink(): Finding {
  return findingAt("index.md", 1, "L2", {
    message: `the bundle's root index doesn't link to ${MODEL_FOLDER}/, the generated concepts`,
    fix: `Add an entry such as * [Model](${MODEL_FOLDER}/index.md) - Generated from the CDS model`,
  });
}

function firstSegment(path: string): string {
  return path.split("/")[0]!;
}

// "a/b/c.md" → ["a", "a/b", "a/b/c.md"].
function pathAndFolders(path: string): string[] {
  const segments = path.split("/");
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function fold(path: string): string {
  return path.normalize("NFC").toLowerCase();
}
