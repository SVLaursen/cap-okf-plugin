// How elements, parameters and their types are written, for every mapper that shows them.
import { inlineCode, tableCell } from "../../core/markdown";
import type { CsnEnum, CsnElement, CsnTyped } from "../csn";
import type { MapperContext } from "./context";
import { linkTo } from "./shared";

/**
 * A table of elements or parameters, e.g. "| `title` | `String(150)` | mandatory |". The first
 * column is headed `firstColumn` ("Element", "Parameter", "Returned element"). Associations are
 * left to associationsSection; parameters have none.
 */
export function elementsTable(
  firstColumn: string,
  elements: Record<string, CsnElement>,
  context: MapperContext,
): string | undefined {
  const rows = Object.entries(elements)
    .filter(([, element]) => !isAssociation(element))
    .map(([name, element]) => {
      const cells = [inlineCode(name), typeCell(element, context), notesOf(element)];
      return `| ${cells.map(tableCell).join(" | ")} |`;
    });
  if (rows.length === 0) return undefined;
  return [`| ${firstColumn} | Type | Notes |`, "| --- | --- | --- |", ...rows].join("\n");
}

export function isAssociation(element: CsnElement): boolean {
  return element.target !== undefined;
}

/**
 * A type as Markdown (maintainer decision for task 2.3: model types are links):
 * - a type defined in the model → a link to its concept, e.g. [Status](/model/x/Status.md);
 * - "cds.String" with length 150 → `String(150)`, "cds.Decimal" 9, 2 → `Decimal(9, 2)`;
 * - "type of Orders:status" → `x.Orders:status`; "many String" → `many String`;
 * - own elements without a type → `structured`; a custom type outside the model → its name.
 * Sizes show only on built-in types: inferred CSN copies them onto custom types too.
 */
export function typeCell(typed: CsnTyped, context: MapperContext): string {
  if (typed.items !== undefined) {
    const item = typeCell(typed.items, context);
    // `String` → `many String`; a link stays a link after "many ".
    return item.startsWith("`") ? inlineCode(`many ${item.slice(1, -1)}`) : `many ${item}`;
  }
  const type = typed.type;
  if (type === undefined) return inlineCode("structured");
  if (typeof type !== "string") return inlineCode(type.ref.join(":"));
  if (context.model.definitions[type] !== undefined) return linkTo(type, context);
  if (!type.startsWith("cds.")) return inlineCode(type);
  const size = sizeOf(typed);
  const name = type.slice("cds.".length);
  return inlineCode(size === undefined ? name : `${name}(${size})`);
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
  if (element.default?.val !== undefined)
    notes.push(`default: ${JSON.stringify(element.default.val)}`);
  if (element.localized) notes.push("localized");
  if (element.virtual) notes.push("virtual");
  if (element.enum !== undefined) notes.push(`values: ${enumValues(element.enum).join(", ")}`);
  if (element.doc !== undefined) notes.push(element.doc);
  return notes.join("; ");
}
