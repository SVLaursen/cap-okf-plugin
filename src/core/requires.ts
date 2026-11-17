// Per-role visibility of a concept (ADR-0003, amended by ADR-0012): a concept's frontmatter MAY
// declare `requires:`, one role or a list of roles. A reader sees the concept when they have
// one of them, as CAP decides @requires (`user.is(role)`, pseudo-roles included). Pure.
import { isNonEmptyString } from "./values";

/** The frontmatter key a concept declares its roles with. */
export const REQUIRES_KEY = "requires";

/**
 * The roles a concept requires, or undefined when it requires none (everyone who may read the
 * bundle sees it). A value that isn't a role or a list of roles gives an empty list, which no
 * reader meets: a mistake hides the concept rather than showing it (fail closed).
 */
export function requiresOf(frontmatter: Record<string, unknown> | null): string[] | undefined {
  if (frontmatter === null || !(REQUIRES_KEY in frontmatter)) return undefined;
  const value = frontmatter[REQUIRES_KEY];
  const roles = Array.isArray(value) ? value : [value];
  if (roles.length === 0 || !roles.every(isNonEmptyString)) return [];
  return roles.map((role) => role.trim());
}

/** Whether the frontmatter declares `requires` in a form that isn't a role or a list of roles. */
export function hasInvalidRequires(frontmatter: Record<string, unknown> | null): boolean {
  return requiresOf(frontmatter)?.length === 0;
}

/** Whether a reader with `is` meets `roles`: one of them is enough. */
export function meetsRoles(roles: readonly string[], is: (role: string) => boolean): boolean {
  return roles.some((role) => is(role));
}

/**
 * The text without the `requires` key in its frontmatter: the roles are authorization detail,
 * which only authenticated readers may see (ADR-0003). Works on the lines, so the rest of the
 * frontmatter keeps its exact form. A file without frontmatter or without the key is returned
 * as it is.
 */
export function withoutRequiresKey(text: string): string {
  const lines = text.split("\n");
  if (lines[0]?.replace(/\r$/, "") !== "---") return text;
  const closing = lines.findIndex((line, index) => index > 0 && line.replace(/\r$/, "") === "---");
  if (closing === -1) return text;
  const start = lines.findIndex(
    (line, index) => index > 0 && index < closing && /^requires\s*:/.test(line),
  );
  if (start === -1) return text;
  // The key's value goes with it: indented lines and "- item" lines of a block list.
  let end = start + 1;
  while (end < closing && /^(\s|-(\s|$))/.test(lines[end]!)) end += 1;
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}
