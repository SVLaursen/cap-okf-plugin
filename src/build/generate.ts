// What `cds compile --to okf` (task 2.8) and `cds build` (task 2.9) share: both turn a model
// loaded with doc comments into the bundle, with the same settings, so they write the same bytes
// (ADR-0007, one model for generation and build).
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { mergeBundle, type MergedBundle } from "../bundle/merge";
import type { Concept } from "../core/concept";
import type { Csn } from "../export/csn";
import { exportModel, OKF_VERSION } from "../export/exporter";
import { defaultLanguageTexts } from "../export/i18n";
import { INCLUDE_VALUES, type Include } from "../export/selection";
import type { Cds } from "../index";
import { clockFrom } from "./clock";
import { CURATED_FOLDER, readCuratedFolder } from "./curated";
import { setupError } from "./errors";

/**
 * The bundle's concepts for `model`, which must be inferred and loaded with doc comments.
 * Reads cds.okf.include and cds.okf.projectionSources, the clock (SOURCE_DATE_EPOCH when set)
 * and cap-okf's own version.
 */
export function generateConcepts(cds: Cds, model: Csn): Concept[] {
  return exportModel(model, {
    include: includeFrom(cds),
    projectionSources: projectionSourcesFrom(cds),
    now: clockFrom(process.env, () => new Date()),
    version: ownVersion(),
    texts: defaultLanguageTexts(cds, model),
    sourceFile: (file) => fromProjectRoot(cds, file),
  });
}

/**
 * The whole bundle: the concepts generated from `model` merged with the curated files in the
 * app's okf/ folder (task 3.1, ADR-0007). Layout problems come back as findings (L1, L2).
 */
export async function generateBundle(cds: Cds, model: Csn): Promise<MergedBundle> {
  const concepts = generateConcepts(cds, model);
  const curated = await readCuratedFolder(path.join(cds.root, CURATED_FOLDER));
  return mergeBundle(concepts, curated, OKF_VERSION);
}

// CAP records $location relative to cds.root; messages name the file from the project root, as
// the developer sees it (db/schema.cds), also when cds build runs from another folder. Real paths
// on both sides, because the root may be reached through a link (on macOS, /var is /private/var).
function fromProjectRoot(cds: Cds, file: string): string {
  const root = realPathOrSame(cds.root);
  return path.relative(root, realPathOrSame(path.resolve(cds.root, file)));
}

function realPathOrSame(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}

// cds.okf.include: "services" (default) or "all" (task 2.6), from cds.env, so profiles and
// environment variables such as CDS_OKF_INCLUDE apply.
function includeFrom(cds: Cds): Include {
  const okf = (cds.env as unknown as { okf?: { include?: unknown } }).okf;
  const include = okf?.include ?? "services";
  if (!(INCLUDE_VALUES as readonly unknown[]).includes(include)) {
    throw setupError(
      `[okf] cds.okf.include — ${JSON.stringify(include)} is not a known value.\n` +
        '  Use "services" (the default) or "all".',
    );
  }
  return include as Include;
}

// cds.okf.projectionSources: false (default) or true (ADR-0012).
function projectionSourcesFrom(cds: Cds): boolean {
  const okf = (cds.env as unknown as { okf?: { projectionSources?: unknown } }).okf;
  const value = okf?.projectionSources ?? false;
  if (typeof value !== "boolean") {
    throw setupError(
      `[okf] cds.okf.projectionSources — ${JSON.stringify(value)} isn't true or false.\n` +
        "  Use false (the default: one concept per entity as the service exposes it) or true.",
    );
  }
  return value;
}

// cap-okf's own version, for generated.by. This file is src/build/generate.ts or, built,
// lib/build/generate.js: in both, the package.json is two folders up.
function ownVersion(): string {
  const packageJson = path.join(__dirname, "..", "..", "package.json");
  return (JSON.parse(readFileSync(packageJson, "utf8")) as { version: string }).version;
}
