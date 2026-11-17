// The bundle a running app serves (task 4.3, ADR-0007), picked once at startup:
// - a deployed app has its built bundle in <app root>/okf-bundle (cds build, task 2.9): served as
//   it is, exactly what the build validated;
// - otherwise (cds watch, cds serve, cds.test) the bundle is generated in memory from the app's
//   model, loaded again with doc comments, plus okf/, with the same code as cds build. Under
//   NODE_ENV=production that gets one warning: the app was deployed without the okf build task.
// Curated files with errors are left out and reported once; startup never fails over them.
// The knowledge lint's warnings (ADR-0012) are logged once for a generated bundle; a built
// bundle was linted by cds build.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { MemoryBundleSource, FileBundleSource, type BundleSource } from "../bundle/source";
import type { MergedBundle } from "../bundle/merge";
import { formatFinding } from "../core/finding";
import { bundleIndex } from "../bundle/indexes";
import { parseConcept, serializeConcept, type Concept } from "../core/concept";
import { lintBundle } from "../core/lint";
import { OKF_VERSION } from "../export/exporter";
import { validateBundle } from "../core/validate";
import type { Csn } from "../export/csn";
import type { Cds } from "../index";
import { namedFindings } from "../build/findings";
import { generateBundle } from "../build/generate";

/** The folder a deployed app holds the built bundle in (ADR-0007). */
export const BUILT_BUNDLE_FOLDER = "okf-bundle";

const INDEX = "index.md";

/** Where warnings go: cds.log("okf") in the app. */
export interface Log {
  warn(message: string): void;
}

/** The bundle to serve, for the app at cds.root with its model cds.model. */
export async function startupBundleSource(
  cds: Cds,
  log: Log,
  env: NodeJS.ProcessEnv,
): Promise<BundleSource> {
  const built = path.join(cds.root, BUILT_BUNDLE_FOLDER);
  if (existsSync(built) && statSync(built).isDirectory()) return new FileBundleSource(built);
  if (env["NODE_ENV"] === "production") {
    log.warn(
      `[okf] ${BUILT_BUNDLE_FOLDER} — is missing, so the bundle was generated at startup.\n` +
        "  Deploy the output of cds build with the okf task (gen/srv/okf-bundle); see ADR-0005 (b).",
    );
  }
  const bundle = await generateBundle(cds, await modelWithDocComments(cds));
  return new MemoryBundleSource(servableFiles(bundle, log));
}

// The app's own model has doc comments only with cdsc.docs, so its sources are loaded again
// with them, as cds build does (ADR-0007: generation and the build see the same model).
async function modelWithDocComments(cds: Cds): Promise<Csn> {
  const sources = (cds.model as unknown as { $sources?: string[] } | undefined)?.$sources;
  // Without $sources (a model not from cds.load), what cds serve itself would load.
  const files = sources ?? cds.resolve("*") ?? "*";
  return (await cds.load(files, { docs: true })) as unknown as Csn;
}

/**
 * The bundle's files without curated ones that have errors, which are reported once, as are the
 * knowledge lint's warnings (ADR-0012), so a developer sees them while working on the notes.
 */
function servableFiles(bundle: MergedBundle, log: Log): Map<string, string> {
  const findings = namedFindings(bundle, validateBundle(bundle.files), "");
  const leftOut = new Set<string>();
  for (const finding of findings.filter((each) => each.severity === "error")) {
    log.warn(formatFinding(finding));
    leftOut.add(finding.file);
  }
  for (const finding of namedFindings({ ...bundle, findings: [] }, lintBundle(bundle.files), "")) {
    log.warn(formatFinding(finding));
  }
  const files = new Map<string, string>();
  for (const file of bundle.files) {
    const isCurated = bundle.curatedPaths.has(file.path);
    if (isCurated && leftOut.has(`okf/${file.path}`)) continue;
    files.set(file.path, file.text);
  }
  return leftOut.size === 0 ? files : withIndexesRebuilt(files, bundle.curatedPaths);
}

/**
 * The generated index.md files built again from the files that are served, after curated files
 * with errors were left out: otherwise they would still list them, and a server couldn't tell
 * them from hand-written indexes (reader-view.ts rebuilds only indexes it recognises). A folder
 * left without concepts loses its generated index.
 */
function withIndexesRebuilt(
  files: Map<string, string>,
  curatedPaths: ReadonlySet<string>,
): Map<string, string> {
  const concepts = conceptsIn(files);
  const rebuilt = new Map<string, string>();
  for (const [path, text] of files) {
    if (!isIndex(path) || curatedPaths.has(path)) {
      rebuilt.set(path, text);
      continue;
    }
    const folder = path === INDEX ? "" : path.slice(0, -`/${INDEX}`.length);
    const hasConcepts = concepts.some((concept) => concept.path.startsWith(`${folder}/`));
    if (folder !== "" && !hasConcepts) continue;
    rebuilt.set(path, serializeConcept(bundleIndex(folder, concepts, OKF_VERSION)));
  }
  return rebuilt;
}

// The concepts an index lists: Markdown files other than index.md and log.md that parse, as the
// merge reads them.
function conceptsIn(files: ReadonlyMap<string, string>): Concept[] {
  const concepts: Concept[] = [];
  for (const [path, text] of files) {
    if (isIndexOrLog(path) || !path.endsWith(".md")) continue;
    try {
      concepts.push(parseConcept(path, text));
    } catch {
      // Left out of the indexes, as the merge leaves it out.
    }
  }
  return concepts;
}

function isIndex(path: string): boolean {
  return path === INDEX || path.endsWith(`/${INDEX}`);
}

function isIndexOrLog(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name === INDEX || name === "log.md";
}
