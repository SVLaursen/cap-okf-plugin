// The bundle's hash for bundleInfo() (ADR-0010: a host that stores concepts checks it to see
// whether its copy is stale). Over every file's path and text, in path order, before any
// filtering, so it is the same for every reader of the same bundle.
import { createHash } from "node:crypto";
import { compareText } from "../../core/index-md";

export interface HashedFile {
  path: string;
  text: string;
}

/** "sha256:<64 hex digits>" for `files`, whatever their order. */
export function bundleHash(files: readonly HashedFile[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => compareText(a.path, b.path))) {
    // Lengths before each part, so text can't move between a path and its content unnoticed.
    const text = Buffer.from(file.text, "utf8");
    hash.update(`${Buffer.byteLength(file.path)}:${file.path}:${text.length}:`);
    hash.update(text);
  }
  return `sha256:${hash.digest("hex")}`;
}
