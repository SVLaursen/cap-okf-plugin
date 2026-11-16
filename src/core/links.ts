// Links between OKF files (OKF v0.2 §6.1): finding them in a Markdown body and resolving them
// against bundle paths. Pure module; validateBundle turns broken links into findings (W4).
import { linesOutsideCode } from "./markdown";

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

// Link text, which may hold one level of [brackets], as in [Orders [beta]].
const LINK_TEXT = String.raw`\[(?:[^[\]]|\[[^[\]]*\])*\]`;
// The target, either <in angle brackets> (it may then contain spaces) or up to white space.
const LINK_TARGET = String.raw`(<[^>]*>|[^\s)]+)`;
// An optional title after the target: "…", '…' or (…).
const LINK_TITLE = String.raw`(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?`;

// [text](target "title") or ![alt](target), anywhere on a line.
const INLINE_LINK = new RegExp(
  String.raw`!?${LINK_TEXT}\(\s*${LINK_TARGET}${LINK_TITLE}\s*\)`,
  "g",
);

// [label]: target, on a line of its own: the target of a reference link such as [text][label].
// A label starting with ^ is a footnote ("[^source-id]: Title", §5.1), whose text is prose.
const REFERENCE_DEFINITION = /^ {0,3}\[(?!\^)[^\]]+\]:\s*(<[^>]*>|\S+)/;

// `code` spans: links inside them are examples, not links.
const INLINE_CODE = /`+[^`]*`+/g;

// A URL scheme such as https: or mailto:, as in RFC 3986.
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const EXTERNAL: ResolvedLink = { kind: "external" };
const OUTSIDE: ResolvedLink = { kind: "outside" };

/** All links in a body, in order, skipping code. `firstLine` is the file line the body starts on. */
export function extractLinks(body: string, firstLine: number): Link[] {
  return linesOutsideCode(body, firstLine).flatMap(({ text, line }) =>
    targetsOnLine(text).map((target) => ({ target, line })),
  );
}

function targetsOnLine(text: string): string[] {
  const definition = REFERENCE_DEFINITION.exec(text)?.[1];
  if (definition !== undefined) return [withoutAngleBrackets(definition)];
  const withoutCode = text.replace(INLINE_CODE, "");
  // Group 1 (the target) is not optional, so it is always there when the link matched.
  return [...withoutCode.matchAll(INLINE_LINK)].map((match) => withoutAngleBrackets(match[1]!));
}

function withoutAngleBrackets(target: string): string {
  return target.startsWith("<") ? target.slice(1, -1) : target;
}

/**
 * Resolves a link target written in the file at `fromPath`. A target starting with / is
 * relative to the bundle root, any other path to the file's folder (§6.1).
 */
export function resolveLink(fromPath: string, target: string): ResolvedLink {
  // The #fragment and ?query name a place in the file, not the file itself.
  const pathPart = target.replace(/[?#].*$/s, "");
  if (pathPart === "" || URL_SCHEME.test(pathPart)) return EXTERNAL;
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

/**
 * The bundle path closest to `path` by edit distance, for a "did you mean" hint.
 * Undefined when even the closest path differs in more than a third of the characters (at
 * least 2 edits are always allowed): such a hint would mislead more than help.
 */
export function closestPath(path: string, candidates: readonly string[]): string | undefined {
  const maxDistance = Math.max(2, Math.floor(path.length / 3));
  let best: string | undefined;
  let bestDistance = maxDistance + 1;
  // Sorted, so that of two equally close paths the one that sorts first wins every time.
  for (const candidate of [...candidates].sort()) {
    const distance = editDistance(path, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Levenshtein distance: the fewest single-character inserts, deletes and changes from a to b. */
export function editDistance(a: string, b: string): number {
  // previous[j] is the distance from the first i - 1 characters of a to the first j of b.
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const change = a[i - 1] === b[j - 1] ? 0 : 1;
      // The ! marks are safe: i and j never leave the bounds of the two rows.
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + change);
    }
    previous = current;
  }
  return previous[b.length]!;
}
