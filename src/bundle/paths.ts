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

/**
 * Throws unless `path` is a bundle path that every file system can store as written.
 * For writers, where a bad path is a programming error. Windows reads "a.md:x" as a hidden
 * stream of a.md and strips a trailing dot or space; generated paths never contain these,
 * because ADR-0007 percent-encodes such characters, so this only guards curated paths.
 */
export function assertWritablePath(path: string): void {
  if (!isBundlePath(path)) {
    throw pathError(
      path,
      "not a bundle path",
      "Use a relative path with / separators and no empty, hidden, . or .. segments",
    );
  }
  const segments = path.split("/");
  if (path.includes(":") || segments.some((segment) => /[. ]$/.test(segment))) {
    throw pathError(
      path,
      "can't be stored on every file system",
      'Leave out ":" and end no file or folder name with a dot or space',
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

/**
 * Remembers the paths written to one bundle and refuses a path (or folder) that differs from
 * an earlier one only in letter case or Unicode form. macOS and Windows treat such names as
 * one file, so on those systems the second write would silently replace the first.
 */
export class PathSpellings {
  /** Folded spelling → the spelling first written. */
  private readonly spellings = new Map<string, string>();

  /** Throws on a clash with an earlier spelling, otherwise remembers `path` and its folders. */
  remember(path: string): void {
    const prefixes = pathPrefixes(path);
    for (const prefix of prefixes) {
      const earlier = this.spellings.get(fold(prefix));
      if (earlier !== undefined && earlier !== prefix) {
        throw pathError(
          path,
          `differs from ${earlier} only in letter case or Unicode form`,
          "Give each file and folder a name that differs in more than that",
        );
      }
    }
    for (const prefix of prefixes) this.spellings.set(fold(prefix), prefix);
  }
}

// "a/b/c.md" → ["a", "a/b", "a/b/c.md"]: the file and each folder it is in.
export function pathPrefixes(path: string): string[] {
  const segments = path.split("/");
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

// Two spellings that fold to the same text name one file on macOS and Windows.
export function fold(path: string): string {
  return path.normalize("NFC").toLowerCase();
}

/** An error in the CLAUDE.md message format, for a bundle path. */
export function pathError(path: string, problem: string, fix: string): Error {
  return new Error(`[okf] ${JSON.stringify(path)} — ${problem}.\n  ${fix}.`);
}
