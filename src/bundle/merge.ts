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
// - A curated Markdown file whose authorization markers are broken (L3, task 4.11) is left out,
//   so it is never served half cut; markers written slightly wrong are warnings (L4).
import { parseConcept, serializeConcept, type Concept } from "../core/concept";
import { authMarkerFindings } from "../core/auth-markers";
import { findingAt, type Finding } from "../core/finding";
import { compareText, generateIndex } from "../core/index-md";
import { extractLinks, resolveLink } from "../core/links";
import { MODEL_FOLDER } from "../export/paths";
import { fold, pathPrefixes } from "./paths";

/** OKF's reserved file names (spec §3.1); a curated index.md is a folder's own index. */
const RESERVED_FILE_NAMES = ["index.md", "log.md"];

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
  /**
   * Layout and marker problems (L1–L4), sorted by file. Files with an L1 or L3 error are left
   * out.
   */
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
  const allConcepts = [...generatedFiles, ...parsedConcepts(kept)];
  const ownIndexes = new Set(kept.map((file) => file.path));
  const missingIndexes = listedFolders(kept).filter((folder) => !ownIndexes.has(indexOf(folder)));

  const files: MergedFile[] = [
    ...generatedFiles.map((concept) => ({ path: concept.path, text: serializeConcept(concept) })),
    ...kept.map(asMergedFile),
    ...missingIndexes.map((folder) => asFile(generateIndex(folder, allConcepts))),
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

/** What a path names in the bundle: a file, or a folder files are in. */
type Kind = "file" | "folder";

/** Folded spelling → the spelling first seen and what it names. */
type TakenPaths = Map<string, { spelling: string; kind: Kind }>;

/**
 * The curated files that may go into the bundle, in path order; an L1 finding for each one left
 * out. Generated paths, and the index.md files that will be generated, always win a clash;
 * among curated files the first in path order wins.
 */
function keptCuratedFiles(
  curated: readonly CuratedFile[],
  generated: readonly Concept[],
  findings: Finding[],
): CuratedFile[] {
  const taken: TakenPaths = new Map();
  for (const concept of generated) remember(concept.path, taken);
  // The index.md files the merge will generate: the root's, and each curated folder's that has
  // none of its own. Reserved first, so no curated file or folder can take their place.
  const curatedPaths = new Set(curated.map((file) => file.path));
  for (const folder of ["", ...listedFolders(curated)]) {
    if (!curatedPaths.has(indexOf(folder))) remember(indexOf(folder), taken);
  }

  const kept: CuratedFile[] = [];
  for (const file of [...curated].sort((a, b) => compareText(a.path, b.path))) {
    const problem = layoutProblem(file.path, taken);
    if (problem !== undefined) {
      findings.push(problem);
      continue;
    }
    const markerFindings = file.path.endsWith(".md")
      ? authMarkerFindings(file.path, file.text)
      : [];
    findings.push(...markerFindings);
    if (markerFindings.some((finding) => finding.severity === "error")) continue;
    remember(file.path, taken);
    kept.push(file);
  }
  return kept;
}

// Why a curated file can't go into the bundle (an L1 finding), or undefined when it can.
function layoutProblem(path: string, taken: TakenPaths): Finding | undefined {
  const firstSegment = path.split("/")[0]!;
  if (fold(firstSegment) === fold(MODEL_FOLDER)) return inModelFolder(path, firstSegment);
  const name = path.slice(path.lastIndexOf("/") + 1);
  const reserved = RESERVED_FILE_NAMES.find((each) => fold(name) === each && name !== each);
  if (reserved !== undefined) return reservedNameSpelling(path, reserved);
  const clash = clashWith(path, taken);
  return clash === undefined ? undefined : pathClash(path, clash);
}

/** The earlier path that `path`, or a folder on its way, would be the same file or folder as. */
function clashWith(path: string, taken: TakenPaths): string | undefined {
  const prefixes = pathPrefixes(path);
  for (const [index, prefix] of prefixes.entries()) {
    const kind: Kind = index === prefixes.length - 1 ? "file" : "folder";
    const earlier = taken.get(fold(prefix));
    if (earlier === undefined) continue;
    // Spelt differently (case or Unicode form), or a file where a folder is, or the same file.
    if (earlier.spelling !== prefix || earlier.kind !== kind || kind === "file") {
      return earlier.spelling;
    }
  }
  return undefined;
}

function remember(path: string, taken: TakenPaths): void {
  const prefixes = pathPrefixes(path);
  for (const [index, prefix] of prefixes.entries()) {
    const kind: Kind = index === prefixes.length - 1 ? "file" : "folder";
    if (!taken.has(fold(prefix))) taken.set(fold(prefix), { spelling: prefix, kind });
  }
}

/**
 * The curated folders, at any depth, that hold a concept an index lists (a Markdown file other
 * than index.md and log.md) somewhere below them. Each gets an index.md; other folders don't,
 * and no index links to them.
 */
function listedFolders(curated: readonly CuratedFile[]): string[] {
  const folders = new Set<string>();
  for (const file of curated) {
    const name = file.path.slice(file.path.lastIndexOf("/") + 1);
    if (!name.endsWith(".md") || RESERVED_FILE_NAMES.includes(fold(name))) continue;
    for (const folder of pathPrefixes(file.path).slice(0, -1)) folders.add(folder);
  }
  return [...folders].sort(compareText);
}

// "guides" → "guides/index.md"; "" (the bundle root) → "index.md".
function indexOf(folder: string): string {
  return folder === "" ? "index.md" : `${folder}/index.md`;
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

// Whether the curated root index links to model/ or model/index.md, in any form §6.1 allows.
// The line numbers don't matter here, so links are read as if the body started on line 1.
function linksToModel(text: string): boolean {
  let body = text;
  try {
    body = parseConcept("index.md", text).body;
  } catch {
    // An index without valid frontmatter: read the whole text.
  }
  return extractLinks(body, 1).some((link) => {
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

function inModelFolder(path: string, folder: string): Finding {
  return findingAt(path, 1, "L1", {
    message: `${MODEL_FOLDER}/ belongs to the generator; a curated file can't be there`,
    fix: `Move it out of okf/${folder}/, e.g. to okf/notes/${path.slice(folder.length + 1)}`,
  });
}

function reservedNameSpelling(path: string, reserved: string): Finding {
  return findingAt(path, 1, "L1", {
    message: `OKF reserves the file name ${reserved} in lower case, and this spelling would clash with it`,
    fix: `Rename it to ${reserved}, or to a name that isn't reserved`,
  });
}

function pathClash(path: string, earlier: string): Finding {
  return findingAt(path, 1, "L1", {
    message: `its path is the same file or folder as ${earlier} (letter case and Unicode form aside)`,
    fix: "Rename the file or folder so that every path in okf/ and model/ is distinct",
  });
}

function missingModelLink(): Finding {
  return findingAt("index.md", 1, "L2", {
    message: `the bundle's root index doesn't link to ${MODEL_FOLDER}/, the generated concepts`,
    fix: `Add an entry such as * [Model](${MODEL_FOLDER}/index.md) - Generated from the CDS model`,
  });
}
