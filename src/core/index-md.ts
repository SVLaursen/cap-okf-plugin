// index.md generation (OKF v0.2 §8). Pure module: concepts in, index concepts out.
//
// The layout follows the official sample bundles: one "# <type>" section per concept type,
// then "# Subdirectories". Entries are "* [title](path) - description".
import type { Concept } from "./concept";
import { escapeHtml, escapeLinkText, oneLine } from "./markdown";
import { isNonEmptyString } from "./values";

export interface IndexOptions {
  /** Written as okf_version in the bundle-root index.md only (§12), e.g. "0.2". */
  okfVersion?: string;
}

/**
 * The section for concepts without a type. Comes after all typed sections. A concept whose
 * type is literally "Other" is listed in the same section.
 */
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
 * the subfolders below it. `concepts` may hold the whole bundle; the rest is ignored, and so
 * are files that are not Markdown.
 */
export function generateIndex(
  folder: string,
  concepts: readonly Concept[],
  options: IndexOptions = {},
): Concept {
  const cleanFolder = withoutOuterSlashes(folder);
  const entries = entriesBelow(cleanFolder, concepts);
  const sections = [...typeSections(entries), ...subfolderSection(entries)];
  const path = cleanFolder === "" ? "index.md" : `${cleanFolder}/index.md`;
  const okfVersion = cleanFolder === "" ? options.okfVersion : undefined;
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
  const cleanFolder = withoutOuterSlashes(folder);
  const folders = new Set([cleanFolder]);
  for (const { relativePath } of entriesBelow(cleanFolder, concepts)) {
    // "admin/audit/Log.md" below "model" adds "model/admin" and "model/admin/audit".
    let current = cleanFolder;
    for (const segment of relativePath.split("/").slice(0, -1)) {
      current = current === "" ? segment : `${current}/${segment}`;
      folders.add(current);
    }
  }
  return [...folders]
    .map((indexFolder) => generateIndex(indexFolder, concepts, options))
    .sort((a, b) => compareText(a.path, b.path));
}

function withoutOuterSlashes(folder: string): string {
  return folder.replace(/^\/+|\/+$/g, "");
}

function entriesBelow(folder: string, concepts: readonly Concept[]): Entry[] {
  const prefix = folder === "" ? "" : `${folder}/`;
  return concepts
    .filter((concept) => concept.path.startsWith(prefix) && isListed(concept.path))
    .map((concept) => toEntry(concept, concept.path.slice(prefix.length)))
    .sort(compareEntries);
}

// Only concepts are listed: not the reserved files, and not files such as references/q.py.
function isListed(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.endsWith(".md") && !RESERVED_FILE_NAMES.includes(name);
}

/**
 * By path, then by title (two concepts can only share a path in invalid input, but the order
 * must still not depend on the input order). Compared by UTF-16 code units on purpose, not by
 * locale: the output must be byte-identical on every machine.
 */
function compareEntries(a: Entry, b: Entry): number {
  return compareText(a.relativePath, b.relativePath) || compareText(a.title, b.title);
}

/** Compares by UTF-16 code unit, not by locale: the same order on every machine. */
export function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function toEntry(concept: Concept, relativePath: string): Entry {
  const { type, title, description } = concept.frontmatter ?? {};
  return {
    relativePath,
    type: isNonEmptyString(type) ? oneLine(type) : UNTYPED_SECTION,
    // §4.1: without a title, consumers may derive one from the file name.
    title: isNonEmptyString(title) ? oneLine(title) : fileTitle(relativePath),
    description: isNonEmptyString(description) ? escapeHtml(oneLine(description)) : undefined,
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
  const lines = [...bySubfolder.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([subfolder, below]) =>
      entryLine(subfolder, `${subfolder}/index.md`, contentsSummary(below)),
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

/**
 * ADR-0007: links encode each path segment once more, so "a%3Ab" is linked as "a%253Ab".
 * encodeURIComponent leaves ( and ) alone, but a ")" would end the link, so those are encoded
 * too.
 */
function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29"))
    .join("/");
}

function fileTitle(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf("/") + 1).replace(/\.md$/, "");
}
