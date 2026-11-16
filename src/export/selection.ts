// Which definitions get a concept (task 2.6). Pure: the model in, a set of names out.
//
// Maintainer decisions: include "services" (the default) starts at the services and their
// members and follows every reference a concept would show, transitively; "all" exports every
// definition there is a mapper for. @okf: false leaves a definition out either way, and nothing
// is reached through it or through an element, parameter or bound action marked so.
import type { Csn, CsnDefinition, CsnElement } from "./csn";
import { mapperFor, registryKeyOf } from "./mappers/index";
import { serviceMembers } from "./mappers/service";
import { sourceOf } from "./mappers/sources";
import { typeReferences } from "./mappers/visibility";

export type Include = "services" | "all";

/** The names of the definitions to export, for `include`. */
export function selectExported(model: Csn, include: Include): ReadonlySet<string> {
  const candidates = Object.keys(model.definitions).filter((name) =>
    isCandidate(model.definitions[name]!),
  );
  if (include === "all") return new Set(candidates);
  return reachableFromServices(model, new Set(candidates));
}

// A definition can be exported when a mapper exists for its kind and it isn't marked @okf: false.
function isCandidate(definition: CsnDefinition): boolean {
  return definition["@okf"] !== false && mapperFor(registryKeyOf(definition)) !== undefined;
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
 * The definitions a concept for `definition` would refer to: the types and targets of its
 * elements, the parameters and return values of it and its bound actions, its source if it is
 * a projection or view, and its own base type. Anything marked @okf: false is skipped.
 */
function referencesOf(definition: CsnDefinition, model: Csn): string[] {
  const source = sourceOf(definition, model);
  const actions = Object.values(definition.actions ?? {}).filter((each) => each["@okf"] !== false);
  return [
    ...(source === undefined ? [] : [source]),
    ...typeReferences(definition, model),
    ...elementReferences(definition.elements, model),
    ...[definition, ...actions].flatMap((operation) => operationReferences(operation, model)),
  ];
}

function operationReferences(operation: CsnDefinition, model: Csn): string[] {
  const returns = operation.returns;
  return [
    ...elementReferences(operation.params, model),
    ...(returns === undefined ? [] : typeReferences(returns, model)),
    ...elementReferences(returns?.elements ?? returns?.items?.elements, model),
  ];
}

function elementReferences(elements: Record<string, CsnElement> | undefined, model: Csn): string[] {
  return Object.values(elements ?? {})
    .filter((element) => element["@okf"] !== false)
    .flatMap((element) => typeReferences(element, model));
}
