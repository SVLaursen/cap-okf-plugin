// Reading Markdown bodies line by line. Pure module.

/** One line of a Markdown body. */
export interface BodyLine {
  text: string;
  /** File line, counting from 1. */
  line: number;
}

// A code fence: ``` or ~~~ (three or more), indented up to three spaces.
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * The lines of a body that are outside code blocks, with their file line numbers.
 * Code blocks hold examples, not structure or links. A block ends only at a fence of the same
 * kind (` or ~) that is at least as long as the one that opened it, as in CommonMark.
 */
export function linesOutsideCode(body: string, firstLine: number): BodyLine[] {
  const result: BodyLine[] = [];
  let openFence: string | undefined;
  body.split("\n").forEach((text, index) => {
    const fence = CODE_FENCE.exec(text)?.[1];
    if (openFence === undefined && fence !== undefined) {
      openFence = fence;
    } else if (openFence !== undefined) {
      if (fence !== undefined && closesFence(openFence, fence)) openFence = undefined;
    } else {
      result.push({ text, line: firstLine + index });
    }
  });
  return result;
}

function closesFence(openFence: string, fence: string): boolean {
  return fence[0] === openFence[0] && fence.length >= openFence.length;
}
