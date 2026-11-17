// Checks the authorization markers of a curated file (task 4.11, ADR-0003). Pure: a file's text
// in, findings out. The filter (filter.ts) fails closed, so marked text never leaks through a
// marker it reads. These are the mistakes it can't make right:
// - L3 (error):
//   - an end marker without a start: the filter drops everything before it, frontmatter too;
//   - a start marker without an end: everything after it goes;
//   - a marker in the frontmatter: it would cut the frontmatter;
//   - a marker comment the filter doesn't read as a marker, because the line has more on it
//     (a bullet, a #, a quote and a bullet, a task box, other text): the section would reach
//     anonymous readers.
// - L4 (warning):
//   - a marker the filter reads but written slightly wrong (case, spacing, in a quote);
//   - a marker inside a fenced code block, which the filter still cuts;
//   - text that looks like a marker but isn't a comment the filter could read
//     (okf_auth_start, a comment split over lines).
// Code is left alone: inline code (`…`) and, apart from real markers, fenced blocks, so a guide
// can show markers as examples. One finding per line; an error wins over a warning.
import { isDelimiter } from "./concept";
import { findingAt, type Finding, type Rule } from "./finding";
import { AUTH_END, AUTH_START, markerOf } from "./filter";

const BYTE_ORDER_MARK = "﻿";
// A marker comment anywhere on a line, as the filter would accept it on a line of its own.
const MARKER_COMMENT = /<!--\s*okf:auth:(start|end)\s*-->/i;
// Text that looks like a marker: okf:auth:start, okf_auth_end, OKF-Auth-Start, …
const MARKER_LIKE = /okf[\s:_-]?auth[\s:_-]?(start|end)/i;
const INLINE_CODE = /`+[^`]*`+/g;
const FORMAT_CHARACTERS = /\p{Cf}/gu;
const EXACT = { start: AUTH_START, end: AUTH_END };

/** Problems with the authorization markers in the curated file at bundle path `file`. */
export function authMarkerFindings(file: string, text: string): Finding[] {
  const withoutBom = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  const lines = withoutBom.split(/\r\n|\r|\n/);
  const frontmatterEnd = frontmatterEndOf(lines);
  const fences = new FenceTracker();
  const byLine = new Map<number, Finding>();
  const add = (line: number, rule: Rule, problem: { message: string; fix: string }) => {
    if (byLine.get(line)?.rule === "L3") return;
    byLine.set(line, findingAt(file, line, rule, problem));
  };

  const openStarts: number[] = [];
  lines.forEach((content, index) => {
    const line = index + 1;
    const inFrontmatter = index <= frontmatterEnd;
    const inFence = !inFrontmatter && fences.inBlockAfter(content);
    const marker = markerOf(content);
    if (marker === undefined) {
      if (!inFence) checkNotAMarker(content, line, add);
      return;
    }
    if (inFrontmatter) add(line, "L3", IN_FRONTMATTER);
    else if (inFence) add(line, "L4", IN_CODE);
    else if (content.trim() !== EXACT[marker]) add(line, "L4", inexact(marker));
    if (marker === "start") openStarts.push(line);
    else if (openStarts.pop() === undefined) add(line, "L3", LONE_END);
  });
  for (const line of openStarts) add(line, "L3", UNCLOSED);

  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

type Add = (line: number, rule: Rule, problem: { message: string; fix: string }) => void;

// A line the filter doesn't read as a marker, but that holds one or looks like one.
function checkNotAMarker(content: string, line: number, add: Add): void {
  const visible = content.replace(FORMAT_CHARACTERS, "").trim();
  // A line that is nothing but inline code was probably meant as a marker.
  if (/^`+[^`]*`+$/.test(visible) && MARKER_LIKE.test(visible)) {
    add(line, "L4", LOOKS_LIKE);
    return;
  }
  const outsideCode = visible.replace(INLINE_CODE, "");
  const comment = MARKER_COMMENT.exec(outsideCode);
  if (comment !== null) {
    add(line, "L3", hidden(comment[1]!.toLowerCase() === "end" ? AUTH_END : AUTH_START));
  } else if (MARKER_LIKE.test(outsideCode)) {
    add(line, "L4", LOOKS_LIKE);
  }
}

// The index of the frontmatter's closing ---, or -1 without frontmatter; as concept.ts reads it.
function frontmatterEndOf(lines: string[]): number {
  if (!isDelimiter(lines[0])) return -1;
  return lines.findIndex((content, index) => index > 0 && isDelimiter(content));
}

/**
 * Follows fenced code blocks (``` or ~~~) line by line, as CommonMark does: a block closes on a
 * fence of the same character, at least as long, with nothing after it. Indented code blocks
 * aren't followed: a marker there is still a whole line, which the filter reads and cuts.
 */
class FenceTracker {
  private open: { character: string; length: number } | undefined;

  /** Whether `content` is inside a fenced block (its opening and closing fences count). */
  inBlockAfter(content: string): boolean {
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(content);
    if (this.open === undefined) {
      if (fence !== null) this.open = { character: fence[1]![0]!, length: fence[1]!.length };
      return fence !== null;
    }
    const closes =
      fence !== null &&
      fence[1]![0] === this.open.character &&
      fence[1]!.length >= this.open.length &&
      fence[2]!.trim() === "";
    if (closes) this.open = undefined;
    return true;
  }
}

function hidden(marker: string): { message: string; fix: string } {
  return {
    message:
      "this line has an authorization marker with more on the line (a bullet, #, quote or text), so it isn't read as a marker and anonymous readers would see the section",
    fix: `Put ${marker} alone on its own line`,
  };
}

function inexact(marker: "start" | "end"): { message: string; fix: string } {
  return {
    message: "this authorization marker isn't written exactly as cap-okf writes it",
    fix: `Write it as ${EXACT[marker]}`,
  };
}

const IN_FRONTMATTER = {
  message:
    "an authorization marker in the frontmatter would cut the frontmatter for anonymous readers",
  fix: "Move the authorization section below the frontmatter's closing ---",
};
const IN_CODE = {
  message: "an authorization marker inside a code block still cuts the text for anonymous readers",
  fix: "Leave markers out of code examples, or write them inline in a sentence",
};
const LOOKS_LIKE = {
  message: "this looks like an authorization marker, but isn't one, so it hides nothing",
  fix: `Write the markers as ${AUTH_START} and ${AUTH_END}, each alone on its own line, or put the text in backticks`,
};
const LONE_END = {
  message:
    "an end marker without a start marker: anonymous readers would get nothing before it, not even the frontmatter",
  fix: `Add ${AUTH_START} on its own line where the section starts`,
};
const UNCLOSED = {
  message: "a start marker without an end marker: anonymous readers would get nothing after it",
  fix: `Add ${AUTH_END} on its own line where the section ends`,
};
