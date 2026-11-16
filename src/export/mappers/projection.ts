// Projections and views: entities a service exposes, built on another definition. They are
// written like entities (type Entity, maintainer decision for task 2.2), with a line naming their
// source. Doc comment and description come from down the source chain (see entityConcept).
import { inlineCode } from "../../core/markdown";
import type { CsnDefinition } from "../csn";
import type { Mapper, MapperContext } from "./context";
import { entityConcept } from "./entity";
import { linkTo } from "./shared";
import { sourceOf } from "./sources";

export const projectionMapper: Mapper = {
  kind: "projection",
  map: (name, definition, context) =>
    entityConcept(name, definition, context, [leadLine(definition, context)]),
};

// "Projection on [Books](/model/sample/bookshop/Books.md)", "View on [Books](…)", or "View" for
// a join or union. A source missing from the model is named, not linked: the link would break.
function leadLine(definition: CsnDefinition, context: MapperContext): string {
  const how = definition.projection === undefined ? "View" : "Projection";
  const source = sourceOf(definition, context.model);
  if (source === undefined) return how;
  const isInModel = context.model.definitions[source] !== undefined;
  return `${how} on ${isInModel ? linkTo(source, context) : inlineCode(source)}`;
}
