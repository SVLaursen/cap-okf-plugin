// The auth filter (task 4.2, ADR-0003). Pure module: a concept's text in, the text a reader may
// see out. Every server passes each file through it: an unauthenticated reader gets no
// authorization section.
//
// Rules (the contract from task 2.4, and where it says nothing, fail closed):
// - a marker counts only as a whole line, so the same text inside a sentence or a heading cuts
//   nothing. Curated files are written by hand, so a whole line counts as a marker also when it
//   is written slightly wrong: any case, any spacing inside the comment, spaces or invisible
//   format characters (zero-width space, BOM) around it, or inside a Markdown quote ("> ");
// - everything from a start marker to its own end marker goes, both markers included, and the
//   blank lines just before the start marker go with it. Sections nest: a start marker inside a
//   section needs its own end marker before the outer one can end;
// - every section goes, wherever it is: curated files may have several;
// - a start marker without an end removes everything after it, so nothing marked can leak;
// - an end marker without a start withholds everything before it: its start marker was broken,
//   and the section's beginning can't be known;
// - markers inside a code block count too: a fenced example is cut rather than risk a leak;
// - \n, \r\n and a lone \r all end a line, and each line keeps its own ending.

/** The markers the generator writes (src/export/auth-section.ts). */
export const AUTH_START = "<!-- okf:auth:start -->";
export const AUTH_END = "<!-- okf:auth:end -->";

// A marker as people may write it: <!--okf:auth:start-->, <!-- OKF:Auth:End -->, …
const MARKER = /^<!--\s*okf:auth:(start|end)\s*-->$/i;

// Invisible format characters (Unicode category Cf): zero-width space, word joiner, BOM, …
const FORMAT_CHARACTERS = /\p{Cf}/gu;

/** Who is reading. Only authenticated readers see authorization sections (ADR-0003). */
export interface Reader {
  isAuthenticated: boolean;
}

/** One line of the text and the line ending after it ("" for the last line). */
interface Line {
  content: string;
  ending: string;
}

/** The text as `reader` may see it. */
export function forReader(text: string, reader: Reader): string {
  return reader.isAuthenticated ? text : withoutAuthSections(text);
}

/** `text` with every authorization section removed, markers included. */
export function withoutAuthSections(text: string): string {
  let kept: Line[] = [];
  let depth = 0;
  for (const line of linesOf(text)) {
    const marker = markerOf(line.content);
    if (depth > 0) {
      if (marker === "start") depth += 1;
      if (marker === "end") depth -= 1;
    } else if (marker === "start") {
      dropTrailingBlankLines(kept);
      depth = 1;
    } else if (marker === "end") {
      kept = [];
    } else {
      kept.push(line);
    }
  }
  return withEndingOf(text, kept.map((line) => line.content + line.ending).join(""));
}

function linesOf(text: string): Line[] {
  // With a capture group, split keeps the endings: [line, ending, line, ending, …, last line].
  const parts = text.split(/(\r\n|\r|\n)/);
  const lines: Line[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    lines.push({ content: parts[index]!, ending: parts[index + 1] ?? "" });
  }
  return lines;
}

function markerOf(content: string): "start" | "end" | undefined {
  const cleaned = content
    .replace(FORMAT_CHARACTERS, "")
    .trim()
    .replace(/^(>\s*)+/, "");
  const match = MARKER.exec(cleaned);
  return match === null ? undefined : (match[1]!.toLowerCase() as "start" | "end");
}

function dropTrailingBlankLines(lines: Line[]): void {
  while (lines.length > 0 && lines[lines.length - 1]!.content.trim() === "") lines.pop();
}

// The result ends like the original: with a line ending only if the original has one.
function withEndingOf(original: string, result: string): string {
  const endsWithLineEnding = /(\r\n|\r|\n)$/;
  if (endsWithLineEnding.test(original)) return result;
  return result.replace(endsWithLineEnding, "");
}
