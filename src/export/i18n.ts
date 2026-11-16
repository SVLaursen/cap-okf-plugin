// The texts that "{i18n>key}" placeholders stand for, from the app's own i18n bundles (task 2.5).
// Uses @sap/cds, handed in by the caller, so the mappers stay free of it.
import type { Cds } from "../index";
import type { Csn } from "./csn";
import type { TextLookup } from "./mappers/context";

/** CAP's own CSN type, which cds.i18n.bundle4 takes; ours names only what the mappers read. */
type CapCsn = Parameters<Cds["i18n"]["bundle4"]>[0];

/**
 * Texts in `language`, by default the app's cds.i18n.default_language ("en" unless configured).
 * CAP's bundle for the model reads the _i18n folders next to the model's sources, including
 * those of @sap/cds/common, and falls back to the language-neutral i18n.properties.
 *
 * - The model must come from cds.load or cds.compile, which record its source files in $sources.
 *   Without them, CAP would read the global cds.model and cds.root instead, so the texts would
 *   depend on whatever app is loaded; that is refused.
 * - CAP caches the bundle on the model and the folder lists per process, so a long-running
 *   process (cds watch, a server) only sees new _i18n files after a restart.
 * - Texts with {0}-style arguments are shown as written: no arguments are passed.
 */
export function defaultLanguageTexts(
  cds: Cds,
  model: Csn,
  language: string = cds.env.i18n.default_language,
): TextLookup {
  if (!("$sources" in model)) {
    throw new Error(
      "[okf] model — has no $sources, so its i18n folders can't be found.\n" +
        "  Pass the model as cds.load or cds.compile returns it, without copying it.",
    );
  }
  const bundle = cds.i18n.bundle4(model as unknown as CapCsn);
  return (key) => bundle.at(key, language);
}
