// How cds build and cds compile report findings (tasks 2.9, 3.1): errors fail the build,
// warnings never do (ADR-0007). Each message names the file the developer should open.
import type { MergedBundle } from "../bundle/merge";
import { formatFinding, type Finding } from "../core/finding";
import { CURATED_FOLDER } from "./curated";

/** The findings as build messages, errors apart from warnings. */
export function buildMessagesOf(findings: readonly Finding[]): {
  errors: string[];
  warnings: string[];
} {
  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.filter((finding) => finding.severity === "warning");
  return { errors: errors.map(formatFinding), warnings: warnings.map(formatFinding) };
}

/**
 * The merge's layout findings and the validator's findings, each naming the file to open:
 * - layout and marker findings (L1–L4) are always about a curated file, also one left out:
 *   okf/<path>;
 * - a validator finding names okf/<path> for a curated file, else <bundle folder>/<path>
 *   (just <path> when `bundleFolder` is "").
 */
export function namedFindings(
  bundle: MergedBundle,
  validation: readonly Finding[],
  bundleFolder: string,
): Finding[] {
  const inCuratedFolder = (bundlePath: string) => `${CURATED_FOLDER}/${bundlePath}`;
  const inBundle = (bundlePath: string) => {
    if (bundle.curatedPaths.has(bundlePath)) return inCuratedFolder(bundlePath);
    return bundleFolder === "" ? bundlePath : `${bundleFolder}/${bundlePath}`;
  };
  return [
    ...bundle.findings.map((finding) => ({ ...finding, file: inCuratedFolder(finding.file) })),
    ...validation.map((finding) => ({ ...finding, file: inBundle(finding.file) })),
  ];
}
