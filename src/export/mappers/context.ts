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
   * Turns an annotation text into display text. "{i18n>Books}" placeholders are resolved in
   * task 2.5; until then, and for keys without a text, a placeholder becomes its key.
   */
  text(value: string): string;
}

// "{i18n>Books}" → "Books"; any other text stays as it is.
const I18N_PLACEHOLDER = /^\{i18n>(.+)\}$/;

/** The context for `model`, with placeholders shown as their keys. */
export function defaultMapperContext(model: Csn): MapperContext {
  return { model, text: (value) => I18N_PLACEHOLDER.exec(value)?.[1] ?? value };
}
