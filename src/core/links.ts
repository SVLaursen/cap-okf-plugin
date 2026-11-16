// Links between OKF files (OKF v0.2 §6.1): finding them in a Markdown body and resolving them
// against bundle paths. Pure module; validateBundle turns broken links into findings (W4).
//
// Known limits, acceptable for a warning: links in 4-space indented code and in HTML comments
// are still read, <a href> links are not, and in [outer [inner](a.md)](b.md) only b.md is found.
import { linesOutsideCode, type BodyLine } from "./markdown";

/** One link in a body: what it points at, as written, and the file line it is on. */
export interface Link {
  target: string;
  line: number;
}

/** Where a link points. */
export type ResolvedLink =
  /** A URL with a scheme (https:, mailto:, cds:, …) or a link within the same page (#…). */
  | { kind: "external" }
  /** A relative path that climbs above the bundle root. */
  | { kind: "outside" }
  /** A bundle path without leading /, e.g. "tables/orders.md"; "" is the bundle root. */
  | { kind: "bundle"; path: string };

// Link text: "[Orders]", or "[Orders [beta]]" with one level of brackets inside. A \[ is an
// escaped bracket, not the start of a link.
const LINK_TEXT = String.raw`(?<!\\)\[(?:[^[\]]|\[[^[\]]*\])*\]`;
// The target: "<my notes.md>" in angle brackets (may hold spaces), or "notes_(draft).md" up to
// white space (may hold one level of parentheses).
const LINK_TARGET = String.raw`(<[^>\n]*>|(?:[^\s()]|\([^\s()]*\))+)`;
// An optional title after the target: "The A concept", 'The A concept' or (The A concept).
const LINK_TITLE = String.raw`(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?`;

// [text](target "title") or ![alt](target), anywhere in a paragraph, also across lines.
const INLINE_LINK = new RegExp(
  String.raw`!?${LINK_TEXT}\(\s*${LINK_TARGET}${LINK_TITLE}\s*\)`,
  "g",
);

// [label]: target, on a line of its own: the target of a reference link such as [text][label].
// A label starting with ^ is a footnote ("[^source-id]: Title", §5.1), whose text is prose.
const REFERENCE_DEFINITION = /^ {0,3}\[(?!\^)[^\]]+\]:\s*(<[^>]*>|\S+)/;

// A `code` span: opened and closed by backtick runs of the same length, as in
// "`` `[a](a.md)` ``". Links inside it are examples, not links.
const INLINE_CODE = /(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g;

// A URL scheme such as https: or mailto:, as in RFC 3986.
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const EXTERNAL: ResolvedLink = { kind: "external" };
const OUTSIDE: ResolvedLink = { kind: "outside" };

/** All links in a body, in order, skipping code. `firstLine` is the file line the body starts on. */
export function extractLinks(body: string, firstLine: number): Link[] {
  return paragraphsOf(linesOutsideCode(body, firstLine)).flatMap(linksInParagraph);
}

// Runs of non-blank lines that follow each other. A link may wrap onto the next line of its
// paragraph, but never across a blank line or a code block.
function paragraphsOf(lines: BodyLine[]): BodyLine[][] {
  const paragraphs: BodyLine[][] = [];
  let current: BodyLine[] = [];
  for (const bodyLine of lines) {
    const previous = current.at(-1);
    if (previous !== undefined && previous.line !== bodyLine.line - 1) {
      paragraphs.push(current);
      current = [];
    }
    if (bodyLine.text.trim() === "") {
      if (current.length > 0) paragraphs.push(current);
      current = [];
    } else {
      current.push(bodyLine);
    }
  }
  if (current.length > 0) paragraphs.push(current);
  return paragraphs;
}

function linksInParagraph(lines: BodyLine[]): Link[] {
  const links: Link[] = [];
  const prose: string[] = [];
  for (const { text, line } of lines) {
    const definition = REFERENCE_DEFINITION.exec(text)?.[1];
    if (definition !== undefined) links.push({ target: withoutAngleBrackets(definition), line });
    // A definition line is not prose; an empty line keeps the line count of the rest right.
    prose.push(definition === undefined ? text : "");
  }
  const text = blankOutInlineCode(prose.join("\n"));
  // paragraphsOf never returns an empty paragraph, so lines[0] is always there.
  const firstLine = lines[0]!.line;
  for (const match of text.matchAll(INLINE_LINK)) {
    const linesBefore = text.slice(0, match.index).split("\n").length - 1;
    // Group 1 (the target) is not optional, so it is always there when the link matched.
    links.push({ target: withoutAngleBrackets(match[1]!), line: firstLine + linesBefore });
  }
  // Stable sort: links on the same line keep the order they were written in.
  return links.sort((a, b) => a.line - b.line);
}

// Spaces instead of removal, so the positions and line breaks of everything else stay put.
function blankOutInlineCode(text: string): string {
  return text.replace(INLINE_CODE, (span) => span.replace(/[^\n]/g, " "));
}

function withoutAngleBrackets(target: string): string {
  const isWrapped = target.startsWith("<") && target.endsWith(">");
  return isWrapped ? target.slice(1, -1) : target;
}

/**
 * Resolves a link target written in the file at `fromPath`. A target starting with / is
 * relative to the bundle root, any other path to the file's folder (§6.1).
 */
export function resolveLink(fromPath: string, target: string): ResolvedLink {
  // The #fragment and ?query name a place in the file, not the file itself.
  const pathPart = target.replace(/[?#].*$/s, "");
  // "//host/path" is a URL without its scheme, not a bundle path.
  if (pathPart === "" || pathPart.startsWith("//") || URL_SCHEME.test(pathPart)) return EXTERNAL;
  const decoded = decodePath(pathPart);
  const start = decoded.startsWith("/") ? [] : folderOf(fromPath);
  return normalizePath([...start, ...decoded.split("/")]);
}

// "my%20notes.md" names the file "my notes.md". A stray % is kept as written.
function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function folderOf(path: string): string[] {
  return path.split("/").slice(0, -1);
}

// Applies "." and ".." and drops empty segments (from //, a leading / or a trailing /).
function normalizePath(segments: string[]): ResolvedLink {
  const result: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") {
      result.push(segment);
    } else if (result.pop() === undefined) {
      return OUTSIDE;
    }
  }
  return { kind: "bundle", path: result.join("/") };
}
