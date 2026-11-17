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
//   - an HTML comment with marker-like text the filter can't read (<!-- okf: auth:start -->,
//     <!--- okf:auth:start --->, a comment split over lines): it was meant as a marker.
// - L4 (warning):
//   - a marker the filter reads but written slightly wrong (case, spacing, in a quote);
//   - a marker inside a fenced code block, which the filter still cuts;
//   - marker-like text outside a comment (okf_auth_start in prose, a line of only inline code).
// Code is left alone: inline code (`…`) and, apart from real markers, fenced blocks, so a guide
// can show markers as examples. One finding per line; an error wins over a warning.
import { isDelimiter } from "./concept";
import { findingAt, type Finding, type Rule } from "./finding";
import { AUTH_END, AUTH_START, markerOf } from "./filter";

const BYTE_ORDER_MARK = "﻿";
// A marker comment anywhere on a line, as the filter would accept it on a line of its own.
const MARKER_COMMENT = /<!--\s*okf:auth:(start|end)\s*-->/i;
// Text that looks like a marker: okf:auth:start, okf_auth_end, OKF - Auth : Start, …
const MARKER_LIKE = /okf[\s:_-]*auth[\s:_-]*(start|end)/i;
const INLINE_CODE = /`+[^`]*`+/g;
const FORMAT_CHARACTERS = /\p{Cf}/gu;
const EXACT = { start: AUTH_START, end: AUTH_END };

/** Problems with the authorization markers in the curated file at bundle path `file`. */
export function authMarkerFindings(file: string, text: string): Finding[] {
  const withoutBom = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  const lines = withoutBom.split(/\r\n|\r|\n/);
  const frontmatterEnd = frontmatterEndOf(lines);
  const inCode = codeBlockLines(lines, frontmatterEnd);
  const byLine = new Map<number, Finding>();
  const add: Add = (line, rule, problem) => {
    if (byLine.get(line)?.rule === "L3") return;
    byLine.set(line, findingAt(file, line, rule, problem));
  };

  const openStarts: number[] = [];
  let inComment = false; // inside an HTML comment that started on an earlier line
  lines.forEach((content, index) => {
    const line = index + 1;
    const inFrontmatter = index <= frontmatterEnd;
    const marker = markerOf(content);
    if (marker === undefined) {
      if (!inCode[index]) inComment = checkNotAMarker(content, line, inComment, add);
      return;
    }
    if (inFrontmatter) add(line, "L3", IN_FRONTMATTER);
    else if (inCode[index]) add(line, "L4", IN_CODE);
    else if (content.trim() !== EXACT[marker]) add(line, "L4", inexact(marker));
    if (marker === "start") openStarts.push(line);
    else if (openStarts.pop() === undefined) add(line, "L3", LONE_END);
  });
  for (const line of openStarts) add(line, "L3", UNCLOSED);

  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

type Add = (line: number, rule: Rule, problem: { message: string; fix: string }) => void;

/**
 * Checks a line the filter doesn't read as a marker, but that holds one or looks like one, and
 * returns whether an HTML comment is still open after it. Marker-like text in an HTML comment was
 * meant as a marker, and the filter won't hide anything for it: an error (L3). Elsewhere it is
 * only a warning (L4).
 */
function checkNotAMarker(content: string, line: number, inComment: boolean, add: Add): boolean {
  const visible = content.replace(FORMAT_CHARACTERS, "").trim();
  const outsideCode = visible.replace(INLINE_CODE, "");
  const comment = MARKER_COMMENT.exec(outsideCode);
  const touchesComment = inComment || outsideCode.includes("<!--") || outsideCode.includes("-->");
  if (comment !== null) {
    add(line, "L3", hidden(comment[1]!.toLowerCase() === "end" ? AUTH_END : AUTH_START));
  } else if (MARKER_LIKE.test(outsideCode) && touchesComment) {
    add(line, "L3", MISSPELLED);
  } else if (MARKER_LIKE.test(outsideCode) || isMarkerInInlineCode(visible)) {
    add(line, "L4", LOOKS_LIKE);
  }
  return commentOpenAfter(outsideCode, inComment);
}

// A line that is nothing but inline code holding marker-like text was probably meant as a marker.
function isMarkerInInlineCode(visible: string): boolean {
  return /^`+[^`]*`+$/.test(visible) && MARKER_LIKE.test(visible);
}

// Whether an HTML comment is open at the end of the line: the last <!-- comes after the last -->.
function commentOpenAfter(text: string, openBefore: boolean): boolean {
  const lastOpen = text.lastIndexOf("<!--");
  const lastClose = text.lastIndexOf("-->");
  if (lastOpen === -1 && lastClose === -1) return openBefore;
  return lastOpen > lastClose;
}

// The index of the frontmatter's closing ---, or -1 without frontmatter; as concept.ts reads it.
function frontmatterEndOf(lines: string[]): number {
  if (!isDelimiter(lines[0])) return -1;
  return lines.findIndex((content, index) => index > 0 && isDelimiter(content));
}

/** A fence line: optional indentation and quote marks, a run of ``` or ~~~, then the rest. */
const FENCE_LINE = /^[ \t>]*(`{3,}|~{3,})(.*)$/;

/**
 * Which lines are in a fenced code block (``` or ~~~), fence lines included. A block opens on a
 * fence (a ``` fence's info text can't contain a backtick, so ```npm i``` is inline code) and
 * closes on a fence of the same character, at least as long, with nothing after it. Fences may
 * be indented or quoted, as in a list item or a quote. A fence that never closes isn't counted:
 * it is nearly always a typo, and the lines after it are checked as text.
 */
function codeBlockLines(lines: string[], frontmatterEnd: number): boolean[] {
  const inCode = lines.map(() => false);
  let index = frontmatterEnd + 1;
  while (index < lines.length) {
    const close = closingFenceIndex(lines, index);
    if (close === undefined) {
      index += 1;
      continue;
    }
    for (let each = index; each <= close; each += 1) inCode[each] = true;
    index = close + 1;
  }
  return inCode;
}

// The index of the fence closing the block that lines[open] opens, or undefined when lines[open]
// opens no block (it isn't a fence, or nothing closes it).
function closingFenceIndex(lines: string[], open: number): number | undefined {
  const opening = FENCE_LINE.exec(lines[open]!);
  if (opening === null) return undefined;
  const run = opening[1]!;
  const info = opening[2]!;
  if (run.startsWith("`") && info.includes("`")) return undefined;
  for (let index = open + 1; index < lines.length; index += 1) {
    const fence = FENCE_LINE.exec(lines[index]!);
    if (fence === null) continue;
    const closingRun = fence[1]!;
    const sameKind = closingRun[0] === run[0] && closingRun.length >= run.length;
    if (sameKind && fence[2]!.trim() === "") return index;
  }
  return undefined;
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
const MISSPELLED = {
  message:
    "this HTML comment looks like an authorization marker but isn't written as one, so anonymous readers would see the section",
  fix: `Write the markers exactly as ${AUTH_START} and ${AUTH_END}, each alone on its own line`,
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
