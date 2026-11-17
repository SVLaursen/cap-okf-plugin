// The index.md files the merge generates (ADR-0007), in one place, so that a server can build
// the same index again for a reader who may not see every concept (ADR-0003, per-role
// visibility). Pure.
import type { Concept } from "../core/concept";
import { generateIndex } from "../core/index-md";
import { MODEL_FOLDER } from "../export/paths";

/**
 * The generated index.md of `folder` ("" is the bundle root). The root index is an outline: the
 * curated concepts first, each with title, path and description, and the generated concepts
 * folded into one line for model/. Every other folder lists what is directly in it.
 */
export function bundleIndex(
  folder: string,
  concepts: readonly Concept[],
  okfVersion: string,
): Concept {
  if (folder !== "") return generateIndex(folder, concepts);
  return generateIndex("", concepts, { okfVersion, foldFolders: [MODEL_FOLDER] });
}
