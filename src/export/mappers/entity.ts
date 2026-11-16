// Entities: one concept per entity, with its elements and its associations as links.
// Authorization annotations are left out on purpose: they only go into the marked section that
// task 2.4 adds (ADR-0003).
import type { CsnDefinition, CsnElement } from "../csn";
import { conceptLinkFor, conceptPathFor } from "../paths";
import type { Mapper, MapperContext } from "./context";
import { baseFrontmatter, shortName, tableCell, titleOf } from "./shared";

export const entityMapper: Mapper = {
  kind: "entity",
  map(name, definition, context) {
    const path = conceptPathFor(name);
    const frontmatter = baseFrontmatter(name, definition, context, "Entity");
    const sections = [
      `# ${frontmatter["title"] as string}`,
      ...docSection(definition),
      ...includesSection(definition),
      ...elementsSection(definition),
      ...associationsSection(definition, context),
    ];
    return {
      path,
      id: path.replace(/\.md$/, ""),
      frontmatter,
      // A blank line between the frontmatter and the first heading, and one newline at the end.
      body: `\n${sections.join("\n\n")}\n`,
    };
  },
};

function docSection(definition: CsnDefinition): string[] {
  return definition.doc === undefined ? [] : [definition.doc];
}

function includesSection(definition: CsnDefinition): string[] {
  const includes = definition.includes ?? [];
  if (includes.length === 0) return [];
  return [`Includes: ${includes.map((name) => `\`${name}\``).join(", ")}`];
}

// Associations and compositions are listed in their own section, with links.
function elementsSection(definition: CsnDefinition): string[] {
  const rows = Object.entries(definition.elements ?? {})
    .filter(([, element]) => !isAssociation(element))
    .map(([name, element]) => `| \`${name}\` | \`${typeOf(element)}\` | ${notesOf(element)} |`);
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
  const kind = element.type === "cds.Composition" ? "composition, " : "";
  return `- \`${name}\` → [${title}](${conceptLinkFor(target)}) (${kind}${toManyOrOne(element)})`;
}

function toManyOrOne(element: CsnElement): string {
  const max = element.cardinality?.max;
  return max === "*" || (typeof max === "number" && max > 1) ? "to many" : "to one";
}

// "cds.String" with length 150 → "String(150)"; "cds.Decimal" 9, 2 → "Decimal(9, 2)".
// Built-in types lose their "cds." prefix; custom types keep their name.
function typeOf(element: CsnElement): string {
  const type = element.type ?? "structured";
  const name = type.startsWith("cds.") ? type.slice("cds.".length) : type;
  const size =
    element.precision === undefined
      ? element.length
      : [element.precision, element.scale].filter((part) => part !== undefined).join(", ");
  return size === undefined ? name : `${name}(${size})`;
}

// "key", "mandatory", "default: 0", "localized", "virtual", then the doc comment.
function notesOf(element: CsnElement): string {
  const notes: string[] = [];
  if (element.key) notes.push("key");
  if (element["@mandatory"] === true || element.notNull) notes.push("mandatory");
  if (element.default?.val !== undefined)
    notes.push(`default: ${JSON.stringify(element.default.val)}`);
  if (element.localized) notes.push("localized");
  if (element.virtual) notes.push("virtual");
  if (element.doc !== undefined) notes.push(element.doc);
  return tableCell(notes.join("; "));
}
