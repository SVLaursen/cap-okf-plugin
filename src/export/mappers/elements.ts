// How elements, parameters and their types are written, for every mapper that shows them.
import { inlineCode, tableCell } from "../../core/markdown";
import type { CsnDefinition, CsnEnum, CsnElement, CsnTyped } from "../csn";
import type { MapperContext } from "./context";
import { linkTo, textSources } from "./shared";
import { oneLine } from "../../core/markdown";
import { elementOfRef, relationTarget, shownEntries } from "./visibility";

/**
 * A table of elements or parameters, e.g. "| `title` | `String(150)` | mandatory |". The first
 * column is headed `firstColumn` ("Element", "Parameter", "Returned element").
 * With `withoutAssociations`, associations are left out because a list of them follows (entities,
 * aspects, events); everywhere else they stay in the table, e.g. "Association to [Countries](…)".
 * `sources` are the definitions a projection is built on: an element without a description of
 * its own takes the one of the element with its name there (ADR-0012).
 */
export function elementsTable(
  firstColumn: string,
  elements: Record<string, CsnElement>,
  context: MapperContext,
  withoutAssociations = false,
  sources: readonly CsnDefinition[] = [],
): string | undefined {
  // Left out: rows marked @okf: false or referring to a definition that isn't exported (2.6).
  const rows = shownEntries(elements, context)
    .filter(([, element]) => !(withoutAssociations && isAssociation(element)))
    .map(([name, element]) => {
      const description = descriptionOf(name, element, context, sources);
      const cells = [inlineCode(name), typeCell(element, context), notesOf(element, description)];
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
  const sources = textSources(definition, context).slice(1);
  const elements = definition.elements ?? {};
  const table = elementsTable("Element", elements, context, withoutAssociations, sources);
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
  if (typeof type !== "string") return describeTypeOf(type.ref, context);
  const definition = context.model.definitions[type];
  if (definition === undefined) return { text: builtInTypeText(type, typed), isCode: true };
  if (context.isExported(type)) return { text: linkTo(type, context), isCode: false };
  return describeType(withSizesOf(typed, definition), context);
}

// "type of Orders:status": described as the element it points at, so the entity isn't named,
// e.g. `String(10)` or a link to an exported type.
function describeTypeOf(ref: string[], context: MapperContext): TypeText {
  const referenced = elementOfRef(ref, context.model);
  return referenced === undefined
    ? { text: "unknown", isCode: true }
    : describeType(referenced, context);
}

/**
 * An excluded type is shown as what it is based on (maintainer decision for task 2.6), never
 * named. Inferred CSN copies the sizes onto each element, so the element's own win.
 */
function withSizesOf(typed: CsnTyped, definition: CsnTyped): CsnTyped {
  return {
    ...definition,
    length: typed.length ?? definition.length,
    precision: typed.precision ?? definition.precision,
    scale: typed.scale ?? definition.scale,
  };
}

// "Association to [Countries](…)", "Composition of many [Line](…)", "… many `structured`".
function relationText(typed: CsnTyped, context: MapperContext): string {
  const many = isToMany(typed) ? "many " : "";
  const how = typed.type === "cds.Composition" ? "Composition of" : "Association to";
  // A composition of an aspect written inline has neither a target nor an aspect name.
  const target = relationTarget(typed);
  return `${how} ${many}${target === undefined ? inlineCode("structured") : linkTo(target, context)}`;
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

/**
 * An element's or parameter's description: its @description, else its doc comment, else (for a
 * projection) those of the element with the same name down the source chain.
 */
export function descriptionOf(
  name: string,
  element: CsnElement,
  context: MapperContext,
  sources: readonly CsnDefinition[] = [],
): string | undefined {
  for (const each of [element, ...sources.map((source) => source.elements?.[name])]) {
    if (each === undefined) continue;
    const description = each["@description"];
    if (typeof description === "string" && description.trim() !== "") {
      return oneLine(context.text(description));
    }
    if (each.doc !== undefined && each.doc !== null) return each.doc;
  }
  return undefined;
}

// "key", "mandatory", "default: 0", "localized", "virtual", "values: …", then the description.
// A default that is an expression (e.g. $user, $now) is left out: only plain values are shown.
function notesOf(element: CsnElement, description: string | undefined): string {
  const notes: string[] = [];
  if (element.key) notes.push("key");
  if (element["@mandatory"] === true || element.notNull) notes.push("mandatory");
  if (element.default?.val !== undefined) {
    notes.push(`default: ${JSON.stringify(element.default.val)}`);
  }
  if (element.localized) notes.push("localized");
  if (element.virtual) notes.push("virtual");
  if (element.enum !== undefined) notes.push(`values: ${enumValues(element.enum).join(", ")}`);
  if (description !== undefined) notes.push(description);
  return notes.join("; ");
}
