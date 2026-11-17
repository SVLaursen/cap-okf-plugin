// How the build reports the validator's findings (task 2.9): errors fail the build, warnings
// never do (ADR-0007).
import { formatFinding, type Finding } from "../core/finding";

/** The findings as build messages, errors apart from warnings. */
export function buildMessagesOf(findings: readonly Finding[]): {
  errors: string[];
  warnings: string[];
} {
  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.filter((finding) => finding.severity === "warning");
  return { errors: errors.map(formatFinding), warnings: warnings.map(formatFinding) };
}
