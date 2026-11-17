// `cds compile <model> --to okf` (task 2.8, ADR-0005 (a)). Maintainer decisions: without -o it
// prints the tree of paths; with -o it writes the bundle. The clock is SOURCE_DATE_EPOCH when set.
import { readFileSync } from "node:fs";
import path from "node:path";
import { serializeConcept, type Concept } from "../core/concept";
import type { Csn } from "../export/csn";
import { exportModel } from "../export/exporter";
import { defaultLanguageTexts } from "../export/i18n";
import type { Include } from "../export/selection";
import type { Cds } from "../index";
import { clockFrom } from "./clock";

/** One file for CAP's compile writer: its text, and where it goes (ADR-0005 (a)). */
type CompiledFile = [content: string, place: { file: string; suffix: string }];

const INCLUDE_VALUES: readonly string[] = ["services", "all"];

/** Registers the "okf" target, so `cds compile … --to okf` finds it once plugins are loaded. */
export function registerCompileTarget(cds: Cds): void {
  const targets = cds.compile.to as unknown as Record<string, unknown>;
  targets["okf"] = (csn: unknown, options: { dest?: string } = {}) =>
    compileToOkf(cds, csn as Csn, options);
}

/**
 * The bundle for `csn`, as the tree of its paths (one per line) when no output folder is given,
 * else as the files for CAP's writer. CAP's compile command waits for the promise.
 */
async function compileToOkf(
  cds: Cds,
  csn: Csn,
  options: { dest?: string },
): Promise<string | Generator<CompiledFile>> {
  const model = await withDocComments(cds, csn);
  const concepts = exportModel(model, {
    include: includeFrom(cds),
    now: clockFrom(process.env, () => new Date()),
    version: ownVersion(),
    texts: defaultLanguageTexts(cds, model),
  });
  if (options.dest === undefined) return concepts.map((concept) => concept.path).join("\n");
  return compiledFiles(concepts);
}

// CAP's writer takes many files only as a generator (ADR-0005 (a); an array would be one file).
// It appends the suffix to `file`, so the path goes in without its ".md".
function* compiledFiles(concepts: Concept[]): Generator<CompiledFile> {
  for (const concept of concepts) {
    yield [serializeConcept(concept), { file: concept.path.replace(/\.md$/, ""), suffix: ".md" }];
  }
}

/**
 * cds compile hands over the inferred model without doc comments, so it is loaded again from the
 * same files with them, as the build task does (ADR-0007: generation and build see one model).
 */
async function withDocComments(cds: Cds, csn: Csn): Promise<Csn> {
  const sources = (csn as unknown as { $sources?: string[] }).$sources;
  if (sources === undefined) {
    throw new Error(
      "[okf] model — has no $sources, so it can't be loaded again with its doc comments.\n" +
        "  Compile from CDS files, e.g. cds compile srv --to okf.",
    );
  }
  return (await cds.load(sources, { docs: true })) as unknown as Csn;
}

// cds.okf.include: "services" (default) or "all" (task 2.6).
function includeFrom(cds: Cds): Include {
  const okf = (cds.env as unknown as { okf?: { include?: unknown } }).okf;
  const include = okf?.include ?? "services";
  if (typeof include !== "string" || !INCLUDE_VALUES.includes(include)) {
    throw new Error(
      `[okf] cds.okf.include — ${JSON.stringify(include)} is not a known value.\n` +
        '  Use "services" (the default) or "all".',
    );
  }
  return include as Include;
}

// cap-okf's own version, for generated.by. This file is src/build/compile.ts or, built,
// lib/build/compile.js: in both, the package.json is two folders up.
function ownVersion(): string {
  const packageJson = path.join(__dirname, "..", "..", "package.json");
  return (JSON.parse(readFileSync(packageJson, "utf8")) as { version: string }).version;
}
