// BundleSink: how the build writes a bundle (ADR-0007: gen/okf and okf-bundle/).
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { serializeConcept, type Concept } from "../core/concept";
import { assertBundlePath } from "./paths";
import { isMissingFileError, MemoryBundleSource } from "./source";

/** A place to write a bundle to, one file at a time. */
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

  async write(path: string, text: string): Promise<void> {
    assertBundlePath(path);
    this.files.set(path, text);
  }

  /** What was written so far, as a source to read from. */
  toSource(): MemoryBundleSource {
    return new MemoryBundleSource(this.files);
  }
}

/**
 * Writes files into a folder on disk, creating folders as needed. Never writes outside it:
 * a write through a symbolic link that leads elsewhere is rejected.
 */
export class FileBundleSink implements BundleSink {
  constructor(private readonly root: string) {}

  async write(path: string, text: string): Promise<void> {
    assertBundlePath(path);
    await mkdir(this.root, { recursive: true });
    const realRoot = await realpath(this.root);
    const fullPath = join(realRoot, ...path.split("/"));
    await mkdir(dirname(fullPath), { recursive: true });
    await assertInside(realRoot, await realpath(dirname(fullPath)), path);
    await assertNotSymbolicLink(fullPath, path);
    await writeFile(fullPath, text, "utf8");
  }
}

// mkdir follows symbolic links, so a linked folder could end up outside the root.
async function assertInside(realRoot: string, realFolder: string, path: string): Promise<void> {
  const fromRoot = relative(realRoot, realFolder);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw symbolicLinkError(path);
  }
}

// writeFile would follow a symbolic link at the file's own place and write to its target.
async function assertNotSymbolicLink(fullPath: string, path: string): Promise<void> {
  try {
    if ((await lstat(fullPath)).isSymbolicLink()) throw symbolicLinkError(path);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
}

function symbolicLinkError(path: string): Error {
  return new Error(
    `[okf] ${path} — the bundle folder has a symbolic link on this path.\n` +
      "  Remove the link: the bundle is only written inside its own folder.",
  );
}
