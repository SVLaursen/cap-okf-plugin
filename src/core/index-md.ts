// index.md generation (OKF v0.2 §8). Pure module: concepts in, index concepts out.
//
// The layout follows the official sample bundles: one "# <type>" section per concept type,
// then "# Subdirectories". Entries are "* [title](path) - description".
import type { Concept } from "./concept";
import { isNonEmptyString } from "./values";

export interface IndexOptions {
  /** Written as okf_version in the bundle-root index.md only (§12), e.g. "0.2". */
  okfVersion?: string;
}

/** The section for concepts without a type. Comes after all typed sections. */
const UNTYPED_SECTION = "Other";

const RESERVED_FILE_NAMES = ["index.md", "log.md"];

/** A concept as one index entry needs it. */
interface Entry {
  /** Path relative to the folder of the index, e.g. "Books.md" or "admin/Orders.md". */
  relativePath: string;
  type: string;
  title: string;
  description: string | undefined;
}

/**
 * The index.md for one folder ("" is the bundle root), listing the concepts directly in it and
 * the subfolders below it. `concepts` may hold the whole bundle; the rest is ignored.
 */
export function generateIndex(
  folder: string,
  concepts: readonly Concept[],
  options: IndexOptions = {},
): Concept {
  const entries = entriesBelow(folder, concepts);
  const sections = [...typeSections(entries), ...subfolderSection(entries)];
  const path = folder === "" ? "index.md" : `${folder}/index.md`;
  const okfVersion = folder === "" ? options.okfVersion : undefined;
  return {
    path,
    id: path.replace(/\.md$/, ""),
    frontmatter: okfVersion === undefined ? null : { okf_version: okfVersion },
    body: sections.map((section) => section + "\n").join("\n"),
  };
}

/**
 * The index.md for `folder` and for every folder below it that holds concepts, sorted by path.
 * Only the bundle-root index gets `options.okfVersion`.
 */
export function generateIndexes(
  concepts: readonly Concept[],
  folder: string,
  options: IndexOptions = {},
): Concept[] {
  const folders = new Set([folder]);
  for (const { relativePath } of entriesBelow(folder, concepts)) {
    const segments = relativePath.split("/").slice(0, -1);
    segments.forEach((_, index) => folders.add(joinPath(folder, segments.slice(0, index + 1))));
  }
  return [...folders]
    .map((indexFolder) => generateIndex(indexFolder, concepts, options))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

function entriesBelow(folder: string, concepts: readonly Concept[]): Entry[] {
  const prefix = folder === "" ? "" : `${folder}/`;
  return concepts
    .filter((concept) => concept.path.startsWith(prefix) && !isReserved(concept.path))
    .map((concept) => toEntry(concept, concept.path.slice(prefix.length)))
    .sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
}

function isReserved(path: string): boolean {
  return RESERVED_FILE_NAMES.includes(path.slice(path.lastIndexOf("/") + 1));
}

function toEntry(concept: Concept, relativePath: string): Entry {
  const frontmatter = concept.frontmatter ?? {};
  const { type, title, description } = frontmatter;
  return {
    relativePath,
    type: isNonEmptyString(type) ? type : UNTYPED_SECTION,
    // §4.1: without a title, consumers may derive one from the file name.
    title: isNonEmptyString(title) ? title : fileTitle(relativePath),
    description: isNonEmptyString(description) ? oneLine(description) : undefined,
  };
}

// "# Entity" with the entries directly in the folder, one section per type.
function typeSections(entries: readonly Entry[]): string[] {
  const direct = entries.filter((entry) => !entry.relativePath.includes("/"));
  return sectionTypes(direct).map((type) => {
    const lines = direct
      .filter((entry) => entry.type === type)
      .map((entry) => entryLine(entry.title, entry.relativePath, entry.description));
    return [`# ${type}`, "", ...lines].join("\n");
  });
}

// Types sorted by name, with the untyped section last.
function sectionTypes(entries: readonly Entry[]): string[] {
  const types = [...new Set(entries.map((entry) => entry.type))];
  const typed = types.filter((type) => type !== UNTYPED_SECTION).sort();
  return types.includes(UNTYPED_SECTION) ? [...typed, UNTYPED_SECTION] : typed;
}

// "# Subdirectories" with one entry per subfolder, describing what is below it.
function subfolderSection(entries: readonly Entry[]): string[] {
  const bySubfolder = new Map<string, Entry[]>();
  for (const entry of entries) {
    const slash = entry.relativePath.indexOf("/");
    if (slash === -1) continue;
    const subfolder = entry.relativePath.slice(0, slash);
    bySubfolder.set(subfolder, [...(bySubfolder.get(subfolder) ?? []), entry]);
  }
  if (bySubfolder.size === 0) return [];
  // Every key comes from the map itself, so get() always finds its entries.
  const lines = [...bySubfolder.keys()]
    .sort()
    .map((subfolder) =>
      entryLine(subfolder, `${subfolder}/index.md`, contentsSummary(bySubfolder.get(subfolder)!)),
    );
  return [["# Subdirectories", "", ...lines].join("\n")];
}

// "3 concepts: Entity, Service": deterministic, and tells a reader what is inside.
function contentsSummary(entries: readonly Entry[]): string {
  const count = entries.length === 1 ? "1 concept" : `${entries.length} concepts`;
  return `${count}: ${sectionTypes(entries).join(", ")}`;
}

function entryLine(title: string, relativePath: string, description: string | undefined): string {
  const link = `* [${escapeLinkText(title)}](${encodePath(relativePath)})`;
  return description === undefined ? link : `${link} - ${description}`;
}

// A \, [ or ] in the text would end or break the link; a backslash escapes each.
function escapeLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, (character) => `\\${character}`);
}

// ADR-0007: links encode each path segment once more, so "a%3Ab" is linked as "a%253Ab".
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function fileTitle(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf("/") + 1).replace(/\.md$/, "");
}

function joinPath(folder: string, segments: readonly string[]): string {
  return [folder, ...segments].filter((segment) => segment !== "").join("/");
}
