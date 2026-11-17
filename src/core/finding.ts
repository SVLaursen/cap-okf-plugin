// Findings: what the validator reports about a bundle. Pure module.
import type { KeyPath, LocatedConcept } from "./concept";

/**
 * Errors break OKF v0.2 conformance (§11):
 * - R1 a non-reserved file has valid frontmatter;
 * - R2 the frontmatter has a non-empty `type`;
 * - R3 index.md and log.md keep their structure (§8, §9).
 *
 * Warnings are soft guidance that consumers must not reject a bundle for:
 * - W1 a recommended field (title, description) is missing (§4.1);
 * - W2 a v0.2 field has the wrong shape (§5);
 * - W3 a deprecated v0.1 field is used (§13.1);
 * - W4 a link points at a file that is not in the bundle (§6.1: consumers must tolerate it).
 *
 * cap-okf's own layout rules for merging the curated okf/ folder (ADR-0007), not spec rules:
 * - L1 (error) a curated file is in model/, which belongs to the generator, or its path differs
 *   from another only in letter case or Unicode form;
 * - L2 (warning) a curated root index.md doesn't link to model/.
 *
 * M1 (error, thrown by the exporter as ModelClashError, not a Finding): two CDS definitions
 * whose concepts would share a path, or paths that differ only in letter case or Unicode form.
 */
export type Rule = "R1" | "R2" | "R3" | "W1" | "W2" | "W3" | "W4" | "L1" | "L2";

export type Severity = "error" | "warning";

/** One problem in one file. The same fields as ConceptParseError, so both report alike. */
export interface Finding {
  /** Bundle-relative path. */
  file: string;
  /** File line, counting from 1. */
  line: number;
  rule: Rule;
  severity: Severity;
  /** What is wrong. */
  message: string;
  /** How to fix it. */
  fix: string;
}

const SEVERITY: Record<Rule, Severity> = {
  R1: "error",
  R2: "error",
  R3: "error",
  W1: "warning",
  W2: "warning",
  W3: "warning",
  W4: "warning",
  L1: "error",
  L2: "warning",
};

/** The text of a finding: what is wrong and how to fix it. */
export interface Problem {
  message: string;
  fix: string;
}

/** A finding in `located`'s file, on a given line. */
export function findingOnLine(
  located: LocatedConcept,
  line: number,
  rule: Rule,
  problem: Problem,
): Finding {
  return findingAt(located.concept.path, line, rule, problem);
}

/** A finding in the file at bundle path `file`, on a given line. */
export function findingAt(file: string, line: number, rule: Rule, problem: Problem): Finding {
  return { file, line, rule, severity: SEVERITY[rule], ...problem };
}

/** A finding on the line of a frontmatter key, or of its nearest parent when the key is missing. */
export function findingAtKey(
  located: LocatedConcept,
  keyPath: KeyPath,
  rule: Rule,
  problem: Problem,
): Finding {
  return findingOnLine(located, located.lineOf(keyPath), rule, problem);
}

/** How a key path is written in messages, e.g. sources[1].id. */
export function keyName(keyPath: KeyPath): string {
  return keyPath
    .map((key, index) => {
      if (typeof key === "number") return `[${key}]`;
      return index === 0 ? key : `.${key}`;
    })
    .join("");
}

/**
 * A finding in the [okf] message style: "[okf] <file>:<line> — <what is wrong> (<rule>)." and,
 * indented on the next line, "<how to fix it>."
 */
export function formatFinding(finding: Finding): string {
  return `[okf] ${finding.file}:${finding.line} — ${finding.message} (${finding.rule}).\n  ${finding.fix}.`;
}
