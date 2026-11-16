// How elements, parameters and their types are written, for every mapper that shows them.
import { inlineCode, tableCell } from "../../core/markdown";
import type { CsnDefinition, CsnEnum, CsnElement, CsnTyped } from "../csn";
import type { MapperContext } from "./context";
import { linkTo } from "./shared";
import { shownEntries } from "./visibility";

/**
 * A table of elements or parameters, e.g. "| `title` | `String(150)` | mandatory |". The first
 * column is headed `firstColumn` ("Element", "Parameter", "Returned element").
 * With `withoutAssociations`, associations are left out because a list of them follows (entities,
 * aspects, events); everywhere else they stay in the table, e.g. "Association to [Countries](…)".
 */
export function elementsTable(
  firstColumn: string,
  elements: Record<string, CsnElement>,
  context: MapperContext,
  withoutAssociations = false,
): string | undefined {
  // Left out: rows marked @okf: false or referring to a definition that isn't exported (2.6).
  const rows = shownEntries(elements, context)
    .filter(([, element]) => !(withoutAssociations && isAssociation(element)))
    .map(([name, element]) => {
      const cells = [inlineCode(name), typeCell(element, context), notesOf(element)];
      return `| ${cells.map(tableCell).join(" | ")} |`;
    });
  if (rows.length === 0) return undefined;
  return [`| ${firstColumn} | Type | Notes |`, "| --- | --- | --- |", ...rows].join("\n");
}

/** "## Elements" with a definition's elements, or nothing when it has none. */
export function elementsSection(
  definition: CsnDefinition,
  context: MapperContext,
  withoutAssociations = false,
): string[] {
  const table = elementsTable("Element", definition.elements ?? {}, context, withoutAssociations);
  return table === undefined ? [] : [`## Elements\n\n${table}`];
}

export function isAssociation(element: CsnElement): boolean {
  return element.target !== undefined;
}

/** An association or composition to many: cardinality max "*" or above 1. */
export function isToMany(typed: CsnTyped): boolean {
  const max = typed.cardinality?.max;
  return max === "*" || (typeof max === "number" && max > 1);
}

/** A type's description: plain text shown as `code`, or Markdown that already has links. */
interface TypeText {
  text: string;
  isCode: boolean;
}

/**
 * A type as Markdown (maintainer decision for task 2.3: model types are links):
 * - a type defined in the model → a link to its concept, e.g. [Status](/model/x/Status.md);
 * - an association or composition → "Association to [Countries](…)", "Composition of many …";
 * - "cds.String" with length 150 → `String(150)`, "cds.Decimal" 9, 2 → `Decimal(9, 2)`;
 * - "type of Orders:status" → `x.Orders:status`; "many String" → `many String`;
 * - own elements without a type → `structured`; a custom type outside the model → its name.
 * Sizes show only on built-in types: inferred CSN copies them onto custom types too.
 */
export function typeCell(typed: CsnTyped, context: MapperContext): string {
  const { text, isCode } = describeType(typed, context);
  return isCode ? inlineCode(text) : text;
}

function describeType(typed: CsnTyped, context: MapperContext): TypeText {
  if (typed.target !== undefined || typed.targetAspect !== undefined) {
    return { text: relationText(typed, context), isCode: false };
  }
  if (typed.items !== undefined) {
    const item = describeType(typed.items, context);
    return { text: `many ${item.text}`, isCode: item.isCode };
  }
  const type = typed.type;
  if (type === undefined) return { text: "structured", isCode: true };
  if (typeof type !== "string") return { text: type.ref.join(":"), isCode: true };
  if (context.model.definitions[type] !== undefined) {
    return { text: linkTo(type, context), isCode: false };
  }
  return { text: builtInTypeText(type, typed), isCode: true };
}

// "Association to [Countries](…)", "Composition of many [Line](…)", "… many `structured`".
function relationText(typed: CsnTyped, context: MapperContext): string {
  const many = isToMany(typed) ? "many " : "";
  const how = typed.type === "cds.Composition" ? "Composition of" : "Association to";
  return `${how} ${many}${relationTarget(typed, context)}`;
}

function relationTarget(typed: CsnTyped, context: MapperContext): string {
  if (typed.target !== undefined) return linkTo(typed.target, context);
  // Only a composition of an aspect has no target: a named aspect, or one written inline.
  const aspect = typed.targetAspect;
  return typeof aspect === "string" ? linkTo(aspect, context) : inlineCode("structured");
}

// "cds.String" with length 150 → "String(150)"; a custom type outside the model keeps its name.
function builtInTypeText(type: string, typed: CsnTyped): string {
  if (!type.startsWith("cds.")) return type;
  const size = sizeOf(typed);
  const name = type.slice("cds.".length);
  return size === undefined ? name : `${name}(${size})`;
}

function sizeOf(typed: CsnTyped): string | undefined {
  if (typed.precision !== undefined) {
    return [typed.precision, typed.scale].filter((part) => part !== undefined).join(", ");
  }
  return typed.length === undefined ? undefined : String(typed.length);
}

/** Enum values, e.g. ["`open` = `\"O\"`", "`closed`"]: the stored value when it isn't the name. */
export function enumValues(values: CsnEnum): string[] {
  return Object.entries(values).map(([name, { val }]) =>
    val === undefined
      ? inlineCode(name)
      : `${inlineCode(name)} = ${inlineCode(JSON.stringify(val))}`,
  );
}

// "key", "mandatory", "default: 0", "localized", "virtual", "values: …", then the doc comment.
// A default that is an expression (e.g. $user, $now) is left out: only plain values are shown.
function notesOf(element: CsnElement): string {
  const notes: string[] = [];
  if (element.key) notes.push("key");
  if (element["@mandatory"] === true || element.notNull) notes.push("mandatory");
  if (element.default?.val !== undefined) {
    notes.push(`default: ${JSON.stringify(element.default.val)}`);
  }
  if (element.localized) notes.push("localized");
  if (element.virtual) notes.push("virtual");
  if (element.enum !== undefined) notes.push(`values: ${enumValues(element.enum).join(", ")}`);
  if (element.doc !== undefined) notes.push(element.doc);
  return notes.join("; ");
}
