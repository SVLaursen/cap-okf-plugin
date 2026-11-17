// What one reader sees of a bundle (ADR-0003, amended by ADR-0012). Every channel reads through
// a ReaderView, so the rules hold the same everywhere: the static route, the MCP resources and
// the MCP tools. Pure: the bundle's files and the reader in, the files as served out.
//
// - A concept whose frontmatter declares `requires:` exists only for readers who have one of
//   those roles. For everyone else it is not there at all: not listed, not readable, not linked,
//   not counted.
// - A generated index.md is built again from the concepts the reader sees, so its entries and
//   counts ("3 concepts") are theirs. A folder whose concepts are all hidden loses its index.
//   A curated index.md loses its entries for hidden concepts.
// - Every other file loses its links to hidden concepts (hidden-links.ts).
// - Authorization sections, and the `requires` key, reach authenticated readers only.
import { bundleIndex } from "../bundle/indexes";
import { parseConcept, serializeConcept, type Concept, type Frontmatter } from "../core/concept";
import { forReader } from "../core/filter";
import { withoutLinksTo } from "../core/hidden-links";
import { meetsRoles, requiresOf, withoutRequiresKey } from "../core/requires";
import { OKF_VERSION } from "../export/exporter";
import { MODEL_FOLDER } from "../export/paths";

/** Who is reading, as far as the rules need to know. */
export interface Reader {
  /** Authenticated by the app's own authentication: sees authorization sections. */
  isAuthenticated: boolean;
  /** CAP's user.is(role), pseudo-roles included. */
  is(role: string): boolean;
}

/** One file of the bundle as stored. */
export interface BundleFile {
  path: string;
  text: string;
}

/** A bundle read once and parsed, shared by all of its readers. */
export interface Snapshot {
  /** Every file, in path order. */
  files: ReadonlyMap<string, BundleFile>;
  /** The concepts that parse, with frontmatter (index.md and log.md aren't concepts). */
  concepts: ReadonlyMap<string, Concept>;
  /** The roles that any concept's `requires` names, sorted: what a reader's view depends on. */
  roles: readonly string[];
  /** The index.md files the bundle's own generator wrote, which can be built again per reader. */
  generatedIndexes: ReadonlySet<string>;
}

/** A visible concept as the reader gets it. */
export interface ViewConcept {
  path: string;
  frontmatter: Frontmatter;
  body: string;
  /** Written by people in okf/, not generated into model/. */
  curated: boolean;
}

/** The bundle as one reader sees it. */
export interface ReaderView {
  /** The files the reader may see, in path order. */
  readonly paths: readonly string[];
  /** A file as the reader gets it, or undefined when it doesn't exist for them. */
  read(path: string): string | undefined;
  /** The concepts the reader may see, as they get them, in path order. */
  readonly concepts: readonly ViewConcept[];
  /** One visible concept, or undefined. */
  concept(path: string): ViewConcept | undefined;
}

const RESERVED_NAMES = ["index.md", "log.md"];
const INDEX = "index.md";

/** Reads and parses the bundle's files once. */
export function snapshotOf(files: readonly BundleFile[]): Snapshot {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const byPath = new Map(sorted.map((file) => [file.path, file]));
  const concepts = new Map<string, Concept>();
  for (const file of sorted) {
    const concept = isConceptPath(file.path) ? parsed(file) : undefined;
    if (concept !== undefined) concepts.set(file.path, concept);
  }
  const roles = new Set<string>();
  for (const concept of concepts.values()) {
    for (const role of requiresOf(concept.frontmatter) ?? []) roles.add(role);
  }
  return {
    files: byPath,
    concepts,
    roles: [...roles].sort(),
    generatedIndexes: generatedIndexesOf(sorted, [...concepts.values()]),
  };
}

/** What a reader's view depends on, so readers with the same key can share one view. */
export function viewKey(snapshot: Snapshot, reader: Reader): string {
  const roles = snapshot.roles.map((role) => (reader.is(role) ? "1" : "0")).join("");
  return `${reader.isAuthenticated ? "a" : "p"}:${roles}`;
}

