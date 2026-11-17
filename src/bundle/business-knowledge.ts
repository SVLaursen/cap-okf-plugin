// The "Business knowledge" section of generated concepts (ADR-0012): a generated concept lists
// the curated notes that link to it, so an agent that opens an entity finds the notes that
// explain it. Pure.
//
//   ## Business knowledge
//
//   - [Shipping KPIs](/guides/shipping-kpis.md) - How on-time delivery is measured.
//
// Each entry is a list item with one link, so a server drops it for a reader who may not see the
// note, and the heading with it when no entry is left (reader-view.ts, hidden-links.ts). Links
// inside a note's authorization section don't count: anonymous readers would learn from the
// entry what the section links to.
import type { Concept } from "../core/concept";
import { withoutAuthSections } from "../core/filter";
import { extractLinks, resolveLink } from "../core/links";
import { escapeHtml, escapeLinkText, oneLine } from "../core/markdown";
import { isNonEmptyString } from "../core/values";
import { compareText } from "../core/index-md";

const HEADING = "## Business knowledge";
const AUTH_START_LINE = /^<!--\s*okf:auth:start\s*-->$/m;
const RESERVED_NAMES = ["index.md", "log.md"];

/** `generated` with a Business knowledge section on each concept a curated note links to. */
export function withBusinessKnowledge(
  generated: readonly Concept[],
  curated: readonly Concept[],
): Concept[] {
  const notesByTarget = backlinks(curated);
  return generated.map((concept) => {
    const notes = notesByTarget.get(concept.path);
    return notes === undefined ? concept : { ...concept, body: withSection(concept.body, notes) };
  });
}

/** Bundle path → the curated notes that link to it, in path order. */
export function backlinks(curated: readonly Concept[]): Map<string, Concept[]> {
  const byTarget = new Map<string, Concept[]>();
  const notes = curated
    .filter((note) => note.frontmatter !== null && !RESERVED_NAMES.includes(fileName(note.path)))
    .sort((a, b) => compareText(a.path, b.path));
  for (const note of notes) {
    for (const target of linkedPaths(note)) {
      byTarget.set(target, [...(byTarget.get(target) ?? []), note]);
    }
  }
  return byTarget;
}

// The bundle paths a note links to outside its authorization sections, each once.
function linkedPaths(note: Concept): Set<string> {
  const paths = new Set<string>();
  for (const link of extractLinks(withoutAuthSections(note.body), 1)) {
    const resolved = resolveLink(note.path, link.target);
    if (resolved.kind === "bundle" && resolved.path !== note.path) paths.add(resolved.path);
  }
  return paths;
}

// The section goes before the authorization section, which stays last; otherwise at the end.
function withSection(body: string, notes: readonly Concept[]): string {
  const section = [HEADING, "", ...notes.map(entryOf)].join("\n");
  const auth = AUTH_START_LINE.exec(body);
  if (auth === null) return `${body.replace(/\n*$/, "")}\n\n${section}\n`;
  const before = body.slice(0, auth.index).replace(/\n*$/, "");
  return `${before}\n\n${section}\n\n${body.slice(auth.index)}`;
}

// "- [Title](/path) - description"
function entryOf(note: Concept): string {
  const { title, description } = note.frontmatter ?? {};
  const name = isNonEmptyString(title) ? oneLine(title) : fileName(note.path);
  const target = "/" + note.path.split("/").map(encodeURIComponent).join("/");
  const link = `- [${escapeLinkText(escapeHtml(name))}](${target})`;
  return isNonEmptyString(description) ? `${link} - ${escapeHtml(oneLine(description))}` : link;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
