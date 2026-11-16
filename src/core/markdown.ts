// Reading Markdown bodies line by line, and writing text into Markdown safely. Pure module.

/**
 * The text part of a Markdown link, as a regular expression source: "[Orders]", "[Orders [beta]]"
 * with one level of brackets inside, or "[a \\] b]" with backslash-escaped characters. A \\[ in
 * front is an escaped bracket, not the start of a link.
 */
export const LINK_TEXT = String.raw`(?<!\\)\[(?:\\.|[^[\]\\]|\[(?:\\.|[^[\]\\])*\])*\]`;

/** One line of a Markdown body. */
export interface BodyLine {
  text: string;
  /** File line, counting from 1. */
  line: number;
}

// An opening code fence: ``` or ~~~ (three or more), indented up to three spaces. A ``` line
// whose info string holds a backtick ("```npm test``` runs it") is inline code, not a fence.
const OPENING_FENCE = /^ {0,3}(`{3,}(?!.*`)|~{3,})/;

// A closing fence has nothing after it but spaces: "```js" inside a block does not close it.
const CLOSING_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * The lines of a body that are outside code blocks, with their file line numbers.
 * Code blocks hold examples, not structure or links. A block ends only at a fence of the same
 * kind (` or ~) that is at least as long as the one that opened it, as in CommonMark.
 */
export function linesOutsideCode(body: string, firstLine: number): BodyLine[] {
  const result: BodyLine[] = [];
  let openFence: string | undefined;
  body.split("\n").forEach((text, index) => {
    if (openFence === undefined) {
      openFence = OPENING_FENCE.exec(text)?.[1];
      if (openFence === undefined) result.push({ text, line: firstLine + index });
    } else {
      const fence = CLOSING_FENCE.exec(text)?.[1];
      if (fence !== undefined && closesFence(openFence, fence)) openFence = undefined;
    }
  });
  return result;
}

function closesFence(openFence: string, fence: string): boolean {
  return fence[0] === openFence[0] && fence.length >= openFence.length;
}

// Writing: generated files put titles, names and doc comments into Markdown. These keep such
// text from changing the document's structure.

/** Text on one line: a line break inside a heading, link or table cell would end it. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A backslash, [ or ] in link text would end or break the link; a backslash escapes each. */
export function escapeLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, (character) => `\\${character}`);
}

/**
 * A "<" could start HTML, and "<!--" would hide the rest of the file when it is rendered, or
 * fake an authorization marker (ADR-0003). As "&lt;" it is shown, not interpreted.
 */
export function escapeHtml(text: string): string {
  return text.replace(/</g, "&lt;");
}

/**
 * Text as a `code` span. A fence of one backtick more than the longest run inside keeps a
 * backtick in the text from ending the span (CommonMark); a space pads text that starts or ends
 * with a backtick.
 */
export function inlineCode(text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${padding}${text}${padding}${fence}`;
}

/**
 * A block of prose from the model, such as a doc comment: it keeps its lines and Markdown, but
 * starts no HTML (see escapeHtml) and no heading, so it can't add sections to a generated file,
 * e.g. a fake "## Authorization" outside the ADR-0003 markers.
 */
export function escapeBlock(text: string): string {
  return escapeHtml(text).replace(/^( {0,3})#/gm, "$1\\#");
}

/** Text for one cell of a Markdown table: on one line, no HTML, and "|" escaped. */
export function tableCell(text: string): string {
  return escapeHtml(oneLine(text)).replace(/\|/g, "\\|");
}
