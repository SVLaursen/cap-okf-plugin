// Entities: one concept per entity, with its elements and its associations as links.
// Authorization annotations are left out on purpose: they only go into the marked section that
// task 2.4 adds (ADR-0003). Every text from the model is escaped before it goes into Markdown.
import type { Concept } from "../../core/concept";
import { escapeBlock, escapeHtml, inlineCode, oneLine } from "../../core/markdown";
import type { CsnDefinition, CsnElement } from "../csn";
import type { Mapper, MapperContext } from "./context";
import { elementsSection, isAssociation, isToMany } from "./elements";
import { shownEntries } from "./visibility";
import { boundActionsSection } from "./operations";
import { generatedConcept } from "./concept-builder";
import { inheritedDoc, linkTo, titleOf } from "./shared";

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
    ...includesSection(definition, context),
    // Associations are listed in their own section, with links, so the table leaves them out.
    ...elementsSection(definition, context, true),
    ...associationsSection(definition, context),
    ...boundActionsSection(definition, context),
  ];
  return generatedConcept(name, definition, context, type, sections);
}

function docSection(doc: string | undefined): string[] {
  return doc === undefined ? [] : [escapeBlock(doc)];
}

// Only exported aspects are named: a concept never mentions one that isn't (task 2.6).
function includesSection(definition: CsnDefinition, context: MapperContext): string[] {
  const includes = (definition.includes ?? []).filter((name) => context.isExported(name));
  if (includes.length === 0) return [];
  return [`Includes: ${includes.map((name) => inlineCode(oneLine(name))).join(", ")}`];
}

function associationsSection(definition: CsnDefinition, context: MapperContext): string[] {
  const lines = shownEntries(definition.elements, context)
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
    isToMany(element) ? "to many" : "to one",
  ];
  return `- ${inlineCode(oneLine(name))} → ${link} (${details.join(", ")})`;
}
