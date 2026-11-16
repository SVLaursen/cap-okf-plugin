// Types: what a type is based on, its values, or its elements.
import { escapeBlock, escapeHtml } from "../../core/markdown";
import type { CsnDefinition } from "../csn";
import type { Mapper, MapperContext } from "./context";
import { elementsSection, enumValues, typeCell } from "./elements";
import { sourceLead } from "./projection";
import { baseFrontmatter, generatedConcept, inheritedDoc, titleOf } from "./shared";

export const typeMapper: Mapper = {
  kind: "type",
  map(name, definition, context) {
    const doc = inheritedDoc(definition, context);
    return generatedConcept(name, baseFrontmatter(name, definition, context, "Type"), [
      `# ${escapeHtml(titleOf(name, definition, context))}`,
      ...sourceLead(definition, context),
      ...(doc === undefined ? [] : [escapeBlock(doc)]),
      ...basedOn(definition, context),
      ...valuesSection(definition),
      ...elementsSection(definition, context),
    ]);
  },
};

// "Based on: `String(10)`", for a type built on another one (not for a structure).
function basedOn(definition: CsnDefinition, context: MapperContext): string[] {
  const hasBase = definition.type !== undefined || definition.items !== undefined;
  return hasBase ? [`Based on: ${typeCell(definition, context)}`] : [];
}

function valuesSection(definition: CsnDefinition): string[] {
  if (definition.enum === undefined) return [];
  return [
    ["## Values", "", ...enumValues(definition.enum).map((value) => `- ${value}`)].join("\n"),
  ];
}
