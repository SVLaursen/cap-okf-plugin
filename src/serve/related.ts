// The "Read together with" line (ADR-0012, revised by ADR-0013): when an agent reads a concept
// over MCP, the curated notes it links to are named directly under its title, where the agent
// sees them before it reads on. Agents tend to stop after the first relevant note, and a list at
// the end of a concept didn't change that. The line is marked, so it is clearly added by the
// server and not part of the bundle file:
//
//   # Shipping
//   <!-- okf:together:start -->
//   Read together with: Shipping KPIs (guides/shipping-kpis.md), Units (guides/units.md)
//   <!-- okf:together:end -->
//
// Only curated notes the reader sees are named (the view already left out hidden ones), in the
// order the text links to them, at most ten. Generated concepts aren't: their links are in the
// text already, and they repeat what the model says. Pure.
import { extractLinks, resolveLink } from "../core/links";
import { isDelimiter } from "../core/concept";
import { oneLine } from "../core/markdown";
import { isNonEmptyString } from "../core/values";
import type { ReaderView, ViewConcept } from "./reader-view";

export const TOGETHER_START = "<!-- okf:together:start -->";
export const TOGETHER_END = "<!-- okf:together:end -->";
const MAX_TOGETHER = 10;

/** `text`, the concept at `path` as the reader gets it, with the line under its title. */
export function withReadTogether(view: ReaderView, path: string, text: string): string {
  const concept = view.concept(path);
  if (concept === undefined) return text;
  const notes = linkedConcepts(view, concept)
    .filter((each) => each.curated)
    .slice(0, MAX_TOGETHER);
  if (notes.length === 0) return text;
  const line = `Read together with: ${notes.map(entry).join(", ")}`;
  // A file with CRLF line ends gets CRLF on the added lines too.
  const end = text.includes("\r\n") ? "\r" : "";
  const lines = text.split("\n");
  const at = insertionLine(lines);
  lines.splice(at, 0, TOGETHER_START + end, line + end, TOGETHER_END + end);
  return lines.join("\n");
}

/** Every visible concept `concept` links to, each once, in the order the text links to them. */
export function linkedConcepts(view: ReaderView, concept: ViewConcept): ViewConcept[] {
  const seen = new Set<string>([concept.path]);
  const linked: ViewConcept[] = [];
  for (const link of extractLinks(concept.body, 1)) {
    const resolved = resolveLink(concept.path, link.target);
    if (resolved.kind !== "bundle" || seen.has(resolved.path)) continue;
    seen.add(resolved.path);
    const target = view.concept(resolved.path);
    if (target !== undefined) linked.push(target);
  }
  return linked;
}

// Under the title: after the body's first non-blank line when that is a "# " heading; otherwise
// at the start of the body. Only the first line counts, so the line never lands under a later
// section, inside an authorization section (ADR-0003) or inside an HTML block.
function insertionLine(lines: readonly string[]): number {
  const bodyStart = firstBodyLine(lines);
  let first = bodyStart;
  while (first < lines.length && lines[first]!.trim() === "") first += 1;
  return lines[first]?.startsWith("# ") ? first + 1 : bodyStart;
}

// After the closing "---" of the frontmatter, or 0 when there is none.
function firstBodyLine(lines: readonly string[]): number {
  if (!isDelimiter(lines[0])) return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (isDelimiter(lines[index])) return index + 1;
  }
  return 0;
}

// "Shipping KPIs (guides/shipping-kpis.md)": the path as getConcept takes it.
function entry(note: ViewConcept): string {
  const title = note.frontmatter["title"];
  const name = isNonEmptyString(title)
    ? oneLine(title)
    : note.path.slice(note.path.lastIndexOf("/") + 1);
  return `${name} (${note.path})`;
}
