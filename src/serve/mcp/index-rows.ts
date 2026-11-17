// OkfService.Index rows (ADR-0010 Contract B): one row per concept, from the files a reader may
// see, so `links` names only concepts that reader can open. Pure.
import { parseConcept } from "../../core/concept";
import { compareText } from "../../core/index-md";
import { extractLinks, resolveLink } from "../../core/links";

/** One row of OkfService.Index; a missing value is null, as in a database. */
export interface IndexRow {
  path: string;
  type: string | null;
  title: string | null;
  description: string | null;
  /** The concept's tags, comma-separated. */
  tags: string | null;
  /** Paths of the concepts it links to, comma-separated. */
  links: string | null;
}

export interface BundleText {
  path: string;
  text: string;
}

const RESERVED_NAMES = ["index.md", "log.md"];

/**
 * The Index rows for `files`, sorted by path. Pass the files as the reader gets them: only the
 * files they may see, each already filtered for them (ADR-0003). Otherwise `links` would name
 * concepts linked only from inside an authorization section.
 * Files that aren't concepts, don't parse or have no
 * frontmatter have none.
 */
export function indexRows(files: readonly BundleText[]): IndexRow[] {
  const concepts = files.filter((file) => isConceptPath(file.path));
  const conceptPaths = new Set(concepts.map((file) => file.path));
  const rows: IndexRow[] = [];
  for (const file of concepts) {
    const row = rowOf(file, conceptPaths);
    if (row !== undefined) rows.push(row);
  }
  return rows.sort((a, b) => compareText(a.path, b.path));
}

function isConceptPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.endsWith(".md") && !RESERVED_NAMES.includes(name);
}

function rowOf(file: BundleText, conceptPaths: ReadonlySet<string>): IndexRow | undefined {
  let concept;
  try {
    concept = parseConcept(file.path, file.text);
  } catch {
    return undefined;
  }
  // A concept needs frontmatter (OKF R1); without it, it isn't listed.
  if (concept.frontmatter === null) return undefined;
  const frontmatter = concept.frontmatter;
  return {
    path: file.path,
    type: textOrNull(frontmatter["type"]),
    title: textOrNull(frontmatter["title"]),
    description: textOrNull(frontmatter["description"]),
    tags: listOrNull(tagsOf(frontmatter["tags"])),
    links: listOrNull(linkedConcepts(file.path, concept.body, conceptPaths)),
  };
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function tagsOf(value: unknown): string[] {
  const tags = Array.isArray(value) ? value : [value];
  return tags.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "");
}

// Links to concepts in the bundle, as bundle paths, each once, in path order.
function linkedConcepts(from: string, body: string, conceptPaths: ReadonlySet<string>): string[] {
  const targets = new Set<string>();
  for (const link of extractLinks(body, 1)) {
    const resolved = resolveLink(from, link.target);
    if (resolved.kind === "bundle" && conceptPaths.has(resolved.path)) targets.add(resolved.path);
  }
  return [...targets].sort(compareText);
}

function listOrNull(values: string[]): string | null {
  return values.length === 0 ? null : values.join(",");
}
