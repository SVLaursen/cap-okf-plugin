// Removes the traces of concepts a reader may not see from a text they may see (ADR-0012,
// per-role visibility). Pure.
//
// - A list item whose first link points at a hidden concept goes as a whole line: index
//   entries, "Business knowledge" entries and "see also" lists name nothing else.
// - Any other link to a hidden concept loses its target; its text stays, as the author wrote it.
// - The lines that continue a list item that goes (indented further) go with it.
// - An autolink to a hidden concept (<finance/margins.md>) goes.
// - A reference definition ("[label]: hidden.md") goes as a whole line.
// - A heading whose section loses every line this way goes too.
// Links in code blocks lose their target too: an example mustn't name a hidden path either.
import { resolveLink } from "./links";

// [text](target "title"), as links.ts reads them, with the parts this module needs.
const INLINE_LINK = /(!?)\[((?:\\.|[^\]\\])*)\]\(\s*(<[^>\n]*>|[^\s()]+)(?:\s+"[^"]*")?\s*\)/g;
const REFERENCE_DEFINITION = /^ {0,3}\[(?!\^)[^\]]+\]:\s*(<[^>]*>|\S+)/;
const LIST_ITEM = /^\s*([*+-]|\d+[.)])\s/;
const HEADING = /^#{1,6}\s/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const AUTOLINK = /<([^<>\s]+)>/g;

/**
 * `text` (the file at bundle path `path`) without links to concepts for which `isHidden` says
 * yes. Each line keeps its own line ending.
 */
export function withoutLinksTo(
  path: string,
  text: string,
  isHidden: (bundlePath: string) => boolean,
): string {
  const kept: (string | undefined)[] = [];
  const emptiedHeadings = new Set<number>();
  let heading = -1;
  let inFence = false;
  // The indentation of the list item that went, while its continuation lines follow.
  let droppedItem: number | undefined;
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) inFence = !inFence;
    if (!inFence && HEADING.test(line)) heading = kept.length;
    const continues = continuesItem(line, droppedItem);
    const changed = continues ? undefined : withoutHiddenLinks(path, line, isHidden);
    if (!continues) droppedItem = droppedItemIndent(line, changed);
    if (changed === undefined) emptiedHeadings.add(heading);
    kept.push(changed);
  }
  // -1: lines went before the first heading, which has no section to empty.
  emptiedHeadings.delete(-1);
  for (const index of emptiedHeadings) dropIfEmpty(kept, index);
  return withoutDoubledBlankLines(kept).join("\n");
}

// Where lines went, the blank lines around them would double up: one is enough.
function withoutDoubledBlankLines(lines: readonly (string | undefined)[]): string[] {
  const result: string[] = [];
  let dropped = false;
  for (const line of lines) {
    if (line === undefined) {
      dropped = true;
      continue;
    }
    const isBlank = line.trim() === "";
    const previousBlank = result.length > 0 && result[result.length - 1]!.trim() === "";
    if (!(dropped && isBlank && previousBlank)) result.push(line);
    if (!isBlank) dropped = false;
  }
  return result;
}

// The line without its hidden links, or undefined when the whole line goes.
function withoutHiddenLinks(
  path: string,
  line: string,
  isHidden: (bundlePath: string) => boolean,
): string | undefined {
  const pointsAtHidden = (target: string) => {
    const resolved = resolveLink(path, target);
    return resolved.kind === "bundle" && isHidden(resolved.path);
  };
  const reference = REFERENCE_DEFINITION.exec(line);
  if (reference !== null && pointsAtHidden(reference[1]!)) return undefined;
  const firstLink = new RegExp(INLINE_LINK.source).exec(line);
  if (LIST_ITEM.test(line) && firstLink !== null && pointsAtHidden(firstLink[3]!)) return undefined;
  return line
    .replace(INLINE_LINK, (link: string, _image: string, label: string, target: string) =>
      pointsAtHidden(target) ? label : link,
    )
    .replace(AUTOLINK, (link: string, target: string) => (pointsAtHidden(target) ? "" : link));
}

// The indentation of a list item that went, so its continuation lines can follow it.
function droppedItemIndent(line: string, changed: string | undefined): number | undefined {
  return changed === undefined && LIST_ITEM.test(line) ? indentOf(line) : undefined;
}

// A non-blank line indented further than the list item before it continues that item; its
// nested items go with it.
function continuesItem(line: string, itemIndent: number | undefined): boolean {
  return itemIndent !== undefined && line.trim() !== "" && indentOf(line) > itemIndent;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

// Drops the heading at `index` when nothing but blank lines follows it up to the next heading.
function dropIfEmpty(lines: (string | undefined)[], index: number): void {
  let end = index + 1;
  while (end < lines.length && (lines[end] === undefined || !HEADING.test(lines[end]!))) {
    const line = lines[end];
    if (line !== undefined && line.trim() !== "") return;
    end += 1;
  }
  // The heading and the blank lines after it; the blank line before it stays as a separator.
  for (let each = index; each < end; each += 1) lines[each] = undefined;
  if (end === lines.length) trimTrailingBlankLines(lines, index);
}

// At the end of the file: the blank lines left before the dropped heading go too, but the file
// keeps its final line ending (an empty last line).
function trimTrailingBlankLines(lines: (string | undefined)[], from: number): void {
  let each = from - 1;
  while (each >= 0 && (lines[each] === undefined || lines[each]!.trim() === "")) {
    lines[each] = undefined;
    each -= 1;
  }
  lines.push("");
}
