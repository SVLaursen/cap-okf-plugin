// The auth filter (task 4.2, ADR-0003). Pure module: a concept's text in, the text a reader may
// see out. Every server passes each file through it: an unauthenticated reader gets no
// authorization section.
//
// Rules (the contract from task 2.4, and where it says nothing, fail closed):
// - a marker counts only as a whole line: `<!-- okf:auth:start -->` or `<!-- okf:auth:end -->`
//   alone on its line, spaces and a Windows line ending around it allowed; the same text inside
//   a sentence or a heading cuts nothing;
// - everything from a start marker to the next end marker goes, both markers included, and the
//   blank lines just before the start marker go with it;
// - every section goes, wherever it is: curated files may have several;
// - a start marker without an end removes everything after it, so nothing marked can leak;
// - an end marker without a start is removed on its own;
// - markers inside a code block count too: a fenced example is cut rather than risk a leak.

const START_MARKER = "<!-- okf:auth:start -->";
const END_MARKER = "<!-- okf:auth:end -->";

/** Who is reading. Only authenticated readers see authorization sections (ADR-0003). */
export interface Reader {
  isAuthenticated: boolean;
}

/** The text as `reader` may see it. */
export function forReader(text: string, reader: Reader): string {
  return reader.isAuthenticated ? text : withoutAuthSections(text);
}

/** `text` with every authorization section removed, markers included. */
export function withoutAuthSections(text: string): string {
  // Split on \n only, so a line keeps its \r and the file keeps its line endings.
  const lines = text.split("\n");
  const kept: string[] = [];
  let isInSection = false;
  for (const line of lines) {
    const content = line.trim();
    if (isInSection) {
      if (content === END_MARKER) isInSection = false;
    } else if (content === START_MARKER) {
      dropTrailingBlankLines(kept);
      isInSection = true;
    } else if (content !== END_MARKER) {
      kept.push(line);
    }
  }
  return withFinalNewlineOf(text, kept.join("\n"));
}

function dropTrailingBlankLines(lines: string[]): void {
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
}

// A section that runs to the end of the text takes the final newline with it; put it back, so
// the result ends like the original.
function withFinalNewlineOf(original: string, result: string): string {
  if (result === "" || !original.endsWith("\n") || result.endsWith("\n")) return result;
  // The last kept line still has its \r when the file uses Windows line endings.
  return result + "\n";
}
