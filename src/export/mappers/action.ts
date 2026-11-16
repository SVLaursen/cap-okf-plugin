// Unbound actions and functions: one concept each, with parameters and the return type.
// Bound ones are listed on their entity instead (see boundActionsSection).
import { escapeBlock, escapeHtml } from "../../core/markdown";
import type { CsnDefinition } from "../csn";
import type { Mapper, MapperContext } from "./context";
import { operationParts } from "./operations";
import { generatedConcept } from "./concept-builder";
import { titleOf } from "./shared";

function operationConcept(type: string) {
  return (name: string, definition: CsnDefinition, context: MapperContext) =>
    generatedConcept(name, definition, context, type, [
      `# ${escapeHtml(titleOf(name, definition, context))}`,
      ...(definition.doc === undefined ? [] : [escapeBlock(definition.doc)]),
      ...operationParts(definition, context),
    ]);
}

export const actionMapper: Mapper = { kind: "action", map: operationConcept("Action") };

export const functionMapper: Mapper = { kind: "function", map: operationConcept("Function") };
