// The "related concepts" block (ADR-0012): when an agent reads a concept over MCP, the concepts
// it links to follow in a short block, so the second note it needs is one read away. The block
// is marked, so it is clearly not part of the bundle file:
//
//   <!-- okf:related:start -->
//   ## Related concepts
//
//   - [Shipping KPIs](/guides/shipping-kpis.md) - How on-time delivery is measured.
//   <!-- okf:related:end -->
//
// Only concepts the reader sees are listed (the view already left out hidden ones); curated
// notes first, then generated concepts, each group in the order the text links to them; at
// most ten. Pure.
import { extractLinks, resolveLink } from "../core/links";
import { escapeHtml, escapeLinkText, oneLine } from "../core/markdown";
import { isNonEmptyString } from "../core/values";
import type { ReaderView, ViewConcept } from "./reader-view";

export const RELATED_START = "<!-- okf:related:start -->";
export const RELATED_END = "<!-- okf:related:end -->";
const MAX_RELATED = 10;

/** `text`, the concept at `path` as the reader gets it, with the related block after it. */
export function withRelated(view: ReaderView, path: string, text: string): string {
  const concept = view.concept(path);
  if (concept === undefined) return text;
  const related = relatedConcepts(view, concept);
  if (related.length === 0) return text;
  const lines = related.map(relatedLine);
  const block = [RELATED_START, "## Related concepts", "", ...lines, RELATED_END].join("\n");
  const separator = text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${separator}${block}\n`;
}

/** The visible concepts `concept` links to: curated first, at most ten. */
export function relatedConcepts(view: ReaderView, concept: ViewConcept): ViewConcept[] {
  const seen = new Set<string>([concept.path]);
  const linked: ViewConcept[] = [];
  for (const link of extractLinks(concept.body, 1)) {
    const resolved = resolveLink(concept.path, link.target);
    if (resolved.kind !== "bundle" || seen.has(resolved.path)) continue;
    seen.add(resolved.path);
    const target = view.concept(resolved.path);
    if (target !== undefined) linked.push(target);
  }
  const curated = linked.filter((each) => each.curated);
  const generated = linked.filter((each) => !each.curated);
  return [...curated, ...generated].slice(0, MAX_RELATED);
}

// "- [Title](/path) - description"; the file name when there is no title.
function relatedLine(concept: ViewConcept): string {
  const { title, description } = concept.frontmatter;
  const name = isNonEmptyString(title)
    ? oneLine(title)
    : concept.path.slice(concept.path.lastIndexOf("/") + 1);
  const target = "/" + concept.path.split("/").map(encodeURIComponent).join("/");
  const link = `- [${escapeLinkText(escapeHtml(name))}](${target})`;
  return isNonEmptyString(description) ? `${link} - ${escapeHtml(oneLine(description))}` : link;
}
