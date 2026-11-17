// The exporter: the whole CDS model in, one OKF bundle out (task 2.7). Pure: the clock and the
// version are injected (CLAUDE.md), so the same inputs always give the same bytes.
import type { Concept } from "../core/concept";
import { generateIndex, generateIndexes } from "../core/index-md";
import type { Csn } from "./csn";
import { defaultMapperContext, type TextLookup } from "./mappers/context";
import { mapperFor, registryKeyOf } from "./mappers/index";
import { selectExported, type Include } from "./selection";

/** The OKF version the bundle conforms to, declared in its root index.md (spec §12). */
export const OKF_VERSION = "0.2";

/** Every generated concept lives below this folder (ADR-0007). */
const MODEL_FOLDER = "model";

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
 * index lists model/ only; task 3.1 merges in the curated files and their folders (ADR-0007).
 */
export function exportModel(model: Csn, options: ExportOptions): Concept[] {
  const exported = selectExported(model, options.include);
  const context = defaultMapperContext(model, options.texts, (name) => exported.has(name));
  const generated = { by: `cap-okf/${options.version}`, at: toSeconds(options.now) };
  const concepts = [...exported].map((name) => {
    const definition = model.definitions[name]!;
    // selectExported only returns definitions that have a mapper.
    const concept = mapperFor(registryKeyOf(definition))!.map(name, definition, context);
    return { ...concept, frontmatter: { ...concept.frontmatter, generated } };
  });
  const indexes = generateIndexes(concepts, MODEL_FOLDER);
  const root = generateIndex("", concepts, { okfVersion: OKF_VERSION });
  return [...concepts, ...indexes, root].sort((a, b) => (a.path < b.path ? -1 : 1));
}

// "2026-11-17T09:30:00Z": UTC, to the second, as the OKF samples write it (spec §5.2).
function toSeconds(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}
