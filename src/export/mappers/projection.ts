// Projections and views: entities a service exposes, built on another definition. They are
// written like entities (type Entity, maintainer decision for task 2.2), with a link to their
// source. CSN doesn't copy doc comments onto projections, so the source's are used instead.
import { escapeHtml, escapeLinkText } from "../../core/markdown";
import type { CsnDefinition } from "../csn";
import { conceptLinkFor } from "../paths";
import type { Mapper, MapperContext } from "./context";
import { entityConcept } from "./entity";
import { descriptionOf, shortName, titleOf } from "./shared";

export const projectionMapper: Mapper = {
  kind: "projection",
  map(name, definition, context) {
    return entityConcept(name, definition, context, {
      lead: [leadLine(definition, context)],
      fallback: sourceDefinitionOf(definition, context) ?? definition,
    });
  },
};

/**
 * The one definition a projection or view selects from, by name. Undefined for a view on a join
 * or on a subquery, which has no single source.
 */
export function sourceOf(definition: CsnDefinition): string | undefined {
  const ref = definition.projection?.from?.ref ?? definition.query?.SELECT?.from?.ref;
  const first = ref?.[0];
  return typeof first === "string" ? first : undefined;
}

function sourceDefinitionOf(
  definition: CsnDefinition,
  context: MapperContext,
): CsnDefinition | undefined {
  const source = sourceOf(definition);
  return source === undefined ? undefined : context.model.definitions[source];
}

/**
 * A definition's description, or, for a projection or view without one, its source's. For any
 * other definition this is just its own description.
 */
export function descriptionOrSources(
  definition: CsnDefinition,
  context: MapperContext,
): string | undefined {
  const sourceDefinition = sourceDefinitionOf(definition, context);
  return (
    descriptionOf(definition, context) ??
    (sourceDefinition === undefined ? undefined : descriptionOf(sourceDefinition, context))
  );
}

// "Projection on [Books](/model/sample/bookshop/Books.md)", "View on [Books](…)", or "View".
function leadLine(definition: CsnDefinition, context: MapperContext): string {
  const how = definition.projection === undefined ? "View" : "Projection";
  const source = sourceOf(definition);
  if (source === undefined) return how;
  const sourceDefinition = context.model.definitions[source];
  const title = sourceDefinition ? titleOf(source, sourceDefinition, context) : shortName(source);
  return `${how} on [${escapeLinkText(escapeHtml(title))}](${conceptLinkFor(source)})`;
}
