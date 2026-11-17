// Reading the curated okf/ folder (task 3.1, ADR-0007: "Curated files that are bundled").
// FileBundleSource decides which files count: regular files only, no symbolic links, no dotfiles.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CuratedFile } from "../bundle/merge";
import { FileBundleSource } from "../bundle/source";

/** The curated folder of an app: okf/ at the project root (ADR-0007). */
export const CURATED_FOLDER = "okf";

/**
 * Every bundled file in `folder`, sorted by path; none when the folder doesn't exist. Markdown
 * files come as text. Other files (e.g. references/q.py, spec §6.3) also keep their exact bytes,
 * and their text is the UTF-8 reading when they are valid UTF-8, else "".
 */
export async function readCuratedFolder(folder: string): Promise<CuratedFile[]> {
  const source = new FileBundleSource(folder);
  const files: CuratedFile[] = [];
  for (const bundlePath of await source.list()) {
    if (bundlePath.endsWith(".md")) {
      const text = await source.read(bundlePath);
      // A file removed or replaced by a link since list() is simply not there.
      if (text !== undefined) files.push({ path: bundlePath, text });
    } else {
      const bytes = await readFile(path.join(folder, ...bundlePath.split("/")));
      files.push({ path: bundlePath, text: utf8OrEmpty(bytes), bytes });
    }
  }
  return files;
}

/** Whether a file that isn't Markdown is text that can be written as a string. */
export function isUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function utf8OrEmpty(bytes: Uint8Array): string {
  return isUtf8(bytes) ? new TextDecoder("utf-8").decode(bytes) : "";
}
