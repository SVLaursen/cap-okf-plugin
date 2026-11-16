// BundleSource: how every server and the validator read a bundle (CLAUDE.md, ADR-0007).
import { constants } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { isBundlePath, pathError, sortPaths } from "./paths";

/** A bundle to read from: an in-memory one, a folder on disk, later a database. */
export interface BundleSource {
  /** Every file in the bundle, as bundle paths (e.g. "guides/ordering.md"), sorted. */
  list(): Promise<string[]>;
  /** A file's text (UTF-8), or undefined when the path is not one that list() returns. */
  read(path: string): Promise<string | undefined>;
}

/** A bundle held in memory, e.g. one generated from the model at startup. */
export class MemoryBundleSource implements BundleSource {
  private readonly files: ReadonlyMap<string, string>;

  /** Keeps its own copy of `files`. Throws when a path is not a bundle path. */
  constructor(files: Record<string, string> | ReadonlyMap<string, string>) {
    const entries = files instanceof Map ? [...files] : Object.entries(files);
    for (const [path] of entries) {
      if (!isBundlePath(path)) {
        throw pathError(
          path,
          "not a bundle path",
          "Use a relative path with / separators and no empty, hidden, . or .. segments",
        );
      }
    }
    this.files = new Map(entries);
  }

  async list(): Promise<string[]> {
    return sortPaths(this.files.keys());
  }

  async read(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }
}

// Open for reading, but fail on a symbolic link instead of following it (where the OS knows
// O_NOFOLLOW; Windows doesn't, and there the realpath check below catches links).
const READ_NO_FOLLOW = constants.O_RDONLY | constants.O_NOFOLLOW;

/**
 * A bundle in a folder on disk, such as gen/okf or a deployed okf-bundle/ (ADR-0007).
 * Only regular files count: symbolic links are not followed and hidden files are skipped,
 * so nothing outside the folder can be listed or read. A missing folder is an empty bundle.
 * Other problems with the folder (a file instead of a folder, a link loop, no permission)
 * are errors, so a broken setup is noticed instead of looking like an empty bundle.
 */
export class FileBundleSource implements BundleSource {
  constructor(private readonly root: string) {}

  async list(): Promise<string[]> {
    const realRoot = await this.realRoot();
    if (realRoot === undefined) return [];
    return sortPaths(await listFiles(realRoot, ""));
  }

  async read(path: string): Promise<string | undefined> {
    if (!isBundlePath(path)) return undefined;
    const realRoot = await this.realRoot();
    if (realRoot === undefined) return undefined;
    const fullPath = join(realRoot, ...path.split("/"));
    // A file deleted or replaced by a link while we look at it is simply not there.
    const file = await open(fullPath, READ_NO_FOLLOW).catch(notReadableAsUndefined);
    if (file === undefined) return undefined;
    try {
      // The real path differs when a folder on the way is a symbolic link, or, on
      // case-insensitive file systems, when the path is spelt differently from the file.
      const isListed = (await realpath(fullPath).catch(missingAsUndefined)) === fullPath;
      return isListed && (await file.stat()).isFile() ? await file.readFile("utf8") : undefined;
    } finally {
      await file.close();
    }
  }

  // The root may itself be reached through a symbolic link (e.g. /tmp on macOS); that is fine.
  private async realRoot(): Promise<string | undefined> {
    const realRoot = await realpath(this.root).catch(missingAsUndefined);
    if (realRoot !== undefined && !(await stat(realRoot)).isDirectory()) {
      throw new Error(
        `[okf] ${this.root} — the bundle folder is not a folder.\n` +
          "  Point the bundle at a folder, or remove the file that has its name.",
      );
    }
    return realRoot;
  }
}

// Walks a folder. Dirent types come from lstat, so a symbolic link is neither file nor folder.
async function listFiles(folder: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (!isBundlePath(path)) continue;
    if (entry.isFile()) paths.push(path);
    if (entry.isDirectory()) paths.push(...(await listFiles(join(folder, entry.name), `${path}/`)));
  }
  return paths;
}

/**
 * For .catch(): "nothing there" becomes undefined, anything else is thrown again.
 * ENOENT: nothing at that path. ENOTDIR: a part of the path is a file, not a folder.
 */
export function missingAsUndefined(error: unknown): undefined {
  if (hasCode(error, "ENOENT") || hasCode(error, "ENOTDIR")) return undefined;
  throw error;
}

// Like missingAsUndefined, and ELOOP too: the file is a symbolic link, which O_NOFOLLOW refuses
// to open. Only for opening a file; a link loop at the root stays an error.
function notReadableAsUndefined(error: unknown): undefined {
  if (hasCode(error, "ELOOP")) return undefined;
  return missingAsUndefined(error);
}

function hasCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === code;
}
