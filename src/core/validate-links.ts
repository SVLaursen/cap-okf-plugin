// W4: links in a Markdown body point at files that are in the bundle (OKF v0.2 §6.1).
// Pure module. A broken link is only a warning: it may name knowledge not yet written.
import type { LocatedConcept } from "./concept";
import { findingOnLine, type Finding } from "./finding";
import { closestPath, extractLinks, resolveLink, type Link } from "./links";

/** The paths in a bundle, for checking where links point. */
export interface BundlePaths {
  /** Every file path, sorted, e.g. "tables/orders.md". */
  files: readonly string[];
  /** Every file path, and every folder that holds a file; "" is the bundle root. */
  existing: ReadonlySet<string>;
}

/** Collects the files and folders of a bundle from its file paths. */
export function bundlePathsOf(filePaths: readonly string[]): BundlePaths {
  const existing = new Set<string>([""]);
  for (const filePath of filePaths) {
    const segments = filePath.split("/");
    segments.forEach((_, index) => existing.add(segments.slice(0, index + 1).join("/")));
  }
  return { files: [...filePaths].sort(), existing };
}

/** W4 findings for the links in one file. */
export function checkLinks(located: LocatedConcept, bundle: BundlePaths): Finding[] {
  return extractLinks(located.concept.body, located.bodyLine).flatMap((link) =>
    checkLink(located, bundle, link),
  );
}

function checkLink(located: LocatedConcept, bundle: BundlePaths, link: Link): Finding[] {
  const resolved = resolveLink(located.concept.path, link.target);
  if (resolved.kind === "external") return [];
  if (resolved.kind === "outside") {
    return [
      findingOnLine(located, link.line, "W4", {
        message: `link target "${link.target}" points outside the bundle`,
        fix: "Link only to files inside the bundle, or use a full URL",
      }),
    ];
  }
  if (bundle.existing.has(resolved.path)) return [];
  const suggestion = closestPath(resolved.path, bundle.files);
  return [
    findingOnLine(located, link.line, "W4", {
      message: `link target "${link.target}" does not exist in the bundle`,
      fix:
        suggestion === undefined
          ? `Create ${resolved.path}, or correct the link`
          : `Did you mean "/${suggestion}"?`,
    }),
  ];
}
