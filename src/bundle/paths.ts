// Bundle paths: what a path inside a bundle may look like. Pure.

/**
 * A bundle path is relative, uses / between segments, and has no empty, "." or ".." segment.
 * Segments starting with "." (dotfiles, .git) are hidden and never part of a bundle
 * (ADR-0007). Backslashes and NUL characters are refused: they are separators or terminators
 * on some systems, so they could lead out of the bundle.
 */
export function isBundlePath(path: string): boolean {
  if (path === "" || path.includes("\\") || path.includes("\0")) return false;
  return path.split("/").every((segment) => segment !== "" && !segment.startsWith("."));
}

/** Throws unless `path` is a bundle path. For writers, where a bad path is a programming error. */
export function assertBundlePath(path: string): void {
  if (!isBundlePath(path)) {
    throw new Error(
      `[okf] ${JSON.stringify(path)} is not a bundle path.\n` +
        "  Use a relative path with / separators and no empty, hidden, . or .. segments.",
    );
  }
}

/**
 * Sorts paths by UTF-16 code unit, not by locale, so a listing is the same on every machine.
 * Uppercase comes before lowercase: "Zeta.md" before "guides/a.md".
 */
export function sortPaths(paths: Iterable<string>): string[] {
  return [...paths].sort();
}
