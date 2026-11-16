// Unbound actions and functions: one concept each, with parameters and the return type.
// Bound ones are listed on their entity instead (see boundActionsSection).
import { escapeHtml } from "../../core/markdown";
import type { CsnDefinition } from "../csn";
import type { Mapper, MapperContext } from "./context";
import { OPERATION_TYPES, operationParts } from "./operations";
import { baseFrontmatter, generatedConcept, titleOf } from "./shared";

function operationConcept(type: string) {
  return (name: string, definition: CsnDefinition, context: MapperContext) =>
    generatedConcept(name, baseFrontmatter(name, definition, context, type), [
      `# ${escapeHtml(titleOf(name, definition, context))}`,
      ...(definition.doc === undefined ? [] : [escapeHtml(definition.doc)]),
      ...operationParts(definition, context),
    ]);
}

export const actionMapper: Mapper = {
  kind: "action",
  map: operationConcept(OPERATION_TYPES["action"]!),
};

export const functionMapper: Mapper = {
  kind: "function",
  map: operationConcept(OPERATION_TYPES["function"]!),
};
