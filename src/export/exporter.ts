// The exporter: the whole CDS model in, one OKF bundle out (task 2.7). Pure: the clock and the
// version are injected (CLAUDE.md), so the same inputs always give the same bytes. The inputs
// include the order definitions are declared in, which a service's member list follows (2.2);
// cds.load gives the same order for the same sources on every machine.
import type { Concept } from "../core/concept";
import { compareText, generateIndex, generateIndexes } from "../core/index-md";
import type { Csn } from "./csn";
import { defaultMapperContext, type TextLookup } from "./mappers/context";
import { mapperFor, registryKeyOf } from "./mappers/index";
import { MODEL_FOLDER } from "./paths";
import { selectExported, type Include } from "./selection";

/** The OKF version the bundle conforms to, declared in its root index.md (spec §12). */
export const OKF_VERSION = "0.2";

export interface ExportOptions {
  /** Which definitions to export (task 2.6); "services" unless the app says otherwise. */
  include: Include;
  /** When the bundle is generated: written to each concept's generated.at. */
  now: Date;
  /** cap-okf's own version: written to each concept's generated.by. */
  version: string;
  /** i18n texts in the default language (task 2.5); without them, placeholders show their keys. */
  texts?: TextLookup;
}

/**
 * The bundle for `model`: one concept per exported definition, an index.md for model/ and each
 * folder below it, and a root index.md that declares the OKF version. Sorted by path.
 *
 * `model` must be inferred CSN as cds.load returns it (see selection.ts and i18n.ts). The root
 * index lists model/ only; task 3.1 merges in the curated files and their folders (ADR-0007),
 * and also decides what a bundle with nothing exported should contain.
 * Throws an [okf] error when two definitions would share a path (ADR-0007, path rules).
 */
export function exportModel(model: Csn, options: ExportOptions): Concept[] {
  const at = timestampOf(options.now);
  const by = producerOf(options.version);
  const exported = selectExported(model, options.include);
  const context = defaultMapperContext(model, options.texts, (name) => exported.has(name));
  const concepts = [...exported].map((name) => {
    const definition = model.definitions[name]!;
    // selectExported only returns definitions that have a mapper.
    const concept = mapperFor(registryKeyOf(definition))!.map(name, definition, context);
    // A stamp of its own per concept, so changing one later can't change the others.
    return {
      name,
      concept: { ...concept, frontmatter: { ...concept.frontmatter, generated: { by, at } } },
    };
  });
  assertNoCollisions(concepts);
  const generated = concepts.map(({ concept }) => concept);
  const indexes = generateIndexes(generated, MODEL_FOLDER);
  const root = generateIndex("", generated, { okfVersion: OKF_VERSION });
  return [...generated, ...indexes, root].sort((a, b) => compareText(a.path, b.path));
}

// "2026-11-17T09:30:00Z": UTC, to the second, as the OKF samples write it (spec §5.2).
function timestampOf(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new Error("[okf] now — is not a valid date.\n  Pass the time of the export as a Date.");
  }
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// "cap-okf/1.2.3": the actor convention for tools, <producer>/<version> (spec §7).
function producerOf(version: string): string {
  if (typeof version !== "string" || version.trim() === "") {
    throw new Error(
      "[okf] version — is missing or empty.\n  Pass cap-okf's version, e.g. from its package.json.",
    );
  }
  return `cap-okf/${version}`;
}

/**
 * Refuses two definitions at the same path, or at paths, or folders on the way, that differ
 * only in letter case or Unicode form: macOS and Windows would treat them as one (ADR-0007).
 */
function assertNoCollisions(concepts: { name: string; concept: Concept }[]): void {
  // Folded spelling of a path or folder → where it came from.
  const seen = new Map<string, { path: string; name: string }>();
  for (const { name, concept } of concepts) {
    for (const path of pathAndFolders(concept.path)) {
      const earlier = seen.get(fold(path));
      if (earlier === undefined) {
        seen.set(fold(path), { path, name });
      } else if (earlier.path !== path) {
        throw collisionError(name, path, earlier, path !== concept.path);
      } else if (path === concept.path) {
        throw new Error(
          `[okf] ${name} — its path ${path} is also the path of ${earlier.name}.\n` +
            "  Rename one of the definitions, or leave one out with @okf: false.",
        );
      }
    }
  }
}

function collisionError(
  name: string,
  path: string,
  earlier: { path: string; name: string },
  isFolder: boolean,
): Error {
  const what = isFolder ? `the folder ${path}` : `its path ${path}`;
  return new Error(
    `[okf] ${name} — ${what} differs from ${earlier.path} (${earlier.name}) only in letter case.\n` +
      "  Rename one of the definitions, or leave one out with @okf: false.",
  );
}

// "model/a/b.md" → ["model", "model/a", "model/a/b.md"].
function pathAndFolders(path: string): string[] {
  const segments = path.split("/");
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function fold(path: string): string {
  return path.normalize("NFC").toLowerCase();
}
