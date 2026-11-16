// BundleSource: how every server and the validator read a bundle (CLAUDE.md, ADR-0007).
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { assertBundlePath, isBundlePath, sortPaths } from "./paths";

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

  /** Throws when a path is not a bundle path. */
  constructor(files: Record<string, string> | ReadonlyMap<string, string>) {
    const entries = files instanceof Map ? [...files] : Object.entries(files);
    for (const [path] of entries) assertBundlePath(path);
    this.files = new Map(entries);
  }

  async list(): Promise<string[]> {
    return sortPaths(this.files.keys());
  }

  async read(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }
}

/**
 * A bundle in a folder on disk, such as gen/okf or a deployed okf-bundle/ (ADR-0007).
 * Only regular files count: symbolic links are not followed and hidden files are skipped,
 * so nothing outside the folder can be listed or read. A missing folder is an empty bundle.
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
    // The real path differs when any part of it is a symbolic link, or, on case-insensitive
    // file systems, when the path is spelt differently from the file: both are not listed.
    if ((await realPathOrUndefined(fullPath)) !== fullPath) return undefined;
    const stats = await lstat(fullPath);
    return stats.isFile() ? await readFile(fullPath, "utf8") : undefined;
  }

  // The root may itself be reached through a symbolic link (e.g. /tmp on macOS); that is fine.
  private realRoot(): Promise<string | undefined> {
    return realPathOrUndefined(this.root);
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

async function realPathOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

/** ENOENT: nothing at that path. ENOTDIR: a part of the path is a file, not a folder. */
export function isMissingFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