/** The bundle as `reader` sees it. */
export function readerView(snapshot: Snapshot, reader: Reader): ReaderView {
  const hidden = hiddenConcepts(snapshot, reader);
  const visibleConcepts = [...snapshot.concepts.values()].filter(
    (concept) => !hidden.has(concept.path),
  );
  const hiddenIndexes = emptiedIndexes(snapshot, hidden, visibleConcepts);
  const isHidden = (path: string) =>
    hidden.has(path) || hiddenIndexes.has(path) || hiddenIndexes.has(`${path}/${INDEX}`);
  const paths = [...snapshot.files.keys()].filter((path) => !isHidden(path));

  const texts = new Map<string, string>();
  for (const path of paths) {
    const file = snapshot.files.get(path)!;
    texts.set(path, servedText(snapshot, file, reader, hidden, visibleConcepts, isHidden));
  }
  const concepts: ViewConcept[] = [];
  for (const concept of visibleConcepts) {
    const served = parsed({ path: concept.path, text: texts.get(concept.path)! });
    if (served !== undefined) concepts.push(viewConcept(served));
  }
  const byPath = new Map(concepts.map((concept) => [concept.path, concept]));
  return {
    paths,
    read: (path) => texts.get(path),
    concepts,
    concept: (path) => byPath.get(path),
  };
}

function servedText(
  snapshot: Snapshot,
  file: BundleFile,
  reader: Reader,
  hidden: ReadonlySet<string>,
  visibleConcepts: readonly Concept[],
  isHidden: (path: string) => boolean,
): string {
  if (hidden.size > 0 && snapshot.generatedIndexes.has(file.path)) {
    return serializeConcept(bundleIndex(folderOf(file.path), visibleConcepts, OKF_VERSION));
  }
  let text = forReader(file.text, { isAuthenticated: reader.isAuthenticated });
  if (!reader.isAuthenticated) text = withoutRequiresKey(text);
  if (hidden.size > 0 && file.path.endsWith(".md")) {
    text = withoutLinksTo(file.path, text, isHidden);
  }
  return text;
}

// The concepts whose `requires` the reader doesn't meet.
function hiddenConcepts(snapshot: Snapshot, reader: Reader): Set<string> {
  const hidden = new Set<string>();
  for (const concept of snapshot.concepts.values()) {
    const roles = requiresOf(concept.frontmatter);
    if (roles !== undefined && !meetsRoles(roles, (role) => reader.is(role))) {
      hidden.add(concept.path);
    }
  }
  return hidden;
}

// The generated index.md of each folder that holds concepts, all of them hidden from the reader:
// its name alone would tell them the folder exists.
function emptiedIndexes(
  snapshot: Snapshot,
  hidden: ReadonlySet<string>,
  visible: readonly Concept[],
): Set<string> {
  const emptied = new Set<string>();
  if (hidden.size === 0) return emptied;
  for (const index of snapshot.generatedIndexes) {
    const folder = folderOf(index);
    if (folder === "") continue;
    const isBelow = (path: string) => path.startsWith(`${folder}/`);
    if ([...hidden].some(isBelow) && !visible.some((concept) => isBelow(concept.path))) {
      emptied.add(index);
    }
  }
  return emptied;
}

// An index.md counts as generated when it is exactly what the bundle's generator writes for its
// folder; anything else was written by hand and is only filtered, never rebuilt.
function generatedIndexesOf(
  files: readonly BundleFile[],
  concepts: readonly Concept[],
): Set<string> {
  const generated = new Set<string>();
  for (const file of files) {
    if (file.path !== INDEX && !file.path.endsWith(`/${INDEX}`)) continue;
    const expected = serializeConcept(bundleIndex(folderOf(file.path), concepts, OKF_VERSION));
    if (expected === file.text) generated.add(file.path);
  }
  return generated;
}

function viewConcept(concept: Concept): ViewConcept {
  return {
    path: concept.path,
    frontmatter: concept.frontmatter!,
    body: concept.body,
    curated: !concept.path.startsWith(`${MODEL_FOLDER}/`),
  };
}

// A concept that parses and has frontmatter, or undefined.
function parsed(file: BundleFile): Concept | undefined {
  try {
    const concept = parseConcept(file.path, file.text);
    return concept.frontmatter === null ? undefined : concept;
  } catch {
    return undefined;
  }
}

function isConceptPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.endsWith(".md") && !RESERVED_NAMES.includes(name);
}

// "model/index.md" → "model"; "index.md" → "".
function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}
