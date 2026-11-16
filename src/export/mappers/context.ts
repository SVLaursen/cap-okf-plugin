// What every mapper gets besides the definition it maps.
import type { Concept } from "../../core/concept";
import type { Csn, CsnDefinition } from "../csn";

/** Turns one CSN definition of its kind into one OKF concept. */
export interface Mapper {
  /** The CSN kind this mapper handles, e.g. "entity". */
  kind: string;
  map(name: string, definition: CsnDefinition, context: MapperContext): Concept;
}

export interface MapperContext {
  /** The whole model, e.g. to look up an association's target. */
  model: Csn;
  /**
   * Turns an annotation text into display text: "{i18n>Books}" becomes the text for "Books" in
   * the default language, or the key itself when there is no text (task 2.5).
   */
  text(value: string): string;
}

/** A text for an i18n key in one language, or undefined when the bundle has none. */
export type TextLookup = (key: string) => string | undefined;

// "{i18n>Books}", anywhere in a value and as often as it appears: the same pattern as CAP's
// cds.localize, so a key never runs past its closing brace.
const I18N_PLACEHOLDERS = /\{i18n>([^}]+)\}/g;

/**
 * The context for `model`. Each placeholder is looked up in `texts`; without texts, or for a key
 * whose text is missing or empty, it shows its key (as CAP's cds.localize does).
 */
export function defaultMapperContext(
  model: Csn,
  texts: TextLookup = () => undefined,
): MapperContext {
  return {
    model,
    text: (value) =>
      value.replace(I18N_PLACEHOLDERS, (_placeholder, key: string) => texts(key) || key),
  };
}
