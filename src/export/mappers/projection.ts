// Projections and views: entities a service exposes, built on another definition. They are
// written like entities, but say what they are: type Projection ("as projection on") or type
// View ("as select from"), a maintainer decision for task 2.2, with a line naming their source.
// Doc comment and description come from down the source chain (see entityConcept).
import { inlineCode } from "../../core/markdown";
import type { CsnDefinition } from "../csn";
import type { Mapper, MapperContext } from "./context";
import { entityConcept } from "./entity";
import { linkTo } from "./shared";
import { sourceOf } from "./sources";

export const projectionMapper: Mapper = {
  kind: "projection",
  map(name, definition, context) {
    const type = definition.projection === undefined ? "View" : "Projection";
    return entityConcept(name, definition, context, type, sourceLead(definition, context));
  },
};

/**
 * The line naming what a definition is built on, for projections and views and also for events
 * and types declared "as projection on …". Empty for anything else.
 */
export function sourceLead(definition: CsnDefinition, context: MapperContext): string[] {
  if (definition.projection === undefined && definition.query === undefined) return [];
  const how = definition.projection === undefined ? "View" : "Projection";
  return [leadLine(how, definition, context)];
}

// "Projection on [Books](/model/sample/bookshop/Books.md)", "View on [Books](…)", or "View" for
// a join or union. A source missing from the model is named, not linked: the link would break.
function leadLine(how: string, definition: CsnDefinition, context: MapperContext): string {
  const source = sourceOf(definition, context.model);
  if (source === undefined) return how;
  const isInModel = context.model.definitions[source] !== undefined;
  return `${how} on ${isInModel ? linkTo(source, context) : inlineCode(source)}`;
}
