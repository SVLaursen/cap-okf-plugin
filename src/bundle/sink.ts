// BundleSink: how the build writes a bundle (ADR-0007: gen/okf and okf-bundle/).
import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serializeConcept, type Concept } from "../core/concept";
import { assertWritablePath, PathSpellings } from "./paths";
import { MemoryBundleSource, missingAsUndefined } from "./source";

/**
 * A place to write a bundle to, one file at a time. Both versions refuse a path that differs
 * from an earlier one only in letter case or Unicode form, so a bundle works on every OS.
 */
export interface BundleSink {
  /** Writes a file's text (UTF-8), replacing it if it exists. Rejects a non-bundle path. */
  write(path: string, text: string): Promise<void>;
}

/** Writes a concept as OKF text at its own path. */
export async function writeConcept(sink: BundleSink, concept: Concept): Promise<void> {
  await sink.write(concept.path, serializeConcept(concept));
}

/** Collects written files in memory, e.g. to serve a bundle generated at startup. */
export class MemoryBundleSink implements BundleSink {
  private readonly files = new Map<string, string>();
  private readonly spellings = new PathSpellings();

  async write(path: string, text: string): Promise<void> {
    assertWritablePath(path);
    this.spellings.remember(path);
    this.files.set(path, text);
  }

  /** A snapshot of what was written so far: later writes don't show up in it. */
  toSource(): MemoryBundleSource {
    return new MemoryBundleSource(this.files);
  }
}

/**
 * Writes files into a folder on disk. Never writes outside it, and never changes a file
 * outside it:
 * - folders are created one at a time, and a symbolic link on the way is refused;
 * - a file is written next to its target under a hidden name, then renamed over it. Renaming
 *   replaces a symbolic or hard link instead of writing through it, and a reader sees either
 *   the old file or the new one, never half of one.
 */
export class FileBundleSink implements BundleSink {
  private readonly spellings = new PathSpellings();

  constructor(private readonly root: string) {}

  async write(path: string, text: string): Promise<void> {
    assertWritablePath(path);
    this.spellings.remember(path);
    await mkdir(this.root, { recursive: true });
    const segments = path.split("/");
    const folder = await this.makeFolders(segments.slice(0, -1), path);
    await replaceFile(join(folder, segments.at(-1)!), text);
  }

  // Creates each missing folder below the root, refusing links and files on the way.
  private async makeFolders(folderSegments: string[], path: string): Promise<string> {
    let folder = await realpath(this.root);
    for (const segment of folderSegments) {
      folder = join(folder, segment);
      const stats: Stats | undefined = await lstat(folder).catch(missingAsUndefined);
      if (stats === undefined) {
        await mkdir(folder);
      } else if (stats.isSymbolicLink()) {
        throw this.diskError(
          folder,
          path,
          "is a symbolic link",
          "Remove the link: the bundle is only written inside its own folder",
        );
      } else if (!stats.isDirectory()) {
        throw this.diskError(
          folder,
          path,
          "is a file, not a folder",
          "Remove the file, or rename the folder in the bundle",
        );
      }
    }
    return folder;
  }

  private diskError(onDisk: string, path: string, problem: string, fix: string): Error {
    return new Error(`[okf] ${onDisk} — ${problem}, so ${path} can't be written.\n  ${fix}.`);
  }
}

async function replaceFile(fullPath: string, text: string): Promise<void> {
  // A hidden name: a FileBundleSource listing the folder meanwhile skips it.
  const temporaryPath = join(fullPath, "..", `.okf-${randomUUID()}.tmp`);
  await writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporaryPath, fullPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
