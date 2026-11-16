// What a concept may show of the model (task 2.6). Maintainer decisions: an element, parameter or
// bound action marked @okf: false is left out, and so is anything that refers to a definition
// that isn't exported. A concept never tells an agent about what it isn't supposed to know.
import type { Csn, CsnDefinition, CsnTyped } from "../csn";
import type { MapperContext } from "./context";

/**
 * The model definitions a typed thing refers to by name: a type defined in the model, an
 * association's target, a composition's aspect, and the same for "many" items.
 */
export function typeReferences(typed: CsnTyped, model: Csn): string[] {
  const own = [typed.type, typed.target, typed.targetAspect].filter(
    (name): name is string => typeof name === "string" && model.definitions[name] !== undefined,
  );
  return typed.items === undefined ? own : [...own, ...typeReferences(typed.items, model)];
}

/** Whether an element, parameter, return value or bound action may be shown in a concept. */
export function isShown(typed: CsnTyped | CsnDefinition, context: MapperContext): boolean {
  if (typed["@okf"] === false) return false;
  return typeReferences(typed, context.model).every((name) => context.isExported(name));
}

/** Only the entries of a record that may be shown, in their order. */
export function shownEntries<T extends CsnTyped>(
  record: Record<string, T> | undefined,
  context: MapperContext,
): [string, T][] {
  return Object.entries(record ?? {}).filter(([, each]) => isShown(each, context));
}
