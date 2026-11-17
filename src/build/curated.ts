// Reading the curated okf/ folder (task 3.1, ADR-0007: "Curated files that are bundled").
// FileBundleSource decides which files count: regular files only, no symbolic links, no dotfiles.
import { stat } from "node:fs/promises";
import type { CuratedFile } from "../bundle/merge";
import { FileBundleSource, missingAsUndefined } from "../bundle/source";
import { setupError } from "./errors";

/** The curated folder of an app: okf/ at the project root (ADR-0007). */
export const CURATED_FOLDER = "okf";

/**
 * Every bundled file in `folder`, sorted by path; none when the folder doesn't exist. Markdown
 * files come as text. Other files (e.g. references/q.py, spec §6.3) also keep their exact bytes,
 * and their text is the UTF-8 reading when they are valid UTF-8, else "".
 */
export async function readCuratedFolder(folder: string): Promise<CuratedFile[]> {
  await assertNotAFile(folder);
  const source = new FileBundleSource(folder);
  const files: CuratedFile[] = [];
  for (const bundlePath of await source.list()) {
    const bytes = await source.readBytes(bundlePath);
    // A file removed or replaced by a link since list() is simply not there.
    if (bytes === undefined) continue;
    if (bundlePath.endsWith(".md")) {
      files.push({ path: bundlePath, text: bytes.toString("utf8") });
    } else {
      files.push({ path: bundlePath, text: utf8OrEmpty(bytes), bytes });
    }
  }
  return files;
}

/**
 * Throws an [okf] setup error when the curated folder is a file: a mistake the developer can
 * fix, so a message, not a stack trace. A missing folder is fine: the app has no curated files.
 */
export async function assertNotAFile(folder: string): Promise<void> {
  const found = await stat(folder).catch(missingAsUndefined);
  if (found !== undefined && !found.isDirectory()) {
    throw setupError(
      `[okf] ${CURATED_FOLDER} — is a file, not a folder.\n` +
        `  Rename or remove it; curated concepts go in the ${CURATED_FOLDER}/ folder.`,
    );
  }
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

// ignoreBOM keeps a byte order mark as text, so writing the text gives the same bytes back.
function utf8OrEmpty(bytes: Uint8Array): string {
  return isUtf8(bytes) ? new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) : "";
}
