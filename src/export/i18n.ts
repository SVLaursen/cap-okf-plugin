// The texts that "{i18n>key}" placeholders stand for, from the app's own i18n bundles (task 2.5).
// Uses @sap/cds, handed in by the caller, so the mappers stay free of it.
import type { Cds } from "../index";
import type { Csn } from "./csn";
import type { TextLookup } from "./mappers/context";

/**
 * Texts in `language`, by default the app's cds.i18n.default_language ("en" unless configured).
 * CAP's bundle for the model reads the model's _i18n folders, including those of
 * @sap/cds/common, and falls back to the language-neutral i18n.properties.
 */
export function defaultLanguageTexts(
  cds: Cds,
  model: Csn,
  language: string = cds.env.i18n.default_language,
): TextLookup {
  // bundle4 takes CAP's own CSN type; ours names only the parts the mappers read.
  const bundle = cds.i18n.bundle4(model as unknown as Parameters<Cds["i18n"]["bundle4"]>[0]);
  return (key) => bundle.at(key, language);
}
