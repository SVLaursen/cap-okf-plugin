// Where a projection or view gets its data from. CSN doesn't copy doc comments onto
// projections, so mappers follow these sources to find one.
import type { Csn, CsnDefinition } from "../csn";

/**
 * The one definition a projection or view selects from, by name.
 * - "projection on db.Books" → "db.Books";
 * - "projection on db.Books[stock > 0]" (a filter, or parameters) → "db.Books";
 * - "projection on db.Books:author" (a path) → the entity the path leads to, "db.Authors".
 * Undefined when there is no single source (a join or union) or a path can't be followed.
 */
export function sourceOf(definition: CsnDefinition, model: Csn): string | undefined {
  const ref = definition.projection?.from?.ref ?? definition.query?.SELECT?.from?.ref;
  const [first, ...path] = (ref ?? []).map(segmentName);
  let current = first;
  for (const step of path) {
    current = targetOf(current, step, model);
  }
  return current;
}

// A segment is a name, or { id, where } for a filter or { id, args } for parameters; compiled
// CSN always gives one of these two shapes.
function segmentName(segment: unknown): string {
  return typeof segment === "string" ? segment : (segment as { id: string }).id;
}

// The target of association `step` of definition `name`, or undefined.
function targetOf(name: string | undefined, step: string, model: Csn): string | undefined {
  if (name === undefined) return undefined;
  return model.definitions[name]?.elements?.[step]?.target;
}

/**
 * The definition, then its source, that source's source, and so on, as far as they lead.
 * Stops at a definition already in the chain, so a loop can't run forever, and at a source for
 * which `isAllowed` says no, e.g. one that isn't exported (task 2.6).
 */
export function sourceChain(
  definition: CsnDefinition,
  model: Csn,
  isAllowed: (name: string) => boolean,
): CsnDefinition[] {
  const chain = [definition];
  let name = sourceOf(definition, model);
  while (name !== undefined && isAllowed(name)) {
    const source = model.definitions[name];
    if (source === undefined || chain.includes(source)) break;
    chain.push(source);
    name = sourceOf(source, model);
  }
  return chain;
}
