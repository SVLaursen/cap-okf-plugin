// `cds compile <model> --to okf` (task 2.8, ADR-0005 (a)). Maintainer decisions: without -o it
// prints the tree of paths, one per line; with -o it writes the bundle. The clock is
// SOURCE_DATE_EPOCH when set.
//
// The bundle depends only on the CDS files compiled and on cds.okf.include: the model is loaded
// again from those files, inferred and with doc comments (ADR-0007, one model for generation and
// build). So --for, --flavor and --docs change nothing, and options that would suggest otherwise
// (-l, -s <service>) are refused. With -o, CAP's writer adds and overwrites files but never
// deletes any: compile into an empty folder, or use cds build (task 2.9), which writes gen/okf.
import { serializeConcept, type Concept } from "../core/concept";
import type { Csn } from "../export/csn";
import type { Cds } from "../index";
import { setupError } from "./errors";
import { generateConcepts } from "./generate";

/** One file for CAP's compile writer: its text, and where it goes (ADR-0005 (a)). */
type CompiledFile = [content: string, place: { file: string; suffix: string }];

/** The cds compile options this target reads. */
interface CompileOptions {
  /** The -o folder; without it, the tree is printed. */
  dest?: string;
  /** -l: a language to localize the output to. */
  lang?: unknown;
  /** -s: the service to compile; -o sets "all" by itself. */
  service?: unknown;
}

/** Registers the "okf" target, so `cds compile … --to okf` finds it once plugins are loaded. */
export function registerCompileTarget(cds: Cds): void {
  const targets = cds.compile.to as unknown as Record<string, unknown>;
  targets["okf"] = (csn: unknown, options: CompileOptions = {}) => {
    // Checked before any promise exists: cds-dk passes a returned promise on to later steps,
    // such as -l's localization, without waiting for it, so a rejection would come too late.
    refuseMisleadingOptions(options);
    return compileToOkf(cds, csn as Csn, options);
  };
}

/**
 * The bundle for `csn`, as the tree of its paths (one per line) when no output folder is given,
 * else as the files for CAP's writer. CAP's compile command waits for the promise.
 */
async function compileToOkf(
  cds: Cds,
  csn: Csn,
  options: CompileOptions,
): Promise<string | Generator<CompiledFile>> {
  const model = await withDocComments(cds, csn);
  const concepts = generateConcepts(cds, model);
  if (options.dest === undefined) return concepts.map((concept) => concept.path).join("\n");
  return compiledFiles(concepts);
}

function refuseMisleadingOptions(options: CompileOptions): void {
  // CAP would localize our output after this target, and gets a promise, not text: refused first.
  if (options.lang !== undefined) {
    throw setupError(
      "[okf] -l — the bundle's texts come from cds.i18n.default_language, so -l can't choose one.\n" +
        "  Drop -l, or set cds.i18n.default_language.",
    );
  }
  if (options.service !== undefined && options.service !== "all") {
    throw setupError(
      "[okf] -s — the bundle holds every exported service, so it can't be limited to one.\n" +
        "  Drop -s, or leave services out with @okf: false.",
    );
  }
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
 * same files with them. A model piped in on stdin, or re-sorted with --sort, has no files to load.
 */
async function withDocComments(cds: Cds, csn: Csn): Promise<Csn> {
  const sources = (csn as unknown as { $sources?: string[] }).$sources;
  if (sources === undefined || sources.some((source) => source.startsWith("<"))) {
    throw setupError(
      "[okf] model — wasn't compiled from CDS files on disk (piped in, or re-sorted with --sort), " +
        "so it can't be loaded again with its doc comments.\n" +
        "  Compile CDS files without --sort, e.g. cds compile srv --to okf.",
    );
  }
  return (await cds.load(sources, { docs: true })) as unknown as Csn;
}
