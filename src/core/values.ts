// Small checks on values that come out of YAML frontmatter. Pure module.

/**
 * A plain { key: value } object. Lists, plain values and special YAML types such as !!binary
 * (which become Uint8Array) are not.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

/** A string with at least one character that isn't white space. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
