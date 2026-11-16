// R3: the reserved files index.md (OKF v0.2 §8) and log.md (§9) keep their structure.
// Pure module. Only structure is checked; the prose in both files is free.
import type { LocatedConcept } from "./concept";
import { isIsoDate } from "./datetime";
import { findingAtKey, findingOnLine, type Finding } from "./finding";

/** The only key allowed in index.md frontmatter, and only in the bundle-root index.md (§12). */
const ROOT_INDEX_KEY = "okf_version";

const LIST_ITEM = /^\s*[*+-]\s+(.*)$/;
const STARTS_WITH_LINK = /^\[[^\]]*\]\([^)]*\)/;
const LOG_DATE_HEADING = /^##\s+(.*?)\s*$/;
const CODE_FENCE = /^\s*(```|~~~)/;

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
    // YYYY-MM-DD strings sort like the dates they name, so a string comparison is enough.
    if (previousDate !== undefined && date >= previousDate) {
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
    .filter(({ text }) => {
      const item = LIST_ITEM.exec(text)?.[1];
      return item !== undefined && !STARTS_WITH_LINK.test(item);
    })
    .map(({ line }) =>
      findingOnLine(located, line, "R3", {
        message: "list entry does not start with a link",
        fix: "Write the entry as * [Title](relative/path.md) - short description",
      }),
    );
}

function invalidLogDate(located: LocatedConcept, line: number, date: string): Finding {
  return findingOnLine(located, line, "R3", {
    message: `log heading "${date}" is not a valid YYYY-MM-DD date`,
    fix: "Write each ## heading in log.md as an ISO 8601 date, e.g. ## 2026-11-13",
  });
}

function logNotNewestFirst(
  located: LocatedConcept,
  line: number,
  date: string,
  previousDate: string,
): Finding {
  return findingOnLine(located, line, "R3", {
    message: `log heading ${date} comes after ${previousDate}; log.md lists dates newest first, once each`,
    fix: "Move this date group above the older ones, or merge it with the group of the same date",
  });
}

// Lines inside ``` or ~~~ code blocks are examples, not structure, so they are skipped.
function bodyLines(located: LocatedConcept): BodyLine[] {
  const result: BodyLine[] = [];
  let inCodeBlock = false;
  located.concept.body.split("\n").forEach((text, index) => {
    if (CODE_FENCE.test(text)) {
      inCodeBlock = !inCodeBlock;
    } else if (!inCodeBlock) {
      result.push({ text, line: located.bodyLine + index });
    }
  });
  return result;
}
