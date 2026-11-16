// Entities: one concept per entity, with its elements and its associations as links.
// Authorization annotations are left out on purpose: they only go into the marked section that
// task 2.4 adds (ADR-0003). Every text from the model is escaped before it goes into Markdown.
import type { Concept } from "../../core/concept";
import { escapeHtml, inlineCode, oneLine } from "../../core/markdown";
import type { CsnDefinition, CsnElement } from "../csn";
import type { Mapper, MapperContext } from "./context";
import { elementsTable, isAssociation } from "./elements";
import { boundActionsSection } from "./operations";
import { baseFrontmatter, generatedConcept, inheritedDoc, linkTo, titleOf } from "./shared";

export const entityMapper: Mapper = {
  kind: "entity",
  map: (name, definition, context) => entityConcept(name, definition, context),
};

/**
 * An entity concept: also the base of projections and views, which pass their own OKF `type`
 * and `lead` lines under the heading (e.g. "Projection on [Books](…)"). Doc comment and
 * description each come from the nearest definition down the source chain that has one, so a
 * projection with its own @description can still show its source's doc comment.
 */
export function entityConcept(
  name: string,
  definition: CsnDefinition,
  context: MapperContext,
  type = "Entity",
  lead: string[] = [],
): Concept {
  const sections = [
    `# ${escapeHtml(titleOf(name, definition, context))}`,
    ...lead,
    ...docSection(inheritedDoc(definition, context)),
    ...includesSection(definition),
    ...elementsSection(definition, context),
    ...associationsSection(definition, context),
    ...boundActionsSection(definition, context),
  ];
  const frontmatter = baseFrontmatter(name, definition, context, type);
  return generatedConcept(name, frontmatter, sections);
}

// The doc comment keeps its own lines and Markdown, but no HTML (see escapeHtml).
function docSection(doc: string | undefined): string[] {
  return doc === undefined ? [] : [escapeHtml(doc)];
}

function includesSection(definition: CsnDefinition): string[] {
  const includes = definition.includes ?? [];
  if (includes.length === 0) return [];
  return [`Includes: ${includes.map((name) => inlineCode(oneLine(name))).join(", ")}`];
}

// Associations and compositions are listed in their own section, with links.
function elementsSection(definition: CsnDefinition, context: MapperContext): string[] {
  const table = elementsTable("Element", definition.elements ?? {}, context);
  return table === undefined ? [] : [`## Elements\n\n${table}`];
}

function associationsSection(definition: CsnDefinition, context: MapperContext): string[] {
  const lines = Object.entries(definition.elements ?? {})
    .filter(([, element]) => isAssociation(element))
    .map(([name, element]) => associationLine(name, element, context));
  if (lines.length === 0) return [];
  return [["## Associations", "", ...lines].join("\n")];
}

// "- `author` → [Authors](/model/sample/bookshop/Authors.md) (to one)"
function associationLine(name: string, element: CsnElement, context: MapperContext): string {
  const link = linkTo(element.target!, context);
  const details = [
    // A key association is part of the primary key, e.g. up_ in a "Composition of many { … }".
    ...(element.key ? ["key"] : []),
    ...(element.type === "cds.Composition" ? ["composition"] : []),
    toManyOrOne(element),
  ];
  return `- ${inlineCode(oneLine(name))} → ${link} (${details.join(", ")})`;
}

function toManyOrOne(element: CsnElement): string {
  const max = element.cardinality?.max;
  return max === "*" || (typeof max === "number" && max > 1) ? "to many" : "to one";
}
