// Checks the authorization markers of a curated file (task 4.11, ADR-0003). Pure: a file's text
// in, findings out. The filter (filter.ts) fails closed, so marked text never leaks through a
// marker it reads; these are the mistakes it can't make right:
// - L3 (error): an end marker without a start (the filter would drop everything before it, the
//   frontmatter included), a start marker without an end (everything after it goes), a marker
//   in the frontmatter (it would cut the frontmatter), and a marker in a list item or heading,
//   which the filter doesn't read as a marker, so the section would reach anonymous readers.
// - L4 (warning): a marker the filter reads but written slightly wrong (case, spacing, in a
//   quote), and a marker inside a code block, which the filter still cuts.
// One finding per line; an error wins over a warning.
import { findingAt, type Finding, type Rule } from "./finding";
import { AUTH_END, AUTH_START, markerOf } from "./filter";

// A marker hidden behind a list bullet, a number or a heading: the filter doesn't see it.
const HIDDEN_MARKER = /^\s*(?:[-*+]|\d+[.)]|#{1,6})\s+<!--\s*okf:auth:(start|end)\s*-->\s*$/i;
const FENCE = /^\s{0,3}(```|~~~)/;

const EXACT = { start: AUTH_START, end: AUTH_END };

/** Problems with the authorization markers in the curated file at bundle path `file`. */
export function authMarkerFindings(file: string, text: string): Finding[] {
  const lines = text.split(/\r\n|\r|\n/);
  const frontmatterEnd = frontmatterEndOf(lines);
  const byLine = new Map<number, Finding>();
  const add = (line: number, rule: Rule, message: string, fix: string) => {
    if (byLine.get(line)?.rule === "L3") return;
    byLine.set(line, findingAt(file, line, rule, { message, fix }));
  };

  const openStarts: number[] = [];
  let inFence = false;
  lines.forEach((content, index) => {
    const line = index + 1;
    const inFrontmatter = index <= frontmatterEnd;
    if (!inFrontmatter && FENCE.test(content)) inFence = !inFence;
    const marker = markerOf(content);
    if (marker === undefined) {
      if (HIDDEN_MARKER.test(content)) add(line, "L3", HIDDEN, alone(content));
      return;
    }
    if (inFrontmatter) add(line, "L3", IN_FRONTMATTER, MOVE_BELOW);
    else if (inFence) add(line, "L4", IN_CODE, CODE_FIX);
    else if (content.trim() !== EXACT[marker])
      add(line, "L4", INEXACT, `Write it as ${EXACT[marker]}`);
    if (marker === "start") openStarts.push(line);
    else if (openStarts.pop() === undefined) add(line, "L3", LONE_END, LONE_END_FIX);
  });
  for (const line of openStarts) add(line, "L3", UNCLOSED, UNCLOSED_FIX);

  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

// The index of the frontmatter's closing ---, or -1 when the file has no frontmatter.
function frontmatterEndOf(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return -1;
  const end = lines.findIndex((content, index) => index > 0 && content.trim() === "---");
  return end === -1 ? -1 : end;
}

function alone(content: string): string {
  const isEnd = /okf:auth:end/i.test(content);
  return `Put ${isEnd ? AUTH_END : AUTH_START} alone on its own line, without a bullet, number or #`;
}

const HIDDEN =
  "this authorization marker is part of a list item or heading, so it isn't read as a marker and anonymous readers would see the section";
const IN_FRONTMATTER =
  "an authorization marker in the frontmatter would cut the frontmatter for anonymous readers";
const MOVE_BELOW = "Move the authorization section below the frontmatter's closing ---";
const IN_CODE =
  "an authorization marker inside a code block still cuts the text for anonymous readers";
const CODE_FIX = "Leave markers out of code examples, or write them inline in a sentence";
const INEXACT = "this authorization marker isn't written exactly as cap-okf writes it";
const LONE_END =
  "an end marker without a start marker: anonymous readers would get nothing before it, not even the frontmatter";
const LONE_END_FIX = `Add ${AUTH_START} on its own line where the section starts`;
const UNCLOSED =
  "a start marker without an end marker: anonymous readers would get nothing after it";
const UNCLOSED_FIX = `Add ${AUTH_END} on its own line where the section ends`;
