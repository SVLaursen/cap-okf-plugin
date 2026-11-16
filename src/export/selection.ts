// Which definitions get a concept (task 2.6). Pure: the model in, a set of names out.
//
// Maintainer decisions: include "services" (the default) starts at the services and their
// members and follows every reference a concept would show, transitively; "all" exports every
// definition there is a mapper for. @okf: false leaves a definition out either way, as CAP copies
// it, and nothing is reached through it or through an element, parameter or bound action
// marked so. A definition under one that isn't exported (a service's member, S.Books.texts) is
// left out too, because its own name would name its parent.
//
// The model must be inferred CSN, as cds.load returns it (ADR-0007): CSN compiled for a runtime
// (cds.compile.for.nodejs) adds foreign keys and draft tables that name hidden associations.
import type { Csn, CsnDefinition, CsnElement } from "./csn";
import { mapperFor, registryKeyOf } from "./mappers/index";
import { serviceMembers } from "./mappers/service";
import { sourceOf } from "./mappers/sources";
import { isLeftOut, linkedDefinitions } from "./mappers/visibility";

export type Include = "services" | "all";

/** The names of the definitions to export, for `include`. */
export function selectExported(model: Csn, include: Include): ReadonlySet<string> {
  const candidates = Object.keys(model.definitions).filter((name) =>
    isCandidate(model.definitions[name]!),
  );
  const selected =
    include === "all" ? new Set(candidates) : reachableFromServices(model, new Set(candidates));
  return withoutUnexportedParents(selected, model);
}

// "z.Internal.A" is left out when z.Internal is a definition that isn't selected. Contexts and
// namespaces have no concept of their own, so only definitions with a mapper count as parents.
function withoutUnexportedParents(selected: ReadonlySet<string>, model: Csn): ReadonlySet<string> {
  const isUnexportedParent = (prefix: string) => {
    const parent = model.definitions[prefix];
    return parent !== undefined && hasMapper(parent) && !selected.has(prefix);
  };
  return new Set(
    [...selected].filter((name) => !prefixesOf(name).some((prefix) => isUnexportedParent(prefix))),
  );
}

// "a.b.c" → ["a", "a.b"].
function prefixesOf(name: string): string[] {
  const segments = name.split(".");
  return segments.slice(1).map((_, index) => segments.slice(0, index + 1).join("."));
}

function hasMapper(definition: CsnDefinition): boolean {
  return mapperFor(registryKeyOf(definition)) !== undefined;
}

// A definition can be exported when a mapper exists for its kind and it isn't marked @okf: false.
function isCandidate(definition: CsnDefinition): boolean {
  return definition["@okf"] !== false && hasMapper(definition);
}

// Breadth first from the services and their members, following references; candidates only.
function reachableFromServices(model: Csn, candidates: ReadonlySet<string>): ReadonlySet<string> {
  const seeds = [...candidates]
    .filter((name) => model.definitions[name]!.kind === "service")
    .flatMap((service) => [
      service,
      ...serviceMembers(service, model).map((member) => member.name),
    ]);
  const reached = new Set<string>();
  const queue = seeds.filter((name) => candidates.has(name));
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (reached.has(name)) continue;
    reached.add(name);
    queue.push(
      ...referencesOf(model.definitions[name]!, model).filter((each) => candidates.has(each)),
    );
  }
  return reached;
}

/**
 * The definitions a concept for `definition` would link to, using the same rules as rendering
 * (visibility.ts): its source if it is a projection or view, its own base type, the types and
 * targets of its elements, and the parameters and return values of its bound actions and, for an
 * action or function, of itself. Anything left out by @okf: false is skipped.
 */
function referencesOf(definition: CsnDefinition, model: Csn): string[] {
  const source = sourceOf(definition, model);
  const actions = Object.values(definition.actions ?? {}).filter((each) => !isLeftOut(each, model));
  return [
    ...(source === undefined ? [] : [source]),
    ...linkedDefinitions(definition, model),
    ...elementReferences(definition.elements, model),
    // An unbound action or function has params and returns itself; other kinds have none.
    ...[definition, ...actions].flatMap((operation) => operationReferences(operation, model)),
  ];
}

function operationReferences(operation: CsnDefinition, model: Csn): string[] {
  const returns = operation.returns;
  if (returns !== undefined && isLeftOut(returns, model))
    return elementReferences(operation.params, model);
  return [
    ...elementReferences(operation.params, model),
    ...(returns === undefined ? [] : linkedDefinitions(returns, model)),
    ...elementReferences(returns?.elements ?? returns?.items?.elements, model),
  ];
}

function elementReferences(elements: Record<string, CsnElement> | undefined, model: Csn): string[] {
  return Object.values(elements ?? {})
    .filter((element) => !isLeftOut(element, model))
    .flatMap((element) => linkedDefinitions(element, model));
}
