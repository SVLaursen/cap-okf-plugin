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

// "{i18n>Books}": a placeholder is the whole annotation value, as CAP writes them.
const I18N_PLACEHOLDER = /^\{i18n>(.+)\}$/;

/**
 * The context for `model`. Placeholders are looked up in `texts`; without texts, or for a key
 * without a text, a placeholder shows its key.
 */
export function defaultMapperContext(
  model: Csn,
  texts: TextLookup = () => undefined,
): MapperContext {
  return {
    model,
    text(value) {
      const key = I18N_PLACEHOLDER.exec(value)?.[1];
      return key === undefined ? value : (texts(key) ?? key);
    },
  };
}
