// Entities: one concept per entity, with its elements and its associations as links.
// Authorization annotations are left out on purpose: they only go into the marked section that
// task 2.4 adds (ADR-0003). Every text from the model is escaped before it goes into Markdown.
import { conceptId } from "../../core/concept";
import { escapeHtml, escapeLinkText, inlineCode, oneLine, tableCell } from "../../core/markdown";
import type { CsnDefinition, CsnElement } from "../csn";
import { conceptLinkFor, conceptPathFor } from "../paths";
import type { Mapper, MapperContext } from "./context";
import { baseFrontmatter, shortName, titleOf } from "./shared";

export const entityMapper: Mapper = {
  kind: "entity",
  map(name, definition, context) {
    const path = conceptPathFor(name);
    const sections = [
      `# ${escapeHtml(titleOf(name, definition, context))}`,
      ...docSection(definition),
      ...includesSection(definition),
      ...elementsSection(definition),
      ...associationsSection(definition, context),
    ];
    return {
      path,
      id: conceptId(path),
      frontmatter: baseFrontmatter(name, definition, context, "Entity"),
      // A blank line between the frontmatter and the first heading, and one newline at the end.
      body: `\n${sections.join("\n\n")}\n`,
    };
  },
};

// The doc comment keeps its own lines and Markdown, but no HTML (see escapeHtml).
function docSection(definition: CsnDefinition): string[] {
  return definition.doc === undefined ? [] : [escapeHtml(definition.doc)];
}

function includesSection(definition: CsnDefinition): string[] {
  const includes = definition.includes ?? [];
  if (includes.length === 0) return [];
  return [`Includes: ${includes.map((name) => inlineCode(oneLine(name))).join(", ")}`];
}

// Associations and compositions are listed in their own section, with links.
function elementsSection(definition: CsnDefinition): string[] {
  const rows = Object.entries(definition.elements ?? {})
    .filter(([, element]) => !isAssociation(element))
    .map(([name, element]) => {
      const cells = [inlineCode(name), inlineCode(typeOf(element)), notesOf(element)];
      return `| ${cells.map(tableCell).join(" | ")} |`;
    });
  if (rows.length === 0) return [];
  return [
    ["## Elements", "", "| Element | Type | Notes |", "| --- | --- | --- |", ...rows].join("\n"),
  ];
}

function associationsSection(definition: CsnDefinition, context: MapperContext): string[] {
  const lines = Object.entries(definition.elements ?? {})
    .filter(([, element]) => isAssociation(element))
    .map(([name, element]) => associationLine(name, element, context));
  if (lines.length === 0) return [];
  return [["## Associations", "", ...lines].join("\n")];
}

function isAssociation(element: CsnElement): boolean {
  return element.target !== undefined;
}

// "- `author` → [Authors](/model/sample/bookshop/Authors.md) (to one)"
function associationLine(name: string, element: CsnElement, context: MapperContext): string {
  const target = element.target!;
  const targetDefinition = context.model.definitions[target];
  const title = targetDefinition ? titleOf(target, targetDefinition, context) : shortName(target);
  const link = `[${escapeLinkText(escapeHtml(title))}](${conceptLinkFor(target)})`;
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

/**
 * The element's type as written in CDS:
 * - "cds.String" with length 150 → "String(150)", "cds.Decimal" 9, 2 → "Decimal(9, 2)";
 * - a custom type keeps its name, without sizes: inferred CSN copies them onto it;
 * - "type of Orders:status" → "x.Orders:status";
 * - "many String" → "many String"; an element with its own elements → "structured".
 */
function typeOf(element: CsnElement): string {
  if (element.items !== undefined) return `many ${typeOf(element.items)}`;
  const type = element.type;
  if (type === undefined) return "structured";
  if (typeof type !== "string") return type.ref.join(":");
  if (!type.startsWith("cds.")) return type;
  const name = type.slice("cds.".length);
  const size = sizeOf(element);
  return size === undefined ? name : `${name}(${size})`;
}

function sizeOf(element: CsnElement): string | undefined {
  if (element.precision !== undefined) {
    return [element.precision, element.scale].filter((part) => part !== undefined).join(", ");
  }
  return element.length === undefined ? undefined : String(element.length);
}

// "key", "mandatory", "default: 0", "localized", "virtual", then the doc comment.
// A default that is an expression (e.g. $user, $now) is left out: only plain values are shown.
function notesOf(element: CsnElement): string {
  const notes: string[] = [];
  if (element.key) notes.push("key");
  if (element["@mandatory"] === true || element.notNull) notes.push("mandatory");
  if (element.default?.val !== undefined)
    notes.push(`default: ${JSON.stringify(element.default.val)}`);
  if (element.localized) notes.push("localized");
  if (element.virtual) notes.push("virtual");
  if (element.doc !== undefined) notes.push(element.doc);
  return notes.join("; ");
}
