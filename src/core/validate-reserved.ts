// R3: the reserved files index.md (OKF v0.2 §8) and log.md (§9) keep their structure.
// Pure module. Only structure is checked; the prose in both files is free.
import type { LocatedConcept } from "./concept";
import { isIsoDate } from "./datetime";
import { findingAtKey, findingOnLine, type Finding } from "./finding";

/** The only key allowed in index.md frontmatter, and only in the bundle-root index.md (§12). */
const ROOT_INDEX_KEY = "okf_version";

// An index entry is a list item at the start of the line. Indented items are details nested
// under an entry (or code, from 4 spaces on), so they are not entries themselves.
const INDEX_ENTRY = /^[*+-][ \t]+(.*)$/;

// "* * *", "---", "___": a thematic break, not a list item.
const THEMATIC_BREAK = /^ {0,3}([*_-])(?:[ \t]*\1){2,}[ \t]*$/;

// The entry starts with a link: [text](path) or a reference [text][label], optionally in
// bold or italics. The link text may contain one level of [brackets], as in [Orders [beta]].
const LINK_TEXT = String.raw`\[(?:[^[\]]|\[[^[\]]*\])*\]`;
const LINK_TARGET = String.raw`(?:\([^)]*\)|\[[^\]]*\])`;
const STARTS_WITH_LINK = new RegExp(String.raw`^(?:\*\*|__|\*|_)?` + LINK_TEXT + LINK_TARGET);

// "## 2026-11-13", indented up to three spaces, optionally closed with hashes ("## … ##").
const LOG_DATE_HEADING = /^ {0,3}##[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

// A code fence: ``` or ~~~ (three or more), indented up to three spaces.
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;

interface BodyLine {
  text: string;
  /** File line, counting from 1. */
  line: number;
}

/** R3 findings for an index.md at any level. */
export function checkIndexFile(located: LocatedConcept): Finding[] {
  return [...checkIndexFrontmatter(located), ...checkIndexEntries(located)];
}

/** R3 findings for a log.md at any level. Its frontmatter is not checked. */
export function checkLogFile(located: LocatedConcept): Finding[] {
  const findings: Finding[] = [];
  let previousDate: string | undefined;
  for (const { text, line } of bodyLines(located)) {
    const date = LOG_DATE_HEADING.exec(text)?.[1];
    if (date === undefined) continue;
    if (!isIsoDate(date)) {
      findings.push(invalidLogDate(located, line, date));
      continue;
    }
    if (date === previousDate) {
      findings.push(repeatedLogDate(located, line, date));
    } else if (previousDate !== undefined && date > previousDate) {
      // YYYY-MM-DD strings sort like the dates they name, so a string comparison is enough.
      findings.push(logNotNewestFirst(located, line, date, previousDate));
    }
    previousDate = date;
  }
  return findings;
}

function checkIndexFrontmatter(located: LocatedConcept): Finding[] {
  const { path, frontmatter } = located.concept;
  if (frontmatter === null) return [];
  if (path !== "index.md") {
    return [
      findingOnLine(located, 1, "R3", {
        message: "only the bundle-root index.md may have frontmatter",
        fix: "Remove the frontmatter block from this index.md",
      }),
    ];
  }
  return Object.keys(frontmatter)
    .filter((key) => key !== ROOT_INDEX_KEY)
    .map((key) =>
      findingAtKey(located, [key], "R3", {
        message: `"${key}" is not allowed in index.md frontmatter; only ${ROOT_INDEX_KEY} is`,
        fix: `Remove "${key}", or move it into a concept file`,
      }),
    );
}

// §8: entries are "* [Title](path) - description" lines under section headings.
function checkIndexEntries(located: LocatedConcept): Finding[] {
  return bodyLines(located)
    .filter(({ text }) => isEntryWithoutLink(text))
    .map(({ line }) =>
      findingOnLine(located, line, "R3", {
        message: "list entry does not start with a link",
        fix: "Write the entry as * [Title](relative/path.md) - short description",
      }),
    );
}

function isEntryWithoutLink(text: string): boolean {
  if (THEMATIC_BREAK.test(text)) return false;
  const entry = INDEX_ENTRY.exec(text)?.[1];
  return entry !== undefined && !STARTS_WITH_LINK.test(entry);
}

function invalidLogDate(located: LocatedConcept, line: number, date: string): Finding {
  return findingOnLine(located, line, "R3", {
    message: `log heading "${date}" is not a valid YYYY-MM-DD date`,
    fix: "Write each ## heading in log.md as an ISO 8601 date, e.g. ## 2026-11-13",
  });
}

function repeatedLogDate(located: LocatedConcept, line: number, date: string): Finding {
  return findingOnLine(located, line, "R3", {
    message: `log heading ${date} repeats an earlier heading; one heading per date`,
    fix: "Merge the entries of this group into the earlier group with the same date",
  });
}

function logNotNewestFirst(
  located: LocatedConcept,
  line: number,
  date: string,
  previousDate: string,
): Finding {
  return findingOnLine(located, line, "R3", {
    message: `log heading ${date} comes after the older ${previousDate}; log.md lists newest first`,
    fix: "Move this date group above the older ones",
  });
}

/**
 * Body lines outside code blocks, with their file line numbers. Code blocks hold examples,
 * not structure. A block ends only at a fence of the same kind (` or ~) that is at least as
 * long as the one that opened it, as in CommonMark.
 */
function bodyLines(located: LocatedConcept): BodyLine[] {
  const result: BodyLine[] = [];
  let openFence: string | undefined;
  located.concept.body.split("\n").forEach((text, index) => {
    const fence = CODE_FENCE.exec(text)?.[1];
    if (openFence === undefined && fence !== undefined) {
      openFence = fence;
    } else if (openFence !== undefined) {
      if (fence !== undefined && closesFence(openFence, fence)) openFence = undefined;
    } else {
      result.push({ text, line: located.bodyLine + index });
    }
  });
  return result;
}

function closesFence(openFence: string, fence: string): boolean {
  return fence[0] === openFence[0] && fence.length >= openFence.length;
}
