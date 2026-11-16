// What a concept may show of the model (task 2.6), shared by selection and rendering so the two
// can't disagree. Maintainer decisions:
// - a concept never mentions a definition that isn't exported (as cap-mcp v2 and CAP do);
// - @okf: false leaves out a definition, element, parameter or bound action, and follows CAP's
//   copying of annotations (an aspect's or source's @okf: false reaches what uses it);
// - an element, parameter or return value of an excluded *type* stays, shown with its built-in
//   type, because it exists on the wire; an association to an excluded entity is left out.
import type { Csn, CsnDefinition, CsnTyped } from "../csn";
import type { MapperContext } from "./context";

/**
 * The definition an association or composition points at, as concepts show it: the target, or
 * for a composition of an aspect that has no generated target, the aspect.
 */
export function relationTarget(typed: CsnTyped): string | undefined {
  if (typed.target !== undefined) return typed.target;
  return typeof typed.targetAspect === "string" ? typed.targetAspect : undefined;
}

/**
 * Whether @okf: false leaves this element, parameter, return value or bound action out. CAP also
 * copies @okf: false from an excluded type onto everything of that type; there it only means
 * "don't name the type", so the thing itself stays (see typeCell).
 */
export function isLeftOut(typed: CsnTyped, model: Csn): boolean {
  if (typed["@okf"] !== false) return false;
  const type = typed.type;
  const isCopiedFromType = typeof type === "string" && model.definitions[type]?.["@okf"] === false;
  return !isCopiedFromType;
}

/** Whether an element, parameter, return value or bound action may be shown in a concept. */
export function isShown(typed: CsnTyped, context: MapperContext): boolean {
  if (isLeftOut(typed, context.model)) return false;
  const target = relationTarget(typed.items ?? typed);
  return target === undefined || context.isExported(target);
}

/** Only the entries of a record that may be shown, in their order. */
export function shownEntries<T extends CsnTyped>(
  record: Record<string, T> | undefined,
  context: MapperContext,
): [string, T][] {
  return Object.entries(record ?? {}).filter(([, each]) => isShown(each, context));
}

/**
 * The definitions a concept may link to through a typed thing, for reachability: the relation
 * target, else a type defined in the model (followed through "type of"), also for "many" items.
 */
export function linkedDefinitions(typed: CsnTyped, model: Csn): string[] {
  const target = relationTarget(typed);
  if (target !== undefined) return model.definitions[target] === undefined ? [] : [target];
  if (typed.items !== undefined) return linkedDefinitions(typed.items, model);
  const type = typed.type;
  if (type === undefined) return [];
  if (typeof type !== "string") {
    const referenced = elementOfRef(type.ref, model);
    return referenced === undefined ? [] : linkedDefinitions(referenced, model);
  }
  return model.definitions[type] === undefined ? [] : [type];
}

/**
 * The element a "type of Orders:status" reference points at: ref ["x.Orders", "status"].
 * Undefined when the model doesn't have it.
 */
export function elementOfRef(ref: string[], model: Csn): CsnTyped | undefined {
  const [definitionName, ...path] = ref;
  let current: CsnTyped | CsnDefinition | undefined = model.definitions[definitionName!];
  for (const segment of path) {
    current = current?.elements?.[segment];
  }
  return current;
}
