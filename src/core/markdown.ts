// Reading Markdown bodies line by line. Pure module.

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
